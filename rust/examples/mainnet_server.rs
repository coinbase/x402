//! Example mainnet server with x402 payment protection
//!
//! This example demonstrates how to create a production-ready server
//! using mainnet configuration with proper CDP authentication.

use axum::{response::Json, routing::get};
use rust_decimal::Decimal;
use serde_json::json;
use std::str::FromStr;
use x402::{
    axum::{create_payment_app, examples, AxumPaymentConfig},
    facilitator::coinbase,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Check for required environment variables
    let api_key_id = std::env::var("CDP_API_KEY_ID")
        .map_err(|_| "CDP_API_KEY_ID environment variable is required")?;
    let api_key_secret = std::env::var("CDP_API_KEY_SECRET")
        .map_err(|_| "CDP_API_KEY_SECRET environment variable is required")?;
    let pay_to =
        std::env::var("ADDRESS").map_err(|_| "ADDRESS environment variable is required")?;

    if api_key_id.is_empty() || api_key_secret.is_empty() || pay_to.is_empty() {
        eprintln!("❌ Error: Required environment variables are missing or empty");
        eprintln!();
        eprintln!("Please set these environment variables:");
        eprintln!("  CDP_API_KEY_ID=your_key_id");
        eprintln!("  CDP_API_KEY_SECRET=your_key_secret");
        eprintln!("  ADDRESS=your_wallet_address");
        eprintln!();
        eprintln!("You can also create a .env file with these values.");
        std::process::exit(1);
    }

    println!("🔐 Using CDP authentication for mainnet");
    println!("💰 Recipient address: {}", pay_to);

    // Create facilitator configuration with CDP authentication
    let facilitator_config =
        coinbase::coinbase_config_with_credentials(&api_key_id, &api_key_secret);

    // Create payment configuration for mainnet
    let payment_config = AxumPaymentConfig::new(
        Decimal::from_str("0.01")?, // $0.01 USD
        &pay_to,
    )
    .with_description("Premium API access - Mainnet")
    .with_mime_type("application/json")
    .with_facilitator_config(facilitator_config)
    .with_testnet(false) // Use mainnet!
    .with_tracing()
    .with_cors(vec!["*".to_string()]); // Allow all origins in production

    // Create the application
    let app = create_payment_app(payment_config, |router| {
        router
            .route("/premium-joke", get(examples::joke_handler))
            .route("/api/data", get(examples::api_data_handler))
            .route("/download", get(examples::download_handler))
            .route("/health", get(health_handler))
            .route("/status", get(status_handler))
    });

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:4021").await?;

    println!("🚀 Mainnet server running on http://0.0.0.0:4021");
    println!("💰 Protected endpoints (require $0.01 USDC payment):");
    println!("   GET /premium-joke - Premium joke API");
    println!("   GET /api/data - Premium data API");
    println!("   GET /download - Premium file download");
    println!("   GET /status - Server status");
    println!("   GET /health - Health check (free)");
    println!();
    println!("⚠️  WARNING: This is running on MAINNET!");
    println!("   Make sure your CDP credentials are correct.");
    println!("   Test with small amounts first.");

    axum::serve(listener, app).await?;

    Ok(())
}

/// Health check handler (no payment required)
async fn health_handler() -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "service": "x402-mainnet-server",
        "network": "mainnet",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// Status handler (requires payment)
async fn status_handler() -> Json<serde_json::Value> {
    Json(json!({
        "status": "operational",
        "service": "x402-mainnet-server",
        "network": "mainnet",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime": "unknown", // In a real app, you'd track this
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}
