//! HTML template system for x402 paywall
//!
//! This module provides HTML template generation for the x402 paywall,
//! similar to the Python implementation but using Rust's type system.

pub mod config;
pub mod paywall;

use crate::types::PaymentRequirements;
use serde_json;

/// Template configuration for paywall customization
#[derive(Debug, Clone, Default)]
pub struct PaywallConfig {
    /// App name displayed in the paywall
    pub app_name: Option<String>,
    /// App logo URL
    pub app_logo: Option<String>,
    /// CDP client key for enhanced RPC
    pub cdp_client_key: Option<String>,
    /// Session token endpoint
    pub session_token_endpoint: Option<String>,
}

impl PaywallConfig {
    /// Create a new paywall config
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the app name
    pub fn with_app_name(mut self, app_name: impl Into<String>) -> Self {
        self.app_name = Some(app_name.into());
        self
    }

    /// Set the app logo
    pub fn with_app_logo(mut self, app_logo: impl Into<String>) -> Self {
        self.app_logo = Some(app_logo.into());
        self
    }

    /// Set the CDP client key
    pub fn with_cdp_client_key(mut self, cdp_client_key: impl Into<String>) -> Self {
        self.cdp_client_key = Some(cdp_client_key.into());
        self
    }

    /// Set the session token endpoint
    pub fn with_session_token_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.session_token_endpoint = Some(endpoint.into());
        self
    }
}

/// Generate paywall HTML with injected configuration
pub fn generate_paywall_html(
    error: &str,
    payment_requirements: &[PaymentRequirements],
    paywall_config: Option<&PaywallConfig>,
) -> String {
    let base_template = paywall::get_base_template();
    inject_payment_data(base_template, error, payment_requirements, paywall_config)
}

/// Inject payment data into HTML template
fn inject_payment_data(
    html_content: &str,
    error: &str,
    payment_requirements: &[PaymentRequirements],
    paywall_config: Option<&PaywallConfig>,
) -> String {
    let x402_config = create_x402_config(error, payment_requirements, paywall_config);

    // Create the configuration script
    let config_script = format!(
        r#"  <script>
    window.x402 = {};
    console.log('Payment requirements initialized:', window.x402);
  </script>"#,
        serde_json::to_string(&x402_config).unwrap_or_else(|_| "{}".to_string())
    );

    // Inject the configuration script into the head
    html_content.replace("</head>", &format!("{}\n</head>", config_script))
}

/// Create x402 configuration object from payment requirements
fn create_x402_config(
    error: &str,
    payment_requirements: &[PaymentRequirements],
    paywall_config: Option<&PaywallConfig>,
) -> serde_json::Value {
    let requirements = payment_requirements.first();
    let mut display_amount = 0.0;
    let mut current_url = String::new();
    let mut testnet = true;

    if let Some(req) = requirements {
        // Convert atomic amount back to USD (assuming USDC with 6 decimals)
        if let Ok(amount) = req.max_amount_required.parse::<f64>() {
            display_amount = amount / 1_000_000.0; // USDC has 6 decimals
        }
        current_url = req.resource.clone();
        testnet = req.network == "base-sepolia";
    }

    let default_config = PaywallConfig::default();
    let config = paywall_config.unwrap_or(&default_config);

    serde_json::json!({
        "amount": display_amount,
        "paymentRequirements": payment_requirements,
        "testnet": testnet,
        "currentUrl": current_url,
        "error": error,
        "x402_version": 1,
        "cdpClientKey": config.cdp_client_key.as_deref().unwrap_or(""),
        "appName": config.app_name.as_deref().unwrap_or(""),
        "appLogo": config.app_logo.as_deref().unwrap_or(""),
        "sessionTokenEndpoint": config.session_token_endpoint.as_deref().unwrap_or(""),
    })
}

/// Check if request is from a browser
pub fn is_browser_request(user_agent: &str, accept: &str) -> bool {
    accept.contains("text/html") && user_agent.contains("Mozilla")
}
