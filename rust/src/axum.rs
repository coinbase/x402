//! Axum integration for x402 payments

use crate::middleware::{PaymentMiddleware, PaymentMiddlewareConfig};
use crate::X402Error;
use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use rust_decimal::Decimal;
use std::sync::Arc;
use tower::ServiceBuilder;

/// Re-export the payment middleware for convenience
pub use crate::middleware::{create_payment_service, payment_middleware};

/// Create a new Axum router with x402 payment middleware
pub fn create_payment_router(
    middleware: PaymentMiddleware,
    routes: impl FnOnce(&mut Router) -> &mut Router,
) -> Router {
    let mut router = Router::new();
    routes(&mut router);

    // Apply payment middleware to all routes
    router.layer(axum::middleware::from_fn_with_state(
        middleware,
        payment_middleware_handler,
    ))
}

/// Helper function to create a payment-protected route
pub fn payment_route<H>(
    method: &str,
    path: &str,
    handler: H,
    middleware: PaymentMiddleware,
) -> Router
where
    H: axum::handler::Handler<(), ()> + Clone + Send + 'static,
{
    let router = match method.to_uppercase().as_str() {
        "GET" => Router::new().route(path, get(handler)),
        "POST" => Router::new().route(path, post(handler)),
        "PUT" => Router::new().route(path, put(handler)),
        "DELETE" => Router::new().route(path, delete(handler)),
        _ => panic!("Unsupported HTTP method: {}", method),
    };

    // Apply payment middleware
    router.layer(axum::middleware::from_fn_with_state(
        middleware,
        payment_middleware_handler,
    ))
}

/// Create a payment middleware for Axum
pub fn create_payment_middleware(amount: Decimal, pay_to: impl Into<String>) -> PaymentMiddleware {
    PaymentMiddleware::new(amount, pay_to)
}

/// Check if the request is from a web browser
fn is_web_browser(headers: &HeaderMap) -> bool {
    let user_agent = headers
        .get("User-Agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    let accept = headers
        .get("Accept")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    accept.contains("text/html") && user_agent.contains("Mozilla")
}

/// Get default paywall HTML
fn get_default_paywall_html() -> &'static str {
    r#"<!DOCTYPE html>
<html>
<head>
    <title>Payment Required</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .container { max-width: 500px; margin: 0 auto; }
        h1 { color: #333; }
        p { color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Payment Required</h1>
        <p>This resource requires payment to access. Please provide a valid X-PAYMENT header.</p>
    </div>
</body>
</html>"#
}

/// Axum middleware handler for payment processing with settlement
pub async fn payment_middleware_handler(
    State(middleware): State<PaymentMiddleware>,
    request: Request,
    next: Next,
) -> impl IntoResponse {
    let config = middleware.config().clone();
    let headers = request.headers().clone();

    // Determine the resource URL
    let resource = if let Some(ref resource_url) = config.resource {
        resource_url.clone()
    } else if let Some(ref root_url) = config.resource_root_url {
        format!("{}{}", root_url, request.uri().path())
    } else {
        request.uri().path().to_string()
    };

    // Create payment requirements
    let requirements = match config.create_payment_requirements(&resource) {
        Ok(req) => req,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to create payment requirements",
                    "x402Version": 1
                })),
            )
                .into_response();
        }
    };

    // Check for payment header
    if let Some(payment_header) = headers.get("X-PAYMENT") {
        if let Ok(payment_str) = payment_header.to_str() {
            // Parse the payment payload
            match crate::types::PaymentPayload::from_base64(payment_str) {
                Ok(payment_payload) => {
                    // Verify the payment using the middleware's verify method
                    match middleware
                        .verify_with_requirements(&payment_payload, &requirements)
                        .await
                    {
                        Ok(true) => {
                            // Payment is valid, proceed to next handler
                            let mut response = next.run(request).await;

                            // After successful response, settle the payment
                            match middleware
                                .settle_with_requirements(&payment_payload, &requirements)
                                .await
                            {
                                Ok(settlement_response) => {
                                    if let Ok(settlement_header) = settlement_response.to_base64() {
                                        if let Ok(header_value) =
                                            HeaderValue::from_str(&settlement_header)
                                        {
                                            response
                                                .headers_mut()
                                                .insert("X-PAYMENT-RESPONSE", header_value);
                                        }
                                    }
                                }
                                Err(e) => {
                                    // Log settlement error but don't fail the request
                                    tracing::warn!("Payment settlement failed: {}", e);
                                }
                            }

                            return response;
                        }
                        Ok(false) => {
                            // Payment verification failed
                            let response_body = serde_json::json!({
                                "x402Version": 1,
                                "error": "Payment verification failed",
                                "accepts": vec![requirements],
                            });
                            return (StatusCode::PAYMENT_REQUIRED, Json(response_body))
                                .into_response();
                        }
                        Err(e) => {
                            // Error during verification
                            let response_body = serde_json::json!({
                                "x402Version": 1,
                                "error": format!("Payment verification error: {}", e),
                                "accepts": vec![requirements],
                            });
                            return (StatusCode::PAYMENT_REQUIRED, Json(response_body))
                                .into_response();
                        }
                    }
                }
                Err(e) => {
                    // Invalid payment payload
                    let response_body = serde_json::json!({
                        "x402Version": 1,
                        "error": format!("Invalid payment payload: {}", e),
                        "accepts": vec![requirements],
                    });
                    return (StatusCode::PAYMENT_REQUIRED, Json(response_body)).into_response();
                }
            }
        }
    }

    // No valid payment found, check if this is a web browser request
    if is_web_browser(&headers) {
        let html = config
            .custom_paywall_html
            .clone()
            .unwrap_or_else(|| get_default_paywall_html().to_string());

        let mut response = Response::new(axum::body::Body::from(html));
        *response.status_mut() = StatusCode::PAYMENT_REQUIRED;
        response
            .headers_mut()
            .insert("Content-Type", HeaderValue::from_static("text/html"));

        return response.into_response();
    }

    // Return JSON response for API clients
    let response_body = serde_json::json!({
        "x402Version": 1,
        "error": "X-PAYMENT header is required",
        "accepts": vec![requirements],
    });

    (StatusCode::PAYMENT_REQUIRED, Json(response_body)).into_response()
}

