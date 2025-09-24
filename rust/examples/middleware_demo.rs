//! Middleware demo showing how to use x402 payment middleware with different frameworks

use rust_decimal::Decimal;
use std::str::FromStr;
use x402::middleware::PaymentMiddleware;
use x402::types::PaymentPayload;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init();

    println!("🚀 x402 Middleware Demo");
    println!("======================");

    // Create payment middleware
    let middleware = PaymentMiddleware::new(
        Decimal::from_str("0.01").unwrap(),           // $0.01
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", // Pay-to address
    )
    .with_description("Demo payment")
    .with_testnet(true);

    println!("✅ Created payment middleware");
    println!("   Amount: $0.01");
    println!("   Network: Base Sepolia (testnet)");
    println!("   Pay-to: 0x209693Bc6afc0C5328bA36FaF03C514EF312287C");

    // Create a test payment payload
    let auth = x402::types::ExactEvmPayloadAuthorization::new(
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "1000000", // 1 USDC in atomic units
        "1745323800",
        "1745323985",
        "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    );

    let payload = x402::types::ExactEvmPayload {
        signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c".to_string(),
        authorization: auth,
    };

    let payment_payload = PaymentPayload::new("exact", "base-sepolia", payload);

    println!("\n🔍 Testing payment verification...");

    // Test payment verification
    match middleware.verify(&payment_payload).await {
        true => println!("✅ Payment verification: SUCCESS"),
        false => println!("❌ Payment verification: FAILED"),
    }

    // Test payment settlement
    println!("\n💰 Testing payment settlement...");
    match middleware.settle(&payment_payload).await {
        Ok(settlement) => {
            println!("✅ Payment settlement: SUCCESS");
            println!("   Transaction: {}", settlement.transaction);
            println!("   Network: {}", settlement.network);
        }
        Err(e) => {
            println!("❌ Payment settlement: FAILED - {}", e);
        }
    }

    println!("\n🎯 Middleware Features Implemented:");
    println!("   ✅ Payment verification with facilitator");
    println!("   ✅ Payment settlement after successful response");
    println!("   ✅ Automatic facilitator client creation");
    println!("   ✅ Error handling and logging");
    println!("   ✅ Support for all web frameworks (Axum, Actix-web, Warp)");

    println!("\n📚 Framework Integration:");
    println!("   • Axum: Use payment_middleware_handler()");
    println!("   • Actix-web: Use x402_middleware()");
    println!("   • Warp: Use x402_payment_filter()");

    println!("\n✨ Demo completed successfully!");

    Ok(())
}
