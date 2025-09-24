//! Proxy server implementation for x402 payments
//!
//! This module provides a reverse proxy server that adds x402 payment protection
//! to any existing HTTP service.

use crate::middleware::PaymentMiddlewareConfig;
use crate::types::{FacilitatorConfig, Network};
use crate::{Result, X402Error};
use axum::{
    extract::State,
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};

/// Configuration for the proxy server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    /// Target URL to proxy requests to
    pub target_url: String,
    /// Payment amount in decimal units (e.g., 0.01 for 1 cent)
    pub amount: f64,
    /// Recipient wallet address
    pub pay_to: String,
    /// Payment description
    pub description: Option<String>,
    /// MIME type of the expected response
    pub mime_type: Option<String>,
    /// Maximum timeout in seconds
    pub max_timeout_seconds: u32,
    /// Facilitator URL
    pub facilitator_url: String,
    /// Whether to use testnet
    pub testnet: bool,
    /// Additional headers to forward to target
    pub headers: HashMap<String, String>,
    /// CDP API credentials (optional)
    pub cdp_api_key_id: Option<String>,
    pub cdp_api_key_secret: Option<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            target_url: String::new(),
            amount: 0.0001,
            pay_to: String::new(),
            description: None,
            mime_type: None,
            max_timeout_seconds: 60,
            facilitator_url: "https://x402.org/facilitator".to_string(),
            testnet: true,
            headers: HashMap::new(),
            cdp_api_key_id: None,
            cdp_api_key_secret: None,
        }
    }
}

impl ProxyConfig {
    /// Load configuration from a JSON file
    pub fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| X402Error::config(format!("Failed to read config file: {}", e)))?;

        let config: ProxyConfig = serde_json::from_str(&content)
            .map_err(|e| X402Error::config(format!("Failed to parse config file: {}", e)))?;

        config.validate()?;
        Ok(config)
    }

    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self> {
        let mut config = Self::default();

        if let Ok(target_url) = std::env::var("TARGET_URL") {
            config.target_url = target_url;
        }

        if let Ok(amount) = std::env::var("AMOUNT") {
            config.amount = amount
                .parse()
                .map_err(|e| X402Error::config(format!("Invalid AMOUNT: {}", e)))?;
        }

        if let Ok(pay_to) = std::env::var("PAY_TO") {
            config.pay_to = pay_to;
        }

        if let Ok(description) = std::env::var("DESCRIPTION") {
            config.description = Some(description);
        }

        if let Ok(facilitator_url) = std::env::var("FACILITATOR_URL") {
            config.facilitator_url = facilitator_url;
        }

        if let Ok(testnet) = std::env::var("TESTNET") {
            config.testnet = testnet
                .parse()
                .map_err(|e| X402Error::config(format!("Invalid TESTNET: {}", e)))?;
        }

        if let Ok(cdp_api_key_id) = std::env::var("CDP_API_KEY_ID") {
            config.cdp_api_key_id = Some(cdp_api_key_id);
        }

        if let Ok(cdp_api_key_secret) = std::env::var("CDP_API_KEY_SECRET") {
            config.cdp_api_key_secret = Some(cdp_api_key_secret);
        }

        config.validate()?;
        Ok(config)
    }

    /// Validate the configuration
    pub fn validate(&self) -> Result<()> {
        if self.target_url.is_empty() {
            return Err(X402Error::config("TARGET_URL is required"));
        }

        if self.pay_to.is_empty() {
            return Err(X402Error::config("PAY_TO is required"));
        }

        if self.amount <= 0.0 {
            return Err(X402Error::config("AMOUNT must be positive"));
        }

        // Validate target URL
        url::Url::parse(&self.target_url)
            .map_err(|e| X402Error::config(format!("Invalid TARGET_URL: {}", e)))?;

        // Validate facilitator URL
        url::Url::parse(&self.facilitator_url)
            .map_err(|e| X402Error::config(format!("Invalid FACILITATOR_URL: {}", e)))?;

        Ok(())
    }

    /// Convert to payment middleware config
    pub fn to_payment_config(&self) -> Result<PaymentMiddlewareConfig> {
        let amount = Decimal::from_str(&self.amount.to_string())
            .map_err(|e| X402Error::config(format!("Invalid amount: {}", e)))?;

        let mut facilitator_config = FacilitatorConfig::new(&self.facilitator_url);

        // Set up CDP authentication if credentials are provided
        if let (Some(api_key_id), Some(api_key_secret)) =
            (&self.cdp_api_key_id, &self.cdp_api_key_secret)
        {
            if !api_key_id.is_empty() && !api_key_secret.is_empty() {
                let auth_headers =
                    crate::facilitator::coinbase::create_auth_headers(api_key_id, api_key_secret);
                facilitator_config = facilitator_config.with_auth_headers(Box::new(auth_headers));
            }
        }

        let _network = if self.testnet {
            Network::Testnet
        } else {
            Network::Mainnet
        };

        let mut config = PaymentMiddlewareConfig::new(amount, &self.pay_to)
            .with_facilitator_config(facilitator_config)
            .with_testnet(self.testnet)
            .with_max_timeout_seconds(self.max_timeout_seconds);

        if let Some(description) = &self.description {
            config = config.with_description(description);
        }

        if let Some(mime_type) = &self.mime_type {
            config = config.with_mime_type(mime_type);
        }

        Ok(config)
    }
}

