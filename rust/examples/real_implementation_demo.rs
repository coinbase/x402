//! Real Implementation Demo
//!
//! This example demonstrates the complete real implementation of x402 payments,
//! including real wallet signatures, blockchain verification, and facilitator settlement.

use x402::{
    blockchain::{BlockchainClientFactory, TransactionStatus},
    client::X402Client,
    error::X402Error,
    real_facilitator::{RealFacilitatorClient, RealFacilitatorFactory},
    types::{PaymentPayload, PaymentRequirements},
    wallet::{RealWallet, WalletFactory},
    Result,
};

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt::init();

    println!("🚀 x402 Real Implementation Demo");
    println!("=================================");

    // Step 1: Setup real wallet
    println!("\n1️⃣ Setting up real wallet...");
    let wallet = setup_real_wallet()?;
    println!("✅ Wallet configured for network: {}", wallet.network());

    // Step 2: Setup real facilitator
    println!("\n2️⃣ Setting up real facilitator...");
    let facilitator = setup_real_facilitator()?;
    println!("✅ Facilitator configured");

    // Step 3: Setup blockchain client
    println!("\n3️⃣ Setting up blockchain client...");
    let blockchain_client = BlockchainClientFactory::base_sepolia();
    let network_info = blockchain_client.get_network_info().await?;
    println!(
        "✅ Connected to network: {} (Chain ID: {})",
        network_info.network_name, network_info.chain_id
    );

    // Step 4: Create payment requirements
    println!("\n4️⃣ Creating payment requirements...");
    let payment_req = create_payment_requirements();
    println!("✅ Payment requirements created");
    println!("   Amount: {} USDC", payment_req.max_amount_required);
    println!("   Network: {}", payment_req.network);
    println!("   Pay to: {}", payment_req.pay_to);

    // Step 5: Create real payment payload
    println!("\n5️⃣ Creating real payment payload...");
    let payment_payload =
        wallet.create_signed_payment_payload(&payment_req, &get_payer_address())?;
    println!("✅ Real payment payload created with EIP-712 signature");

    // Step 6: Verify payment with real facilitator
    println!("\n6️⃣ Verifying payment with real facilitator...");
    let verification = facilitator.verify(&payment_payload, &payment_req).await?;
    if verification.is_valid {
        println!("✅ Payment verification successful");
        println!("   Payer: {:?}", verification.payer);
    } else {
        println!(
            "❌ Payment verification failed: {:?}",
            verification.invalid_reason
        );
        return Ok(());
    }

    // Step 7: Check payer balance
    println!("\n7️⃣ Checking payer balance...");
    let balance_info = blockchain_client
        .get_usdc_balance(&get_payer_address())
        .await?;
    if let Some(token_balance) = balance_info.token_balance {
        let balance: u128 = u128::from_str_radix(token_balance.trim_start_matches("0x"), 16)
            .map_err(|_| X402Error::InvalidAmount {
                expected: "hex string".to_string(),
                got: "invalid format".to_string(),
            })?;
        println!(
            "✅ Payer USDC balance: {} ({} wei)",
            balance / 1_000_000,
            balance
        );
    } else {
        println!("⚠️  Could not retrieve token balance");
    }

    // Step 8: Settle payment with real facilitator
    println!("\n8️⃣ Settling payment with real facilitator...");
    let settlement = facilitator.settle(&payment_payload, &payment_req).await?;
    if settlement.success {
        println!("✅ Payment settlement successful!");
        println!("   Transaction: {}", settlement.transaction);
        println!("   Network: {}", settlement.network);
        println!("   Payer: {:?}", settlement.payer);
    } else {
        println!(
            "❌ Payment settlement failed: {:?}",
            settlement.error_reason
        );
        return Ok(());
    }

    // Step 9: Monitor transaction confirmation
    println!("\n9️⃣ Monitoring transaction confirmation...");
    monitor_transaction_confirmation(&blockchain_client, &settlement.transaction).await?;

    // Step 10: Make real HTTP request
    println!("\n🔟 Making real HTTP request with payment...");
    make_real_http_request(&payment_payload).await?;

    println!("\n🎉 Real implementation demo completed successfully!");
    println!("\n📝 Key Features Demonstrated:");
    println!("   ✅ Real EIP-712 signature creation and verification");
    println!("   ✅ Real blockchain network interaction");
    println!("   ✅ Real USDC balance checking");
    println!("   ✅ Real transaction monitoring");
    println!("   ✅ Real facilitator integration");
    println!("   ✅ Real HTTP client with payment headers");

    Ok(())
}

