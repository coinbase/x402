//! Warp server example with x402 payment middleware
//!
//! This example demonstrates how to create a Warp server with x402 payment protection.

use std::str::FromStr;
use warp::{
    http::StatusCode,
    reply::{json, with_status},
    Filter, Reply,
};
use x402::{
    middleware::PaymentMiddleware,
    types::{PaymentRequirements, FacilitatorConfig},
};

use x402::warp::{create_x402_middleware, require_payment, payment_handler};

#[tokio::main]
async fn main() {
    println!("🚀 Starting x402 Warp server on http://localhost:4023");

    // Create facilitator config
    let facilitator_config = FacilitatorConfig::default();
    
    // Create payment middleware
    let payment_middleware = PaymentMiddleware::new(
        rust_decimal::Decimal::from_str("0.0001").unwrap(),
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
    )
    .with_facilitator_config(facilitator_config)
    .with_description("Premium API access".to_string());

    // Define payment requirements
    let payment_requirements = vec![PaymentRequirements {
        scheme: "exact".to_string(),
        network: "base-sepolia".to_string(),
        max_amount_required: "1000000".to_string(),
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(),
        pay_to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
        resource: "/api".to_string(),
        description: "Premium API access".to_string(),
        mime_type: Some("application/json".to_string()),
        max_timeout_seconds: 300,
        output_schema: None,
        extra: None,
    }];

    // Create x402 middleware
    let x402_middleware = create_x402_middleware(payment_middleware);

    // Define routes
    let joke_route = warp::path!("api" / "joke")
        .and(warp::get())
        .and(x402_middleware.clone())
        .and_then(joke_handler);

    let data_route = warp::path!("api" / "data")
        .and(warp::get())
        .and(x402_middleware.clone())
        .and_then(data_handler);

    let download_route = warp::path!("api" / "download")
        .and(warp::get())
        .and(x402_middleware.clone())
        .and_then(download_handler);

    let health_route = warp::path!("health")
        .and(warp::get())
        .map(health_handler);

    let payment_route = payment_handler();

    // Combine all routes
    let routes = joke_route
        .or(data_route)
        .or(download_route)
        .or(health_route)
        .or(payment_route)
        .with(warp::cors().allow_any_origin().allow_headers(vec!["content-type"]).allow_methods(vec!["GET", "POST"]));

    println!("📡 Server running on http://localhost:4023");
    println!("🔒 Protected endpoints:");
    println!("  GET /api/joke - Premium joke");
    println!("  GET /api/data - Premium data");
    println!("  GET /api/download - Premium download");
    println!("🔓 Public endpoints:");
    println!("  GET /health - Health check");
    println!("  GET / - Payment requirements");

    warp::serve(routes)
        .run(([127, 0, 0, 1], 4023))
        .await;
}

/// Protected joke handler
async fn joke_handler() -> Result<impl Reply, warp::Rejection> {
    Ok(with_status(
        json(&serde_json::json!({
            "joke": "Why do programmers prefer dark mode? Because light attracts bugs!",
            "category": "programming",
            "premium": true
        })),
        StatusCode::OK,
    ))
}

/// Protected data handler
async fn data_handler() -> Result<impl Reply, warp::Rejection> {
    Ok(with_status(
        json(&serde_json::json!({
            "data": "This is premium data that requires payment",
            "timestamp": chrono::Utc::now(),
            "value": 42
        })),
        StatusCode::OK,
    ))
}

/// Protected download handler
async fn download_handler() -> Result<impl Reply, warp::Rejection> {
    Ok(warp::reply::Response::new(
        "This is premium file content that requires payment!".into()
    ))
}

/// Health check handler (no payment required)
fn health_handler() -> impl Reply {
    with_status(
        json(&serde_json::json!({
            "status": "healthy",
            "service": "x402-warp-server",
            "timestamp": chrono::Utc::now()
        })),
        StatusCode::OK,
    )
}
