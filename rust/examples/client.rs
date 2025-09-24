//! Example client making x402 payments

use x402::{
    client::{X402Client, DiscoveryClient, DiscoveryFilters},
    types::{PaymentPayload, PaymentRequirements, ExactEvmPayload, ExactEvmPayloadAuthorization},
    Result, X402Error,
};
use std::str::FromStr;
use tracing_subscriber;

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    println!("🔍 Discovering x402 resources...");

    // Create discovery client
    let discovery = DiscoveryClient::default();
    
    // Discover available resources
    let resources = discovery.get_all_resources().await?;
    println!("Found {} discoverable resources", resources.items.len());

    // Create x402 client
    let client = X402Client::new();

    // Example 1: Make a request to a protected resource without payment
    println!("\n📡 Making request to protected resource without payment...");
    let response = client.get("http://localhost:4021/joke").send().await?;
    
    if response.status() == 402 {
        println!("💰 Payment required! Status: {}", response.status());
        
        // Parse payment requirements
        let payment_req: PaymentRequirements = response.json().await?;
        println!("Payment requirements:");
        println!("  Amount: {} {}", payment_req.max_amount_required, payment_req.asset);
        println!("  Network: {}", payment_req.network);
        println!("  Description: {}", payment_req.description);
        
        // Create a mock payment payload (in real usage, this would be signed by a wallet)
        let payment_payload = create_mock_payment_payload(&payment_req)?;
        
        // Retry request with payment
        println!("\n💳 Retrying request with payment...");
        let final_response = client
            .get("http://localhost:4021/joke")
            .payment(&payment_payload)?
            .send()
            .await?;
            
        if final_response.status().is_success() {
            let joke: serde_json::Value = final_response.json().await?;
            println!("✅ Success! Response: {}", joke);
            
            // Check for settlement response
            if let Some(settlement_header) = final_response.headers().get("X-PAYMENT-RESPONSE") {
                println!("🎉 Payment settled! Transaction: {}", settlement_header.to_str().unwrap());
            }
        } else {
            println!("❌ Request failed with status: {}", final_response.status());
        }
    } else {
        println!("✅ No payment required. Response: {}", response.text().await?);
    }

    // Example 2: Test health endpoint (should be free)
    println!("\n🏥 Testing health endpoint...");
    let health_response = client.get("http://localhost:4021/health").send().await?;
    if health_response.status().is_success() {
        let health: serde_json::Value = health_response.json().await?;
        println!("✅ Health check passed: {}", health);
    }

    // Example 3: Discover resources by type
    println!("\n🔍 Discovering HTTP resources...");
    let http_resources = discovery.get_resources_by_type("http").await?;
    println!("Found {} HTTP resources", http_resources.items.len());

    for resource in &http_resources.items[..3] { // Show first 3
        println!("  📍 {} - {}", resource.resource, resource.r#type);
        if let Some(metadata) = &resource.metadata {
            println!("     Metadata: {}", metadata);
        }
    }

    Ok(())
}

/// Create a mock payment payload for demonstration
/// In real usage, this would be created and signed by a wallet
fn create_mock_payment_payload(requirements: &PaymentRequirements) -> Result<PaymentPayload> {
    // This is a mock implementation - in reality, you'd need to:
    // 1. Generate a proper nonce
    // 2. Set appropriate timestamps
    // 3. Sign the authorization with a private key
    
    let authorization = ExactEvmPayloadAuthorization::new(
        "0x857b06519E91e3A54538791bDbb0E22373e36b66", // Payer address
        &requirements.pay_to,
        &requirements.max_amount_required,
        chrono::Utc::now().timestamp().to_string(), // valid_after
        (chrono::Utc::now().timestamp() + 300).to_string(), // valid_before (5 minutes)
        "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480", // Mock nonce
    );

    let payload = ExactEvmPayload {
        signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c".to_string(),
        authorization,
    };

    Ok(PaymentPayload::new(
        &requirements.scheme,
        &requirements.network,
        payload,
    ))
}
