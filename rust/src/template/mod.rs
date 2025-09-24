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
    /// Custom CSS styles
    pub custom_css: Option<String>,
    /// Custom JavaScript
    pub custom_js: Option<String>,
    /// Theme configuration
    pub theme: Option<ThemeConfig>,
    /// Branding configuration
    pub branding: Option<BrandingConfig>,
}

/// Theme configuration for the paywall
#[derive(Debug, Clone)]
pub struct ThemeConfig {
    /// Primary color
    pub primary_color: String,
    /// Secondary color
    pub secondary_color: String,
    /// Background color
    pub background_color: String,
    /// Text color
    pub text_color: String,
    /// Border radius
    pub border_radius: String,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            primary_color: "#667eea".to_string(),
            secondary_color: "#764ba2".to_string(),
            background_color: "#ffffff".to_string(),
            text_color: "#1a1a1a".to_string(),
            border_radius: "16px".to_string(),
        }
    }
}

/// Branding configuration for the paywall
#[derive(Debug, Clone)]
pub struct BrandingConfig {
    /// Company name
    pub company_name: String,
    /// Company logo URL
    pub company_logo: Option<String>,
    /// Support email
    pub support_email: Option<String>,
    /// Support URL
    pub support_url: Option<String>,
    /// Terms of service URL
    pub terms_url: Option<String>,
    /// Privacy policy URL
    pub privacy_url: Option<String>,
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

    /// Set custom CSS
    pub fn with_custom_css(mut self, css: impl Into<String>) -> Self {
        self.custom_css = Some(css.into());
        self
    }

    /// Set custom JavaScript
    pub fn with_custom_js(mut self, js: impl Into<String>) -> Self {
        self.custom_js = Some(js.into());
        self
    }

    /// Set theme configuration
    pub fn with_theme(mut self, theme: ThemeConfig) -> Self {
        self.theme = Some(theme);
        self
    }

    /// Set branding configuration
    pub fn with_branding(mut self, branding: BrandingConfig) -> Self {
        self.branding = Some(branding);
        self
    }
}

impl ThemeConfig {
    /// Create a new theme config
    pub fn new() -> Self {
        Self::default()
    }

    /// Set primary color
    pub fn with_primary_color(mut self, color: impl Into<String>) -> Self {
        self.primary_color = color.into();
        self
    }

    /// Set secondary color
    pub fn with_secondary_color(mut self, color: impl Into<String>) -> Self {
        self.secondary_color = color.into();
        self
    }

    /// Set background color
    pub fn with_background_color(mut self, color: impl Into<String>) -> Self {
        self.background_color = color.into();
        self
    }

    /// Set text color
    pub fn with_text_color(mut self, color: impl Into<String>) -> Self {
        self.text_color = color.into();
        self
    }

    /// Set border radius
    pub fn with_border_radius(mut self, radius: impl Into<String>) -> Self {
        self.border_radius = radius.into();
        self
    }
}

impl BrandingConfig {
    /// Create a new branding config
    pub fn new(company_name: impl Into<String>) -> Self {
        Self {
            company_name: company_name.into(),
            company_logo: None,
            support_email: None,
            support_url: None,
            terms_url: None,
            privacy_url: None,
        }
    }

    /// Set company logo
    pub fn with_company_logo(mut self, logo: impl Into<String>) -> Self {
        self.company_logo = Some(logo.into());
        self
    }

    /// Set support email
    pub fn with_support_email(mut self, email: impl Into<String>) -> Self {
        self.support_email = Some(email.into());
        self
    }

    /// Set support URL
    pub fn with_support_url(mut self, url: impl Into<String>) -> Self {
        self.support_url = Some(url.into());
        self
    }

    /// Set terms of service URL
    pub fn with_terms_url(mut self, url: impl Into<String>) -> Self {
        self.terms_url = Some(url.into());
        self
    }

    /// Set privacy policy URL
    pub fn with_privacy_url(mut self, url: impl Into<String>) -> Self {
        self.privacy_url = Some(url.into());
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
    let config_json = serde_json::to_string(&x402_config).unwrap_or_else(|_| "{}".to_string());

    // Create the configuration script
    let config_script = format!(
        r#"  <script>
    window.x402 = {};
    console.log('Payment requirements initialized:', window.x402);
  </script>"#,
        config_json
    );

    // Apply theme customizations if provided
    let mut html = html_content.to_string();
    if let Some(config) = paywall_config {
        if let Some(theme) = &config.theme {
            html = apply_theme_customizations(&html, theme);
        }

        if let Some(branding) = &config.branding {
            html = apply_branding_customizations(&html, branding);
        }

        if let Some(custom_css) = &config.custom_css {
            html = inject_custom_css(&html, custom_css);
        }

        if let Some(custom_js) = &config.custom_js {
            html = inject_custom_js(&html, custom_js);
        }
    }

    // Inject the configuration script into the head
    html.replace("</head>", &format!("{}\n</head>", config_script))
}

/// Apply theme customizations to HTML
fn apply_theme_customizations(html: &str, theme: &ThemeConfig) -> String {
    let css_vars = format!(
        r#"
    :root {{
      --primary-color: {};
      --secondary-color: {};
      --background-color: {};
      --text-color: {};
      --border-radius: {};
    }}"#,
        theme.primary_color,
        theme.secondary_color,
        theme.background_color,
        theme.text_color,
        theme.border_radius
    );

    html.replace("</head>", &format!("{}\n</head>", css_vars))
}

/// Apply branding customizations to HTML
fn apply_branding_customizations(html: &str, branding: &BrandingConfig) -> String {
    let mut html = html.to_string();

    // Replace app name in title
    html = html.replace(
        "Payment Required",
        &format!("{} - Payment Required", branding.company_name),
    );

    // Replace logo if provided
    if let Some(logo_url) = &branding.company_logo {
        let logo_html = format!(
            r#"<img src="{}" alt="{}" style="width: 80px; height: 80px; object-fit: contain;">"#,
            logo_url, branding.company_name
        );
        html = html.replace(
            r#"<div class="logo">💰</div>"#,
            &format!(r#"<div class="logo">{}</div>"#, logo_html),
        );
    }

    html
}

/// Inject custom CSS into HTML
fn inject_custom_css(html: &str, css: &str) -> String {
    let css_tag = format!(r#"<style>{}</style>"#, css);
    html.replace("</head>", &format!("{}\n</head>", css_tag))
}

/// Inject custom JavaScript into HTML
fn inject_custom_js(html: &str, js: &str) -> String {
    let js_tag = format!(r#"<script>{}</script>"#, js);
    html.replace("</body>", &format!("{}\n</body>", js_tag))
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

    let mut config_json = serde_json::json!({
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
    });

    // Add theme configuration if provided
    if let Some(theme) = &config.theme {
        config_json["theme"] = serde_json::json!({
            "primaryColor": theme.primary_color,
            "secondaryColor": theme.secondary_color,
            "backgroundColor": theme.background_color,
            "textColor": theme.text_color,
            "borderRadius": theme.border_radius,
        });
    }

    // Add branding configuration if provided
    if let Some(branding) = &config.branding {
        config_json["branding"] = serde_json::json!({
            "companyName": branding.company_name,
            "companyLogo": branding.company_logo,
            "supportEmail": branding.support_email,
            "supportUrl": branding.support_url,
            "termsUrl": branding.terms_url,
            "privacyUrl": branding.privacy_url,
        });
    }

    config_json
}

/// Check if request is from a browser
pub fn is_browser_request(user_agent: &str, accept: &str) -> bool {
    accept.contains("text/html") && user_agent.contains("Mozilla")
}
