//! Configuration utilities for paywall templates
//!
//! This module provides utilities for creating and managing paywall configuration.

use super::PaywallConfig;
use crate::types::PaymentRequirements;

/// Paywall configuration builder
#[derive(Debug, Clone)]
pub struct PaywallConfigBuilder {
    app_name: Option<String>,
    app_logo: Option<String>,
    cdp_client_key: Option<String>,
    session_token_endpoint: Option<String>,
}

impl PaywallConfigBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            app_name: None,
            app_logo: None,
            cdp_client_key: None,
            session_token_endpoint: None,
        }
    }

    /// Set the app name
    pub fn app_name(mut self, name: impl Into<String>) -> Self {
        self.app_name = Some(name.into());
        self
    }

    /// Set the app logo
    pub fn app_logo(mut self, logo: impl Into<String>) -> Self {
        self.app_logo = Some(logo.into());
        self
    }

    /// Set the CDP client key
    pub fn cdp_client_key(mut self, key: impl Into<String>) -> Self {
        self.cdp_client_key = Some(key.into());
        self
    }

    /// Set the session token endpoint
    pub fn session_token_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.session_token_endpoint = Some(endpoint.into());
        self
    }

    /// Build the configuration
    pub fn build(self) -> PaywallConfig {
        PaywallConfig {
            app_name: self.app_name,
            app_logo: self.app_logo,
            cdp_client_key: self.cdp_client_key,
            session_token_endpoint: self.session_token_endpoint,
            custom_css: None,
            custom_js: None,
            theme: None,
            branding: None,
        }
    }
}

impl Default for PaywallConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Create a default paywall configuration
pub fn default_config() -> PaywallConfig {
    PaywallConfigBuilder::new().build()
}

/// Create a configuration with app branding
pub fn branded_config(app_name: &str, app_logo: Option<&str>) -> PaywallConfig {
    let mut builder = PaywallConfigBuilder::new().app_name(app_name);

    if let Some(logo) = app_logo {
        builder = builder.app_logo(logo);
    }

    builder.build()
}

/// Create a configuration with CDP integration
pub fn cdp_config(
    app_name: &str,
    cdp_client_key: &str,
    session_token_endpoint: Option<&str>,
) -> PaywallConfig {
    let mut builder = PaywallConfigBuilder::new()
        .app_name(app_name)
        .cdp_client_key(cdp_client_key);

    if let Some(endpoint) = session_token_endpoint {
        builder = builder.session_token_endpoint(endpoint);
    }

    builder.build()
}

/// Validate payment requirements
pub fn validate_payment_requirements(requirements: &[PaymentRequirements]) -> Result<(), String> {
    if requirements.is_empty() {
        return Err("No payment requirements provided".to_string());
    }

    for req in requirements {
        if req.scheme.is_empty() {
            return Err("Payment scheme cannot be empty".to_string());
        }

        if req.network.is_empty() {
            return Err("Payment network cannot be empty".to_string());
        }

        if req.max_amount_required.is_empty() {
            return Err("Payment amount cannot be empty".to_string());
        }

        if req.pay_to.is_empty() {
            return Err("Payment recipient cannot be empty".to_string());
        }
    }

    Ok(())
}

/// Format amount for display
pub fn format_amount(amount: &str, decimals: u8) -> Result<String, String> {
    let amount_num: u64 = amount
        .parse()
        .map_err(|_| "Invalid amount format".to_string())?;

    let divisor = 10_u64.pow(decimals as u32);
    let display_amount = amount_num as f64 / divisor as f64;

    Ok(format!("${:.6}", display_amount)
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string())
}

/// Get network display name
pub fn get_network_display_name(network: &str) -> String {
    match network {
        "base" => "Base".to_string(),
        "base-sepolia" => "Base Sepolia".to_string(),
        "ethereum" => "Ethereum".to_string(),
        "ethereum-mainnet" => "Ethereum Mainnet".to_string(),
        "polygon" => "Polygon".to_string(),
        "polygon-mumbai" => "Polygon Mumbai".to_string(),
        "avalanche" => "Avalanche".to_string(),
        "avalanche-fuji" => "Avalanche Fuji".to_string(),
        _ => network.to_string(),
    }
}

/// Check if network is testnet
pub fn is_testnet(network: &str) -> bool {
    matches!(
        network,
        "base-sepolia" | "ethereum-sepolia" | "polygon-mumbai" | "avalanche-fuji"
    )
}
