//! Example client making x402 payments

// Note: FromStr import removed as it's not used in this example
use x402::{
    client::{DiscoveryClient, X402Client},
    types::{PaymentPayload, PaymentRequirements},
    wallet::WalletFactory,
    Result,
};

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    println!("🔍 Discovering x402 resources...");

    // Create discovery client
    let discovery = DiscoveryClient::default_client();

    // Discover available resources
    let resources = discovery.get_all_resources().await?;
    println!("Found {} discoverable resources", resources.items.len());

    // Create x402 client
    let client = X402Client::new()?;

    // Example 1: Make a request to a protected resource without payment
    println!("\n📡 Making request to protected resource without payment...");
    let response = client.get("http://localhost:4021/joke").send().await?;

    if response.status() == 402 {
        println!("💰 Payment required! Status: {}", response.status());

        // Parse payment requirements
        let payment_req: PaymentRequirements = response.json().await?;
        println!("Payment requirements:");
        println!(
            "  Amount: {} {}",
            payment_req.max_amount_required, payment_req.asset
        );
        println!("  Network: {}", payment_req.network);
        println!("  Description: {}", payment_req.description);

        // Create a real payment payload using wallet integration
        let payment_payload = create_real_payment_payload(&payment_req)?;

        // Retry request with payment
        println!("\n💳 Retrying request with payment...");
        let final_response = client
            .get("http://localhost:4021/joke")
            .payment(&payment_payload)?
            .send()
            .await?;

        if final_response.status().is_success() {
            // Check for settlement response first (before consuming response)
            let settlement_header = final_response.headers().get("X-PAYMENT-RESPONSE").cloned();

            let joke: serde_json::Value = final_response.json().await?;
            println!("✅ Success! Response: {}", joke);

            // Check for settlement response
            if let Some(settlement_header) = settlement_header {
                println!(
                    "🎉 Payment settled! Transaction: {}",
                    settlement_header.to_str().unwrap()
                );
            }
        } else {
            println!("❌ Request failed with status: {}", final_response.status());
        }
    } else {
        println!(
            "✅ No payment required. Response: {}",
            response.text().await?
        );
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

    for resource in &http_resources.items[..3] {
        // Show first 3
        println!("  📍 {} - {}", resource.resource, resource.r#type);
        if let Some(metadata) = &resource.metadata {
            println!("     Metadata: {}", metadata);
        }
    }

    Ok(())
}

/// Create a real payment payload using wallet integration
///
/// This function demonstrates how to create a payment payload using the real wallet implementation.
/// In production, you would:
///
/// 1. Load the private key from secure storage (hardware wallet, encrypted file, etc.)
/// 2. Use environment variables or secure key management services
/// 3. Implement proper key rotation and security practices
fn create_real_payment_payload(requirements: &PaymentRequirements) -> Result<PaymentPayload> {
    // In a real application, you would get the private key from secure storage
    // For demonstration purposes, we'll use a test private key
    // NEVER use hardcoded private keys in production!

    let private_key = std::env::var("X402_PRIVATE_KEY").unwrap_or_else(|_| {
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()
    });

    let payer_address = std::env::var("X402_PAYER_ADDRESS")
        .unwrap_or_else(|_| "0x857b06519E91e3A54538791bDbb0E22373e36b66".to_string());

    // Create a real wallet instance
    let wallet = WalletFactory::from_private_key(&private_key, &requirements.network)?;

    // Create the signed payment payload
    let payment_payload = wallet.create_signed_payment_payload(requirements, &payer_address)?;

    println!("✅ Created real payment payload with EIP-712 signature");
    println!("   Payer: {}", payer_address);
    println!("   Network: {}", requirements.network);
    println!(
        "   Amount: {} {}",
        requirements.max_amount_required, requirements.asset
    );

    Ok(payment_payload)
}
