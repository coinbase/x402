//! Template system demo
//!
//! This example demonstrates how to use the new HTML template system
//! for generating paywall pages.

use x402::template::{self, PaywallConfig};
use x402::types::PaymentRequirements;

fn main() {
    // Create payment requirements
    let payment_requirements = PaymentRequirements {
        scheme: "exact".to_string(),
        network: "base-sepolia".to_string(),
        max_amount_required: "1000000".to_string(), // 1 USDC (6 decimals)
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string(), // USDC on Base Sepolia
        pay_to: "0x1234567890123456789012345678901234567890".to_string(),
        resource: "https://example.com/premium-content".to_string(),
        description: "Access to premium content".to_string(),
        mime_type: Some("application/json".to_string()),
        output_schema: None,
        max_timeout_seconds: 300,
        extra: None,
    };

    // Create a basic paywall configuration
    let basic_config = PaywallConfig::new()
        .with_app_name("My App")
        .with_app_logo("🚀");

    // Generate HTML with basic configuration
    let html_basic = template::generate_paywall_html(
        "Please provide payment to access this resource",
        &[payment_requirements.clone()],
        Some(&basic_config),
    );

    println!("=== Basic Paywall HTML ===");
    println!("{}", html_basic);
    println!("\n{}", "=".repeat(50));

    // Create a branded configuration
    let branded_config = PaywallConfig::new()
        .with_app_name("Premium Service")
        .with_app_logo("💎")
        .with_cdp_client_key("your-cdp-key-here");

    // Generate HTML with branded configuration
    let html_branded =
        template::generate_paywall_html("", &[payment_requirements.clone()], Some(&branded_config));

    println!("=== Branded Paywall HTML ===");
    println!("{}", html_branded);
    println!("\n{}", "=".repeat(50));

    // Generate HTML with error message
    let html_error = template::generate_paywall_html(
        "Invalid payment signature. Please try again.",
        &[payment_requirements],
        None, // Use default configuration
    );

    println!("=== Error Paywall HTML ===");
    println!("{}", html_error);

    // Demonstrate utility functions
    println!("\n=== Utility Functions ===");
    println!(
        "Network display name for 'base-sepolia': {}",
        template::config::get_network_display_name("base-sepolia")
    );
    println!(
        "Is 'base-sepolia' testnet? {}",
        template::config::is_testnet("base-sepolia")
    );
    println!(
        "Formatted amount '1000000' with 6 decimals: {}",
        template::config::format_amount("1000000", 6).unwrap()
    );
}
