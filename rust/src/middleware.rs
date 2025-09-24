//! Middleware implementations for web frameworks

use crate::types::{Network, *};
use crate::{Result, X402Error};
use axum::{
    extract::{Request, State},
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use rust_decimal::Decimal;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;

/// Configuration for payment middleware
#[derive(Debug, Clone)]
pub struct PaymentMiddlewareConfig {
    /// Payment amount in decimal units (e.g., 0.0001 for 1/10th of a cent)
    pub amount: Decimal,
    /// Recipient wallet address
    pub pay_to: String,
    /// Payment description
    pub description: Option<String>,
    /// MIME type of the expected response
    pub mime_type: Option<String>,
    /// Maximum timeout in seconds
    pub max_timeout_seconds: u32,
    /// JSON schema for response format
    pub output_schema: Option<serde_json::Value>,
    /// Facilitator configuration
    pub facilitator_config: FacilitatorConfig,
    /// Whether this is a testnet
    pub testnet: bool,
    /// Custom paywall HTML for web browsers
    pub custom_paywall_html: Option<String>,
    /// Resource URL (if different from request URL)
    pub resource: Option<String>,
    /// Resource root URL for constructing full resource URLs
    pub resource_root_url: Option<String>,
}

impl PaymentMiddlewareConfig {
    /// Create a new payment middleware config
    pub fn new(amount: Decimal, pay_to: impl Into<String>) -> Self {
        Self {
            amount,
            pay_to: pay_to.into(),
            description: None,
            mime_type: None,
            max_timeout_seconds: 60,
            output_schema: None,
            facilitator_config: FacilitatorConfig::default(),
            testnet: true,
            custom_paywall_html: None,
            resource: None,
            resource_root_url: None,
        }
    }

    /// Set the payment description
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the MIME type
    pub fn with_mime_type(mut self, mime_type: impl Into<String>) -> Self {
        self.mime_type = Some(mime_type.into());
        self
    }

    /// Set the maximum timeout
    pub fn with_max_timeout_seconds(mut self, max_timeout_seconds: u32) -> Self {
        self.max_timeout_seconds = max_timeout_seconds;
        self
    }

    /// Set the output schema
    pub fn with_output_schema(mut self, output_schema: serde_json::Value) -> Self {
        self.output_schema = Some(output_schema);
        self
    }

    /// Set the facilitator configuration
    pub fn with_facilitator_config(mut self, facilitator_config: FacilitatorConfig) -> Self {
        self.facilitator_config = facilitator_config;
        self
    }

    /// Set whether this is a testnet
    pub fn with_testnet(mut self, testnet: bool) -> Self {
        self.testnet = testnet;
        self
    }

    /// Set custom paywall HTML
    pub fn with_custom_paywall_html(mut self, html: impl Into<String>) -> Self {
        self.custom_paywall_html = Some(html.into());
        self
    }

    /// Set the resource URL
    pub fn with_resource(mut self, resource: impl Into<String>) -> Self {
        self.resource = Some(resource.into());
        self
    }

    /// Set the resource root URL
    pub fn with_resource_root_url(mut self, url: impl Into<String>) -> Self {
        self.resource_root_url = Some(url.into());
        self
    }

    /// Create payment requirements from this config
    pub fn create_payment_requirements(&self, request_uri: &str) -> Result<PaymentRequirements> {
        let network = if self.testnet {
            networks::BASE_SEPOLIA
        } else {
            networks::BASE_MAINNET
        };

        let usdc_address =
            networks::get_usdc_address(network).ok_or_else(|| X402Error::NetworkNotSupported {
                network: network.to_string(),
            })?;

        let resource = if let Some(ref resource_url) = self.resource {
            resource_url.clone()
        } else if let Some(ref root_url) = self.resource_root_url {
            format!("{}{}", root_url, request_uri)
        } else {
            request_uri.to_string()
        };

        let max_amount_required = (self.amount * Decimal::from(1_000_000u64))
            .normalize()
            .to_string();

        let mut requirements = PaymentRequirements::new(
            schemes::EXACT,
            network,
            max_amount_required,
            usdc_address,
            &self.pay_to,
            resource,
            self.description.as_deref().unwrap_or("Payment required"),
        );

        requirements.mime_type = self.mime_type.clone();
        requirements.output_schema = self.output_schema.clone();
        requirements.max_timeout_seconds = self.max_timeout_seconds;

        let network = if self.testnet {
            Network::Testnet
        } else {
            Network::Mainnet
        };
        requirements.set_usdc_info(network)?;

        Ok(requirements)
    }
}

/// Axum middleware for x402 payments
#[derive(Debug, Clone)]
pub struct PaymentMiddleware {
    pub config: Arc<PaymentMiddlewareConfig>,
    pub facilitator: Option<crate::facilitator::FacilitatorClient>,
    pub template_config: Option<crate::template::PaywallConfig>,
}

/// Payment processing result
#[derive(Debug)]
pub enum PaymentResult {
    /// Payment verified and settled successfully
    Success {
        response: axum::response::Response,
        settlement: crate::types::SettleResponse,
    },
    /// Payment required (402 response)
    PaymentRequired { response: axum::response::Response },
    /// Payment verification failed
    VerificationFailed { response: axum::response::Response },
    /// Payment settlement failed
    SettlementFailed { response: axum::response::Response },
}

impl PaymentMiddleware {
    /// Create a new payment middleware
    pub fn new(amount: Decimal, pay_to: impl Into<String>) -> Self {
        Self {
            config: Arc::new(PaymentMiddlewareConfig::new(amount, pay_to)),
            facilitator: None,
            template_config: None,
        }
    }

    /// Set the payment description
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        Arc::make_mut(&mut self.config).description = Some(description.into());
        self
    }

    /// Set the MIME type
    pub fn with_mime_type(mut self, mime_type: impl Into<String>) -> Self {
        Arc::make_mut(&mut self.config).mime_type = Some(mime_type.into());
        self
    }

    /// Set the maximum timeout
    pub fn with_max_timeout_seconds(mut self, max_timeout_seconds: u32) -> Self {
        Arc::make_mut(&mut self.config).max_timeout_seconds = max_timeout_seconds;
        self
    }

    /// Set the output schema
    pub fn with_output_schema(mut self, output_schema: serde_json::Value) -> Self {
        Arc::make_mut(&mut self.config).output_schema = Some(output_schema);
        self
    }

    /// Set the facilitator configuration
    pub fn with_facilitator_config(mut self, facilitator_config: FacilitatorConfig) -> Self {
        Arc::make_mut(&mut self.config).facilitator_config = facilitator_config;
        self
    }

    /// Set whether this is a testnet
    pub fn with_testnet(mut self, testnet: bool) -> Self {
        Arc::make_mut(&mut self.config).testnet = testnet;
        self
    }

    /// Set custom paywall HTML
    pub fn with_custom_paywall_html(mut self, html: impl Into<String>) -> Self {
        Arc::make_mut(&mut self.config).custom_paywall_html = Some(html.into());
        self
    }

    /// Set the resource URL
    pub fn with_resource(mut self, resource: impl Into<String>) -> Self {
        Arc::make_mut(&mut self.config).resource = Some(resource.into());
        self
    }

    /// Set the resource root URL
    pub fn with_resource_root_url(mut self, url: impl Into<String>) -> Self {
        Arc::make_mut(&mut self.config).resource_root_url = Some(url.into());
        self
    }

    /// Get the middleware configuration
    pub fn config(&self) -> &PaymentMiddlewareConfig {
        &self.config
    }

    /// Set the facilitator client
    pub fn with_facilitator(mut self, facilitator: crate::facilitator::FacilitatorClient) -> Self {
        self.facilitator = Some(facilitator);
        self
    }

    /// Set the template configuration
    pub fn with_template_config(mut self, template_config: crate::template::PaywallConfig) -> Self {
        self.template_config = Some(template_config);
        self
    }

    /// Verify a payment payload
    pub async fn verify(&self, payment_payload: &PaymentPayload) -> bool {
        // Create facilitator if not already configured
        let facilitator = if let Some(facilitator) = &self.facilitator {
            facilitator.clone()
        } else {
            match crate::facilitator::FacilitatorClient::new(self.config.facilitator_config.clone())
            {
                Ok(facilitator) => facilitator,
                Err(_) => return false,
            }
        };

        if let Ok(requirements) = self.config.create_payment_requirements("/") {
            if let Ok(response) = facilitator.verify(payment_payload, &requirements).await {
                return response.is_valid;
            }
        }
        false
    }

    /// Settle a payment
    pub async fn settle(&self, payment_payload: &PaymentPayload) -> crate::Result<SettleResponse> {
        // Create facilitator if not already configured
        let facilitator = if let Some(facilitator) = &self.facilitator {
            facilitator.clone()
        } else {
            crate::facilitator::FacilitatorClient::new(self.config.facilitator_config.clone())?
        };

        let requirements = self.config.create_payment_requirements("/")?;
        facilitator.settle(payment_payload, &requirements).await
    }

    /// Verify payment with specific requirements
    pub async fn verify_with_requirements(
        &self,
        payment_payload: &PaymentPayload,
        requirements: &PaymentRequirements,
    ) -> crate::Result<bool> {
        let facilitator = if let Some(facilitator) = &self.facilitator {
            facilitator.clone()
        } else {
            crate::facilitator::FacilitatorClient::new(self.config.facilitator_config.clone())?
        };

        let response = facilitator.verify(payment_payload, requirements).await?;
        Ok(response.is_valid)
    }

    /// Settle payment with specific requirements
    pub async fn settle_with_requirements(
        &self,
        payment_payload: &PaymentPayload,
        requirements: &PaymentRequirements,
    ) -> crate::Result<SettleResponse> {
        let facilitator = if let Some(facilitator) = &self.facilitator {
            facilitator.clone()
        } else {
            crate::facilitator::FacilitatorClient::new(self.config.facilitator_config.clone())?
        };

        facilitator.settle(payment_payload, requirements).await
    }

    /// Process payment with unified flow
    pub async fn process_payment(
        &self,
        request: Request,
        next: Next,
    ) -> crate::Result<PaymentResult> {
        let headers = request.headers();
        let uri = request.uri().to_string();

        // Check if this is a web browser request
        let user_agent = headers
            .get("User-Agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let accept = headers
            .get("Accept")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let is_web_browser = accept.contains("text/html") && user_agent.contains("Mozilla");

        // Create payment requirements
        let payment_requirements = self.config.create_payment_requirements(&uri)?;

        // Check for payment header
        let payment_header = headers.get("X-PAYMENT").and_then(|v| v.to_str().ok());

        match payment_header {
            Some(payment_b64) => {
                // Decode payment payload
                let payment_payload = PaymentPayload::from_base64(payment_b64).map_err(|e| {
                    X402Error::invalid_payment_payload(format!("Failed to decode payment: {}", e))
                })?;

                // Get facilitator client
                let facilitator = if let Some(facilitator) = &self.facilitator {
                    facilitator.clone()
                } else {
                    crate::facilitator::FacilitatorClient::new(
                        self.config.facilitator_config.clone(),
                    )?
                };

                // Verify payment
                let verify_response = facilitator
                    .verify(&payment_payload, &payment_requirements)
                    .await
                    .map_err(|e| {
                        X402Error::facilitator_error(format!("Payment verification failed: {}", e))
                    })?;

                if !verify_response.is_valid {
                    let error_response = self.create_payment_required_response(
                        "Payment verification failed",
                        &payment_requirements,
                        is_web_browser,
                    )?;
                    return Ok(PaymentResult::VerificationFailed {
                        response: error_response,
                    });
                }

                // Execute the handler
                let mut response = next.run(request).await;

                // Settle the payment
                let settle_response = facilitator
                    .settle(&payment_payload, &payment_requirements)
                    .await
                    .map_err(|e| {
                        X402Error::facilitator_error(format!("Payment settlement failed: {}", e))
                    })?;

                // Add settlement header
                let settlement_header = settle_response.to_base64().map_err(|e| {
                    X402Error::config(format!("Failed to encode settlement response: {}", e))
                })?;

                if let Ok(header_value) = HeaderValue::from_str(&settlement_header) {
                    response
                        .headers_mut()
                        .insert("X-PAYMENT-RESPONSE", header_value);
                }

                Ok(PaymentResult::Success {
                    response,
                    settlement: settle_response,
                })
            }
            None => {
                // No payment provided, return 402 with requirements
                let response = self.create_payment_required_response(
                    "X-PAYMENT header is required",
                    &payment_requirements,
                    is_web_browser,
                )?;
                Ok(PaymentResult::PaymentRequired { response })
            }
        }
    }

    /// Create payment required response
    fn create_payment_required_response(
        &self,
        error: &str,
        payment_requirements: &PaymentRequirements,
        is_web_browser: bool,
    ) -> crate::Result<axum::response::Response> {
        if is_web_browser {
            let html = if let Some(custom_html) = &self.config.custom_paywall_html {
                custom_html.clone()
            } else {
                // Use the template system
                let paywall_config = self.template_config.clone().unwrap_or_else(|| {
                    crate::template::PaywallConfig::new()
                        .with_app_name("x402 Service")
                        .with_app_logo("💰")
                });

                crate::template::generate_paywall_html(
                    error,
                    std::slice::from_ref(payment_requirements),
                    Some(&paywall_config),
                )
            };

            let response = Response::builder()
                .status(StatusCode::PAYMENT_REQUIRED)
                .header("Content-Type", "text/html")
                .body(html.into())
                .map_err(|e| X402Error::config(format!("Failed to create HTML response: {}", e)))?;

            Ok(response)
        } else {
            let payment_response =
                PaymentRequirementsResponse::new(error, vec![payment_requirements.clone()]);

            Ok(Json(payment_response).into_response())
        }
    }
}

/// Axum middleware function for handling x402 payments
pub async fn payment_middleware(
    State(middleware): State<PaymentMiddleware>,
    request: Request,
    next: Next,
) -> crate::Result<impl IntoResponse> {
    match middleware.process_payment(request, next).await? {
        PaymentResult::Success { response, .. } => Ok(response),
        PaymentResult::PaymentRequired { response } => Ok(response),
        PaymentResult::VerificationFailed { response } => Ok(response),
        PaymentResult::SettlementFailed { response } => Ok(response),
    }
}

/// Create a service builder with x402 payment middleware
pub fn create_payment_service(
    middleware: PaymentMiddleware,
) -> impl tower::Layer<tower::ServiceBuilder<tower::layer::util::Identity>> + Clone {
    ServiceBuilder::new()
        .layer(TraceLayer::new_for_http())
        .layer(tower::layer::util::Stack::new(
            tower::layer::util::Identity::new(),
            PaymentServiceLayer::new(middleware),
        ))
}

/// Tower service layer for x402 payment middleware
#[derive(Clone)]
pub struct PaymentServiceLayer {
    middleware: PaymentMiddleware,
}

impl PaymentServiceLayer {
    pub fn new(middleware: PaymentMiddleware) -> Self {
        Self { middleware }
    }
}

impl<S> tower::Layer<S> for PaymentServiceLayer {
    type Service = PaymentService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        PaymentService {
            inner,
            middleware: self.middleware.clone(),
        }
    }
}

