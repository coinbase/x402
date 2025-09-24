//! Example Axum server with x402 payment middleware

use axum::{response::Json, routing::get};
use rust_decimal::Decimal;
use serde_json::json;
use std::str::FromStr;
// Note: ServiceBuilder and TraceLayer imports removed as they're not used in this example
use tracing_subscriber;

use x402::{
    axum::{create_payment_app, examples, AxumPaymentConfig},
    types::FacilitatorConfig,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Create facilitator configuration
    let facilitator_config = FacilitatorConfig::default();

    // Create payment configuration
    let payment_config = AxumPaymentConfig::new(
        Decimal::from_str("0.0001")?,                 // 1/10th of a cent
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", // Recipient address
    )
    .with_description("Premium API access")
    .with_mime_type("application/json")
    .with_facilitator_config(facilitator_config)
    .with_testnet(true)
    .with_tracing()
    .with_cors(vec!["http://localhost:3000".to_string()]);

    // Create the application
    let app = create_payment_app(payment_config, |router| {
        router
            .route("/joke", get(examples::joke_handler))
            .route("/api/data", get(examples::api_data_handler))
            .route("/download", get(examples::download_handler))
            .route("/health", get(health_handler))
    });

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:4021").await?;
    println!("🚀 Server running on http://0.0.0.0:4021");
    println!("💰 Protected endpoints:");
    println!("   GET /joke - Premium joke API");
    println!("   GET /api/data - Premium data API");
    println!("   GET /download - Premium file download");
    println!("   GET /health - Health check (free)");

    axum::serve(listener, app).await?;

    Ok(())
}

/// Health check handler (no payment required)
async fn health_handler() -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "service": "x402-axum-server",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}