/// Setup real wallet from environment variables
fn setup_real_wallet() -> Result<RealWallet> {
    let private_key = std::env::var("X402_PRIVATE_KEY").unwrap_or_else(|_| {
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()
    });

    let network = std::env::var("X402_NETWORK").unwrap_or_else(|_| "base-sepolia".to_string());

    WalletFactory::from_private_key(&private_key, &network)
}

/// Setup real facilitator
fn setup_real_facilitator() -> Result<RealFacilitatorClient> {
    RealFacilitatorFactory::base_sepolia()
}

/// Create payment requirements
fn create_payment_requirements() -> PaymentRequirements {
    PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000",                                    // 1 USDC
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", // Pay to address
        "https://api.example.com/premium",
        "Premium API access with real implementation",
    )
}

/// Get payer address from environment or use default
fn get_payer_address() -> String {
    std::env::var("X402_PAYER_ADDRESS")
        .unwrap_or_else(|_| "0x857b06519E91e3A54538791bDbb0E22373e36b66".to_string())
}

/// Monitor transaction confirmation
async fn monitor_transaction_confirmation(
    blockchain_client: &x402::blockchain::BlockchainClient,
    transaction_hash: &str,
) -> Result<()> {
    let mut attempts = 0;
    let max_attempts = 30; // 30 seconds timeout

    println!("   Monitoring transaction: {}", transaction_hash);

    while attempts < max_attempts {
        match blockchain_client
            .get_transaction_status(transaction_hash)
            .await
        {
            Ok(tx_info) => match tx_info.status {
                TransactionStatus::Confirmed => {
                    println!("✅ Transaction confirmed!");
                    println!("   Block number: {:?}", tx_info.block_number);
                    println!("   Gas used: {:?}", tx_info.gas_used);
                    return Ok(());
                }
                TransactionStatus::Failed => {
                    println!("❌ Transaction failed on blockchain");
                    return Err(X402Error::PaymentSettlementFailed {
                        reason: "Transaction failed".to_string(),
                    }
                    .into());
                }
                TransactionStatus::Pending => {
                    println!(
                        "   ⏳ Transaction pending... (attempt {}/{})",
                        attempts + 1,
                        max_attempts
                    );
                }
                TransactionStatus::Unknown => {
                    println!(
                        "   🔍 Transaction not found yet... (attempt {}/{})",
                        attempts + 1,
                        max_attempts
                    );
                }
            },
            Err(e) => {
                println!("   ⚠️  Error checking transaction: {}", e);
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        attempts += 1;
    }

    println!("⚠️  Transaction confirmation timeout");
    Ok(())
}

/// Make real HTTP request with payment
async fn make_real_http_request(payment_payload: &PaymentPayload) -> Result<()> {
    let client = X402Client::new()?;

    // Try to make a request to a real endpoint (this will fail if no server is running)
    match client
        .get("http://localhost:4021/premium")
        .payment(payment_payload)?
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                println!("✅ HTTP request successful!");
                let data: serde_json::Value = response.json().await?;
                println!("   Response: {}", serde_json::to_string_pretty(&data)?);
            } else {
                println!("⚠️  HTTP request returned status: {}", response.status());
            }
        }
        Err(e) => {
            println!(
                "⚠️  HTTP request failed (expected if no server is running): {}",
                e
            );
            println!(
                "   This is normal for the demo - in production, you would have a real server"
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_setup() {
        let wallet = setup_real_wallet();
        assert!(wallet.is_ok());
    }

    #[test]
    fn test_facilitator_setup() {
        let facilitator = setup_real_facilitator();
        assert!(facilitator.is_ok());
    }

    #[test]
    fn test_payment_requirements_creation() {
        let req = create_payment_requirements();
        assert_eq!(req.scheme, "exact");
        assert_eq!(req.network, "base-sepolia");
    }
}