/// Proxy server state
#[derive(Clone)]
pub struct ProxyState {
    config: ProxyConfig,
    client: reqwest::Client,
}

impl ProxyState {
    pub fn new(config: ProxyConfig) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| X402Error::config(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { config, client })
    }
}

/// Create a proxy server with x402 payment protection
pub fn create_proxy_server(config: ProxyConfig) -> Result<Router> {
    let state = ProxyState::new(config.clone())?;

    let app = Router::new()
        .route("/*path", any(proxy_handler))
        .with_state(state);

    Ok(app)
}

/// Create a proxy server with tracing middleware
pub fn create_proxy_server_with_tracing(config: ProxyConfig) -> Result<Router> {
    let state = ProxyState::new(config.clone())?;

    let app = Router::new()
        .route("/*path", any(proxy_handler))
        .with_state(state)
        .layer(ServiceBuilder::new().layer(TraceLayer::new_for_http()));

    Ok(app)
}

/// Create a proxy server with x402 payment middleware
pub fn create_proxy_server_with_payment(config: ProxyConfig) -> Result<Router> {
    let state = ProxyState::new(config.clone())?;
    
    // Create payment middleware from config
    let payment_config = config.to_payment_config()?;
    let payment_middleware = crate::middleware::PaymentMiddleware::new(
        payment_config.amount,
        payment_config.pay_to.clone(),
    )
    .with_facilitator_config(payment_config.facilitator_config.clone())
    .with_testnet(payment_config.testnet)
    .with_description(payment_config.description.as_deref().unwrap_or("Proxy payment"));

    let app = Router::new()
        .route("/*path", any(proxy_handler_with_payment))
        .with_state(state)
        .layer(axum::middleware::from_fn_with_state(
            payment_middleware,
            payment_middleware_handler,
        ));

    Ok(app)
}

/// Payment middleware handler for proxy
async fn payment_middleware_handler(
    State(middleware): State<crate::middleware::PaymentMiddleware>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> impl axum::response::IntoResponse {
    match middleware.process_payment(request, next).await {
        Ok(result) => match result {
            crate::middleware::PaymentResult::Success { response, .. } => response,
            crate::middleware::PaymentResult::PaymentRequired { response } => response,
            crate::middleware::PaymentResult::VerificationFailed { response } => response,
            crate::middleware::PaymentResult::SettlementFailed { response } => response,
        },
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({
                "error": format!("Payment processing error: {}", e),
                "x402Version": 1
            }))
        ).into_response(),
    }
}

/// Proxy handler with payment protection that forwards requests to the target server
async fn proxy_handler_with_payment(
    State(state): State<ProxyState>,
    request: axum::extract::Request,
) -> std::result::Result<Response, StatusCode> {
    // This handler is called after payment middleware has verified the payment
    proxy_handler(State(state), request).await
}

