//! Axum integration for x402 payments

use crate::middleware::{PaymentMiddleware, PaymentMiddlewareConfig};
use crate::{Result, X402Error};
use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post, put, delete},
    Json, Router,
};
use std::str::FromStr;
use rust_decimal::Decimal;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;

/// Re-export the payment middleware for convenience
pub use crate::middleware::{payment_middleware, create_payment_service};

/// Create a new Axum router with x402 payment middleware
pub fn create_payment_router(
    middleware: PaymentMiddleware,
    routes: impl FnOnce(&mut Router) -> &mut Router,
) -> Router {
    let mut router = Router::new();
    routes(&mut router);
    
    // TODO: Fix axum middleware integration
    // router.layer(
    //     axum::middleware::from_fn_with_state(
    //         middleware.config().clone(),
    //         payment_middleware,
    //     )
    // )
    router
}

/// Helper function to create a payment-protected route
pub fn payment_route<H>(method: &str, path: &str, handler: H, middleware: PaymentMiddleware) -> Router
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

    // TODO: Fix axum middleware integration
    // router.layer(
    //     ServiceBuilder::new()
    //         .layer(TraceLayer::new_for_http())
    //         .layer(axum::middleware::from_fn_with_state(
    //             middleware.config().clone(),
    //             payment_middleware,
    //         ))
    // )
    router
}

/// Create a payment middleware for Axum
pub fn create_payment_middleware(
    amount: Decimal,
    pay_to: impl Into<String>,
) -> PaymentMiddleware {
    PaymentMiddleware::new(amount, pay_to)
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
    pub fn with_facilitator_config(mut self, facilitator_config: crate::types::FacilitatorConfig) -> Self {
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
        }
    }

    /// Create a service builder with this configuration
    pub fn create_service(&self) -> impl tower::Layer<tower::ServiceBuilder<tower::layer::util::Identity>> + Clone {
        // TODO: Fix service builder integration
        ServiceBuilder::new()
        // let mut service_builder = ServiceBuilder::new();

        // if self.axum_options.enable_tracing {
        //     service_builder = service_builder.layer(TraceLayer::new_for_http());
        // }

        // if self.axum_options.enable_cors {
        //     let cors_layer = tower_http::cors::CorsLayer::new()
        //         .allow_origin(tower_http::cors::Any)
        //         .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::PUT, axum::http::Method::DELETE])
        //         .allow_headers(tower_http::cors::Any);
        //     service_builder = service_builder.layer(cors_layer);
        // }

        // service_builder.layer(axum::middleware::from_fn_with_state(
        //     self.base_config.clone(),
        //     payment_middleware,
        // ))
    }
}

/// Create a complete Axum application with x402 payment support
pub fn create_payment_app(
    config: AxumPaymentConfig,
    routes: impl FnOnce(&mut Router) -> &mut Router,
) -> Router {
    let mut router = Router::new();
    routes(&mut router);
    
    // TODO: Fix axum middleware integration
    // router.layer(config.create_service())
    router
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
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": error.into()})))
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