/// Tower service for x402 payment middleware
#[derive(Clone)]
pub struct PaymentService<S> {
    inner: S,
    middleware: PaymentMiddleware,
}

impl<S, ReqBody, ResBody> tower::Service<http::Request<ReqBody>> for PaymentService<S>
where
    S: tower::Service<
            http::Request<ReqBody>,
            Response = http::Response<ResBody>,
            Error = Box<dyn std::error::Error + Send + Sync>,
        > + Send
        + 'static,
    S::Future: Send + 'static,
    ReqBody: Send + 'static,
    ResBody: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = std::pin::Pin<
        Box<
            dyn std::future::Future<Output = std::result::Result<Self::Response, Self::Error>>
                + Send,
        >,
    >;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::result::Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: http::Request<ReqBody>) -> Self::Future {
        let middleware = self.middleware.clone();

        // Extract payment header before moving the request
        let payment_header = req
            .headers()
            .get("X-PAYMENT")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string());
        let uri_path = req.uri().path().to_string();

        let future = self.inner.call(req);

        Box::pin(async move {
            match payment_header {
                Some(payment_b64) => {
                    // Parse payment payload
                    match crate::types::PaymentPayload::from_base64(&payment_b64) {
                        Ok(payment_payload) => {
                            // Create payment requirements
                            let requirements =
                                match middleware.config.create_payment_requirements(&uri_path) {
                                    Ok(req) => req,
                                    Err(e) => {
                                        // Return 500 error if we can't create requirements
                                        return Err(
                                            Box::new(e) as Box<dyn std::error::Error + Send + Sync>
                                        );
                                    }
                                };

                            // Verify payment
                            match middleware
                                .verify_with_requirements(&payment_payload, &requirements)
                                .await
                            {
                                Ok(true) => {
                                    // Payment is valid, proceed with request
                                    let response = future.await?;

                                    // Settle payment after successful response
                                    if let Ok(settlement) = middleware
                                        .settle_with_requirements(&payment_payload, &requirements)
                                        .await
                                    {
                                        // Note: In a real implementation, we would need to modify the response
                                        // to add the X-PAYMENT-RESPONSE header, but this requires
                                        // more complex response handling in Tower
                                        let _ = settlement; // Acknowledge settlement
                                    }

                                    Ok(response)
                                }
                                Ok(false) => {
                                    // Payment verification failed
                                    Err(Box::new(crate::X402Error::payment_verification_failed(
                                        "Payment verification failed",
                                    ))
                                        as Box<dyn std::error::Error + Send + Sync>)
                                }
                                Err(e) => {
                                    // Error during verification
                                    Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
                                }
                            }
                        }
                        Err(e) => {
                            // Invalid payment payload
                            Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
                        }
                    }
                }
                None => {
                    // No payment header provided
                    Err(Box::new(crate::X402Error::payment_verification_failed(
                        "X-PAYMENT header is required",
                    ))
                        as Box<dyn std::error::Error + Send + Sync>)
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_payment_middleware_config() {
        let config = PaymentMiddlewareConfig::new(
            Decimal::from_str("0.0001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        )
        .with_description("Test payment")
        .with_testnet(true);

        assert_eq!(config.amount, Decimal::from_str("0.0001").unwrap());
        assert_eq!(config.pay_to, "0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
        assert_eq!(config.description, Some("Test payment".to_string()));
        assert!(config.testnet);
    }

    #[test]
    fn test_payment_middleware_creation() {
        let middleware = PaymentMiddleware::new(
            Decimal::from_str("0.0001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        )
        .with_description("Test payment");

        assert_eq!(
            middleware.config().amount,
            Decimal::from_str("0.0001").unwrap()
        );
        assert_eq!(
            middleware.config().pay_to,
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
        );
    }

    #[test]
    fn test_payment_requirements_creation() {
        let config = PaymentMiddlewareConfig::new(
            Decimal::from_str("0.0001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        )
        .with_testnet(true);

        let requirements = config.create_payment_requirements("/test").unwrap();

        assert_eq!(requirements.scheme, "exact");
        assert_eq!(requirements.network, "base-sepolia");
        assert_eq!(requirements.max_amount_required, "100");
        assert_eq!(
            requirements.pay_to,
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
        );
    }

    #[test]
    fn test_payment_middleware_config_builder() {
        let config = PaymentMiddlewareConfig::new(
            Decimal::from_str("0.01").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        )
        .with_description("Test payment")
        .with_mime_type("application/json")
        .with_max_timeout_seconds(120)
        .with_testnet(false)
        .with_resource("https://example.com/test");

        assert_eq!(config.amount, Decimal::from_str("0.01").unwrap());
        assert_eq!(config.pay_to, "0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
        assert_eq!(config.description, Some("Test payment".to_string()));
        assert_eq!(config.mime_type, Some("application/json".to_string()));
        assert_eq!(config.max_timeout_seconds, 120);
        assert!(!config.testnet);
        assert_eq!(
            config.resource,
            Some("https://example.com/test".to_string())
        );
    }

    #[test]
    fn test_payment_middleware_creation_with_description() {
        let middleware = PaymentMiddleware::new(
            Decimal::from_str("0.001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        )
        .with_description("Test middleware");

        assert_eq!(
            middleware.config().amount,
            Decimal::from_str("0.001").unwrap()
        );
        assert_eq!(
            middleware.config().description,
            Some("Test middleware".to_string())
        );
    }
}
