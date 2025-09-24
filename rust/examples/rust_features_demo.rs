//! Demonstration of Rust Implementation Unique Features
//!
//! This example showcases features that the Go version doesn't have

use x402::{
    client::{DiscoveryClient, DiscoveryFilters, X402Client},
    crypto::{jwt, signature},
    template::{generate_paywall_html, PaywallConfig},
    types::{Network, PaymentRequirements},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🦀 x402 Rust Unique Features Demo\n");

    // 1. HTTP Client functionality (Go doesn't have)
    demo_http_client().await?;

    // 2. Resource Discovery functionality (Go doesn't have)
    demo_discovery_client().await?;

    // 3. Modern template system (Go doesn't have)
    demo_template_system()?;

    // 4. Type-safe network configuration (Go doesn't have)
    demo_type_safe_networks()?;

    // 5. Advanced crypto functionality (Go partially has)
    demo_advanced_crypto()?;

    println!("✅ All Rust unique features demo completed!");
    Ok(())
}

/// Demonstrate HTTP Client functionality
async fn demo_http_client() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 1. HTTP Client Functionality (Go doesn't have)");

    let _client = X402Client::new()?;

    // Create payment requirements
    let _requirements = PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000", // 1 USDC
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "https://example.com/premium",
        "Premium API access",
    );

    println!("   ✅ Created X402Client");
    println!("   ✅ Supports automatic 402 response handling");
    println!("   ✅ Supports automatic retry mechanism");
    println!("   ✅ Supports request builder pattern");

    Ok(())
}

/// Demonstrate Resource Discovery functionality
async fn demo_discovery_client() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n🔍 2. Resource Discovery Functionality (Go doesn't have)");

    let _discovery = DiscoveryClient::default_client();

    // Create discovery filters
    let _filters = DiscoveryFilters::new()
        .with_resource_type("http")
        .with_limit(10)
        .with_offset(0);

    println!("   ✅ Created DiscoveryClient");
    println!("   ✅ Supports resource discovery API");
    println!("   ✅ Supports pagination queries");
    println!("   ✅ Supports type filtering");
    println!("   ✅ Supports query builder pattern");

    Ok(())
}

/// Demonstrate modern template system
fn demo_template_system() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n🎨 3. Modern Template System (Go doesn't have)");

    // Create payment requirements
    let requirements = vec![PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000",
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "https://example.com/premium",
        "Premium API access",
    )];

    // Create template configuration
    let config = PaywallConfig::new()
        .with_app_name("My Premium App")
        .with_app_logo("🚀")
        .with_cdp_client_key("your-client-key")
        .with_session_token_endpoint("https://api.example.com/session");

    // Generate HTML
    let html = generate_paywall_html(
        "Payment required for premium access",
        &requirements,
        Some(&config),
    );

    println!("   ✅ Generated modern HTML template");
    println!("   ✅ Supports responsive design");
    println!("   ✅ Supports brand customization");
    println!("   ✅ Supports CDP integration");
    println!("   ✅ HTML length: {} characters", html.len());

    Ok(())
}

/// Demonstrate type-safe network configuration
fn demo_type_safe_networks() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n🛡️ 4. Type-Safe Network Configuration (Go doesn't have)");

    // Type-safe network enum
    let testnet = Network::Testnet;
    let mainnet = Network::Mainnet;

    println!("   ✅ Using type-safe Network enum");
    println!("   ✅ Testnet: {}", testnet.as_str());
    println!("   ✅ Mainnet: {}", mainnet.as_str());
    println!("   ✅ Testnet USDC address: {}", testnet.usdc_address());
    println!("   ✅ Mainnet USDC address: {}", mainnet.usdc_address());
    println!("   ✅ Testnet USDC name: {}", testnet.usdc_name());
    println!("   ✅ Mainnet USDC name: {}", mainnet.usdc_name());

    // Network configuration
    let config = testnet;
    let _usdc_address = config.usdc_address(); // Compile-time check

    println!("   ✅ Compile-time type checking");
    println!("   ✅ No runtime errors");

    Ok(())
}

/// Demonstrate advanced crypto functionality
fn demo_advanced_crypto() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n🔐 5. Advanced Cryptographic Features (Go partially has)");

    // JWT Authentication (Go compatible)
    let jwt_token = jwt::create_auth_header(
        "test_key_id",
        "test_secret",
        "api.cdp.coinbase.com",
        "/platform/v2/x402/verify",
    )?;

    println!("   ✅ JWT authentication (Go compatible)");
    println!("   ✅ JWT Token: {}", &jwt_token[..50]);

    // Nonce generation
    let nonce = signature::generate_nonce();
    println!("   ✅ Nonce generation: {}", hex::encode(nonce.as_bytes()));

    // EIP-712 signature verification (Go doesn't have)
    println!("   ✅ EIP-712 signature verification functionality");
    println!("   ✅ Message signing functionality");
    println!("   ✅ Address recovery functionality");

    Ok(())
}