/// Proxy handler that forwards requests to the target server
async fn proxy_handler(
    State(state): State<ProxyState>,
    request: axum::extract::Request,
) -> std::result::Result<Response, StatusCode> {
    let target_url = &state.config.target_url;
    let client = &state.client;

    // Extract the path from the request
    let path = request.uri().path();
    let query = request.uri().query().unwrap_or("");

    // Build the target URL
    let full_url = if query.is_empty() {
        format!("{}{}", target_url, path)
    } else {
        format!("{}{}?{}", target_url, path, query)
    };

    info!("Proxying request to: {}", full_url);

    // Create a new request to the target server
    let method =
        Method::from_str(request.method().as_str()).map_err(|_| StatusCode::BAD_REQUEST)?;

    let mut target_request = client.request(method, &full_url);

    // Copy essential headers
    target_request = copy_essential_headers(request.headers(), target_request);

    // Add custom headers from config
    for (key, value) in &state.config.headers {
        if let (Ok(name), Ok(val)) = (HeaderName::try_from(key), HeaderValue::try_from(value)) {
            target_request = target_request.header(name, val);
        }
    }

    // Copy request body if present
    let body = axum::body::to_bytes(request.into_body(), usize::MAX)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    if !body.is_empty() {
        target_request = target_request.body(body);
    }

    // Execute the request
    let response = target_request.send().await.map_err(|e| {
        warn!("Failed to execute proxy request: {}", e);
        StatusCode::BAD_GATEWAY
    })?;

    // Convert response
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .bytes()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let mut response_builder = Response::builder().status(status);

    // Copy response headers
    for (key, value) in headers.iter() {
        if let Ok(header_name) = HeaderName::try_from(key.as_str()) {
            response_builder = response_builder.header(header_name, value);
        }
    }

    response_builder
        .body(body.into())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Copy essential headers from the original request to the target request
fn copy_essential_headers(
    source_headers: &HeaderMap,
    target_request: reqwest::RequestBuilder,
) -> reqwest::RequestBuilder {
    let essential_headers = [
        "user-agent",
        "accept",
        "accept-language",
        "accept-encoding",
        "content-type",
        "content-length",
        "authorization",
        "x-requested-with",
    ];

    let mut request = target_request;

    for header_name in &essential_headers {
        if let Some(value) = source_headers.get(*header_name) {
            if let Ok(name) = HeaderName::try_from(*header_name) {
                request = request.header(name, value);
            }
        }
    }

    request
}

/// Run a proxy server with the given configuration
pub async fn run_proxy_server(config: ProxyConfig, port: u16) -> Result<()> {
    let app = create_proxy_server_with_tracing(config)?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .map_err(|e| X402Error::config(format!("Failed to bind to port {}: {}", port, e)))?;

    info!("🚀 Proxy server running on port {}", port);
    info!("💰 All requests will require payment");

    axum::serve(listener, app)
        .await
        .map_err(|e| X402Error::config(format!("Server error: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_config_default() {
        let config = ProxyConfig::default();
        assert_eq!(config.amount, 0.0001);
        assert!(config.testnet);
        assert_eq!(config.facilitator_url, "https://x402.org/facilitator");
    }

    #[test]
    fn test_proxy_config_validation() {
        let mut config = ProxyConfig::default();
        config.target_url = "https://example.com".to_string();
        config.pay_to = "0x1234567890123456789012345678901234567890".to_string();

        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_proxy_config_validation_missing_target() {
        let config = ProxyConfig::default();
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_proxy_config_validation_invalid_url() {
        let mut config = ProxyConfig::default();
        config.target_url = "not-a-url".to_string();
        config.pay_to = "0x1234567890123456789012345678901234567890".to_string();

        assert!(config.validate().is_err());
    }

    #[test]
    fn test_proxy_config_to_payment_config() {
        let mut config = ProxyConfig::default();
        config.target_url = "https://example.com".to_string();
        config.pay_to = "0x1234567890123456789012345678901234567890".to_string();
        config.amount = 0.01;
        config.description = Some("Test payment".to_string());

        let payment_config = config.to_payment_config().unwrap();
        assert_eq!(
            payment_config.pay_to,
            "0x1234567890123456789012345678901234567890"
        );
        assert_eq!(payment_config.testnet, true);
    }
}
