//! Actix-web server example with x402 payment middleware
//!
//! This example demonstrates how to create an Actix-web server with x402 payment protection.

use actix_web::{
    middleware::Logger,
    web, App, HttpRequest, HttpResponse, HttpServer, Result,
};
use std::str::FromStr;
use x402::{
    middleware::PaymentMiddleware,
    types::{PaymentRequirements, FacilitatorConfig},
};

use x402::actix_web::{create_x402_middleware, handle_payment_verification};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logging
    env_logger::init();

    println!("🚀 Starting x402 Actix-web server on http://localhost:4022");

    // Create facilitator config
    let facilitator_config = FacilitatorConfig::default();
    
    // Create payment middleware
    let payment_middleware = PaymentMiddleware::new(
        rust_decimal::Decimal::from_str("0.0001").unwrap(),
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
    )
    .with_facilitator_config(facilitator_config)
    .with_description("Premium API access".to_string());

    // Create x402 middleware
    let x402_middleware = create_x402_middleware(payment_middleware);

    // Start server
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .service(
                web::scope("/api")
                    .route("/joke", web::get().to(joke_handler))
                    .route("/data", web::get().to(api_data_handler))
                    .route("/download", web::get().to(download_handler))
            )
            .route("/health", web::get().to(health_handler))
    })
    .bind("127.0.0.1:4022")?
    .run()
    .await
}

/// Protected joke endpoint
async fn joke_handler(req: HttpRequest) -> Result<HttpResponse> {
    // Define payment requirements
    let requirements = vec![PaymentRequirements {
        scheme: "exact".to_string(),
        network: "base-sepolia".to_string(),
        max_amount_required: "1000000".to_string(), // 0.0001 USDC in atomic units
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(), // USDC on Base
        pay_to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
        resource: "/api/joke".to_string(),
        description: "Premium joke access".to_string(),
        mime_type: Some("application/json".to_string()),
        max_timeout_seconds: 300,
        output_schema: None,
        extra: None,
    }];

    // Check payment
    match handle_payment_verification(&req, &requirements).await? {
        Some(response) => Ok(response),
        None => {
            // Payment verified, return joke
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "joke": "Why do programmers prefer dark mode? Because light attracts bugs!",
                "category": "programming",
                "premium": true
            })))
        }
    }
}

/// Protected API data endpoint
async fn api_data_handler(req: HttpRequest) -> Result<HttpResponse> {
    let requirements = vec![PaymentRequirements {
        scheme: "exact".to_string(),
        network: "base-sepolia".to_string(),
        max_amount_required: "1000000".to_string(),
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(),
        pay_to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
        resource: "/api/data".to_string(),
        description: "Premium data access".to_string(),
        mime_type: Some("application/json".to_string()),
        max_timeout_seconds: 300,
        output_schema: None,
        extra: None,
    }];

    match handle_payment_verification(&req, &requirements).await? {
        Some(response) => Ok(response),
        None => {
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "data": "This is premium data that requires payment",
                "timestamp": chrono::Utc::now(),
                "value": 42
            })))
        }
    }
}

/// Protected download endpoint
async fn download_handler(req: HttpRequest) -> Result<HttpResponse> {
    let requirements = vec![PaymentRequirements {
        scheme: "exact".to_string(),
        network: "base-sepolia".to_string(),
        max_amount_required: "1000000".to_string(),
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(),
        pay_to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
        resource: "/api/download".to_string(),
        description: "Premium file download".to_string(),
        mime_type: Some("application/octet-stream".to_string()),
        max_timeout_seconds: 300,
        output_schema: None,
        extra: None,
    }];

    match handle_payment_verification(&req, &requirements).await? {
        Some(response) => Ok(response),
        None => {
            // Simulate file download
            Ok(HttpResponse::Ok()
                .content_type("application/octet-stream")
                .header("Content-Disposition", "attachment; filename=\"premium_file.txt\"")
                .body("This is premium file content that requires payment!"))
        }
    }
}

/// Health check endpoint (no payment required)
async fn health_handler() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "x402-actix-server",
        "timestamp": chrono::Utc::now()
    })))
}