/// Axum-specific payment middleware configuration
#[derive(Debug, Clone)]
pub struct AxumPaymentConfig {
    /// Base payment middleware config
    pub base_config: PaymentMiddlewareConfig,
    /// Additional Axum-specific options
    pub axum_options: AxumOptions,
}

/// Axum-specific options
#[derive(Clone, Default)]
pub struct AxumOptions {
    /// Whether to enable CORS
    pub enable_cors: bool,
    /// CORS origins
    pub cors_origins: Vec<String>,
    /// Whether to enable request tracing
    pub enable_tracing: bool,
    /// Custom error handler
    pub error_handler: Option<Arc<dyn Fn(X402Error) -> StatusCode + Send + Sync>>,
}

impl std::fmt::Debug for AxumOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AxumOptions")
            .field("enable_cors", &self.enable_cors)
            .field("cors_origins", &self.cors_origins)
            .field("enable_tracing", &self.enable_tracing)
            .field("error_handler", &"<function>")
            .finish()
    }
}

impl AxumPaymentConfig {
    /// Create a new Axum payment config
    pub fn new(amount: Decimal, pay_to: impl Into<String>) -> Self {
        Self {
            base_config: PaymentMiddlewareConfig::new(amount, pay_to),
            axum_options: AxumOptions::default(),
        }
    }

    /// Set the payment description
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.base_config.description = Some(description.into());
        self
    }

    /// Set the MIME type
    pub fn with_mime_type(mut self, mime_type: impl Into<String>) -> Self {
        self.base_config.mime_type = Some(mime_type.into());
        self
    }

    /// Set the maximum timeout
    pub fn with_max_timeout_seconds(mut self, max_timeout_seconds: u32) -> Self {
        self.base_config.max_timeout_seconds = max_timeout_seconds;
        self
    }

    /// Set the output schema
    pub fn with_output_schema(mut self, output_schema: serde_json::Value) -> Self {
        self.base_config.output_schema = Some(output_schema);
        self
    }

    /// Set the facilitator configuration
    pub fn with_facilitator_config(
        mut self,
        facilitator_config: crate::types::FacilitatorConfig,
    ) -> Self {
        self.base_config.facilitator_config = facilitator_config;
        self
    }

    /// Set whether this is a testnet
    pub fn with_testnet(mut self, testnet: bool) -> Self {
        self.base_config.testnet = testnet;
        self
    }

    /// Set custom paywall HTML
    pub fn with_custom_paywall_html(mut self, html: impl Into<String>) -> Self {
        self.base_config.custom_paywall_html = Some(html.into());
        self
    }

    /// Set the resource URL
    pub fn with_resource(mut self, resource: impl Into<String>) -> Self {
        self.base_config.resource = Some(resource.into());
        self
    }

    /// Set the resource root URL
    pub fn with_resource_root_url(mut self, url: impl Into<String>) -> Self {
        self.base_config.resource_root_url = Some(url.into());
        self
    }

    /// Enable CORS
    pub fn with_cors(mut self, origins: Vec<String>) -> Self {
        self.axum_options.enable_cors = true;
        self.axum_options.cors_origins = origins;
        self
    }

    /// Enable request tracing
    pub fn with_tracing(mut self) -> Self {
        self.axum_options.enable_tracing = true;
        self
    }

    /// Set custom error handler
    pub fn with_error_handler<F>(mut self, handler: F) -> Self
    where
        F: Fn(X402Error) -> StatusCode + Send + Sync + 'static,
    {
        self.axum_options.error_handler = Some(Arc::new(handler));
        self
    }

    /// Convert to PaymentMiddleware
    pub fn into_middleware(self) -> PaymentMiddleware {
        PaymentMiddleware {
            config: Arc::new(self.base_config),
            facilitator: None,
            template_config: None,
        }
    }

    /// Create a service builder with this configuration
    pub fn create_service(&self) -> ServiceBuilder<tower::layer::util::Identity> {
        // Note: Service layer integration is simplified for now
        // In a full implementation, you would conditionally add layers based on options
        ServiceBuilder::new()
    }
}

/// Create a complete Axum application with x402 payment support
pub fn create_payment_app(
    config: AxumPaymentConfig,
    routes: impl FnOnce(Router) -> Router,
) -> Router {
    let router = Router::new();
    let router = routes(router);

    // Apply service layers
    router.layer(config.create_service())
}

/// Helper for creating payment-protected handlers
pub mod handlers {
    use super::*;
    use serde_json::json;

    /// Create a simple JSON response handler
    pub fn json_response<T: serde::Serialize>(data: T) -> impl IntoResponse {
        Json(data)
    }

    /// Create a simple text response handler
    pub fn text_response(text: impl Into<String>) -> impl IntoResponse {
        text.into()
    }

    /// Create an error response handler
    pub fn error_response(error: impl Into<String>) -> impl IntoResponse {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": error.into()})),
        )
    }

    /// Create a success response handler
    pub fn success_response<T: serde::Serialize>(data: T) -> impl IntoResponse {
        (StatusCode::OK, Json(data))
    }
}

/// Example handlers for common use cases
pub mod examples {
    use super::*;
    use serde_json::json;

    /// Example joke handler
    pub async fn joke_handler() -> impl IntoResponse {
        axum::Json(json!({
            "joke": "Why do programmers prefer dark mode? Because light attracts bugs!"
        }))
    }

    /// Example API data handler
    pub async fn api_data_handler() -> impl IntoResponse {
        axum::Json(json!({
            "data": "This is premium API data that requires payment to access",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source": "x402-protected-api"
        }))
    }

    /// Example file download handler
    pub async fn download_handler() -> impl IntoResponse {
        let content = "This is premium content that requires payment to download.";
        (StatusCode::OK, content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_axum_payment_config() {
        let config = AxumPaymentConfig::new(
            Decimal::from_str("0.0001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        )
        .with_description("Test payment")
        .with_testnet(true)
        .with_cors(vec!["http://localhost:3000".to_string()])
        .with_tracing();

        assert_eq!(
            config.base_config.amount,
            Decimal::from_str("0.0001").unwrap()
        );
        assert!(config.axum_options.enable_cors);
        assert!(config.axum_options.enable_tracing);
    }

    #[test]
    fn test_payment_middleware_creation() {
        let middleware = create_payment_middleware(
            Decimal::from_str("0.0001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        );

        assert_eq!(
            middleware.config().amount,
            Decimal::from_str("0.0001").unwrap()
        );
    }
}
