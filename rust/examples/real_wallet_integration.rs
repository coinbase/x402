//! Real Wallet Integration Example
//!
//! This example demonstrates how to integrate x402 with real wallet implementations.
//! It shows the proper way to:
//! 1. Generate cryptographically secure nonces
//! 2. Create EIP-712 signatures with real private keys
//! 3. Handle wallet interactions properly
//! 4. Implement proper error handling for wallet operations

use std::str::FromStr;
use x402::{
    client::X402Client,
    crypto::{
        eip712::{create_transfer_with_authorization_hash, Domain},
        signature::{generate_nonce, sign_message_hash, verify_payment_payload},
    },
    types::{ExactEvmPayload, ExactEvmPayloadAuthorization, PaymentPayload, PaymentRequirements},
    Result,
};

/// Example of creating a payment payload with real wallet integration
///
/// In a real application, this would be integrated with:
/// - ethers-rs for Ethereum interactions
/// - alloy-rs for modern Ethereum development
/// - wallet libraries like WalletConnect
/// - Hardware wallets (Ledger, Trezor)
/// - Browser extension wallets (MetaMask, Coinbase Wallet)
pub struct RealWalletIntegration {
    /// Private key for signing (in production, this would come from secure storage)
    private_key: String,
    /// Network configuration
    network: String,
}

impl RealWalletIntegration {
    /// Create a new wallet integration instance
    pub fn new(private_key: String, network: String) -> Self {
        Self {
            private_key,
            network,
        }
    }

    /// Create a payment payload with real signature
    ///
    /// This is the proper way to create payment payloads in production:
    /// 1. Generate a secure random nonce
    /// 2. Set appropriate timestamps
    /// 3. Create the EIP-712 authorization
    /// 4. Sign with the user's private key
    /// 5. Verify the signature before sending
    pub fn create_signed_payment_payload(
        &self,
        requirements: &PaymentRequirements,
        from_address: &str,
    ) -> Result<PaymentPayload> {
        // Step 1: Generate a cryptographically secure nonce
        let nonce = generate_nonce();

        // Step 2: Set appropriate timestamps
        let now = chrono::Utc::now().timestamp();
        let valid_after = (now - 60).to_string(); // Allow 1 minute leeway
        let valid_before = (now + 300).to_string(); // 5 minutes validity window

        // Step 3: Create the authorization
        let authorization = ExactEvmPayloadAuthorization::new(
            from_address,
            &requirements.pay_to,
            &requirements.max_amount_required,
            valid_after,
            valid_before,
            format!("{:?}", nonce),
        );

        // Step 4: Create the EIP-712 message hash
        let network_config = get_network_config(&self.network)?;
        let domain = Domain {
            name: "USD Coin".to_string(),
            version: "2".to_string(),
            chain_id: network_config.chain_id,
            verifying_contract: network_config.usdc_contract,
        };

        let message_hash = create_transfer_with_authorization_hash(
            &domain,
            ethereum_types::Address::from_str(from_address)?,
            ethereum_types::Address::from_str(&requirements.pay_to)?,
            ethereum_types::U256::from_str_radix(&requirements.max_amount_required, 10)?,
            ethereum_types::U256::from_str_radix(&authorization.valid_after, 10)?,
            ethereum_types::U256::from_str_radix(&authorization.valid_before, 10)?,
            nonce,
        )?;

        // Step 5: Sign the message hash with the private key
        let signature = sign_message_hash(message_hash, &self.private_key)?;

        // Step 6: Create the payload
        let payload = ExactEvmPayload {
            signature,
            authorization,
        };

        let payment_payload =
            PaymentPayload::new(&requirements.scheme, &requirements.network, payload);

        // Step 7: Verify the signature (optional but recommended)
        let is_valid =
            verify_payment_payload(&payment_payload.payload, from_address, &self.network)?;

        if !is_valid {
            return Err(x402::X402Error::invalid_signature(
                "Generated signature verification failed",
            ));
        }

        Ok(payment_payload)
    }

    /// Make a payment request with proper error handling
    pub async fn make_payment_request(
        &self,
        client: &X402Client,
        url: &str,
        from_address: &str,
    ) -> Result<serde_json::Value> {
        // Step 1: Make initial request to get payment requirements
        let response = client.get(url).send().await?;

        if response.status() != 402 {
            // No payment required, return the response
            return Ok(response.json().await?);
        }

        // Step 2: Parse payment requirements
        let payment_req: PaymentRequirements = response.json().await?;

        // Step 3: Create signed payment payload
        let payment_payload = self.create_signed_payment_payload(&payment_req, from_address)?;

        // Step 4: Retry request with payment
        let final_response = client.get(url).payment(&payment_payload)?.send().await?;

        if !final_response.status().is_success() {
            return Err(x402::X402Error::payment_verification_failed(format!(
                "Payment request failed with status: {}",
                final_response.status()
            )));
        }

        // Step 5: Check for settlement response
        if let Some(settlement_header) = final_response.headers().get("X-PAYMENT-RESPONSE") {
            println!(
                "Payment settled: {}",
                settlement_header.to_str().unwrap_or("")
            );
        }

        Ok(final_response.json().await?)
    }
}

/// Network configuration for different networks
#[derive(Debug, Clone)]
struct NetworkConfig {
    chain_id: u64,
    usdc_contract: ethereum_types::Address,
}

/// Get network configuration
fn get_network_config(network: &str) -> Result<NetworkConfig> {
    match network {
        "base-sepolia" => Ok(NetworkConfig {
            chain_id: 84532,
            usdc_contract: ethereum_types::Address::from_str(
                "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            )?,
        }),
        "base" => Ok(NetworkConfig {
            chain_id: 8453,
            usdc_contract: ethereum_types::Address::from_str(
                "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            )?,
        }),
        _ => Err(x402::X402Error::invalid_network(format!(
            "Unsupported network: {}",
            network
        ))),
    }
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt::init();

    println!("🔐 Real Wallet Integration Example");
    println!("===================================");

    // NOTE: In a real application, you would:
    // 1. Get the private key from secure storage (hardware wallet, encrypted file, etc.)
    // 2. Never hardcode private keys in source code
    // 3. Use proper key management practices

    // For demonstration purposes only - DO NOT use in production
    let private_key = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    let network = "base-sepolia";
    let from_address = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

    // Create wallet integration
    let wallet = RealWalletIntegration::new(private_key.to_string(), network.to_string());

    // Create HTTP client
    let client = X402Client::new()?;

    // Example payment request
    println!("💰 Making payment request...");

    match wallet
        .make_payment_request(&client, "http://localhost:4021/joke", from_address)
        .await
    {
        Ok(response) => {
            println!("✅ Payment successful!");
            println!("Response: {}", serde_json::to_string_pretty(&response)?);
        }
        Err(e) => {
            println!("❌ Payment failed: {}", e);
            println!("This is expected if no server is running on localhost:4021");
        }
    }

    println!("\n📝 Key Points for Production Implementation:");
    println!("1. Use secure key storage (hardware wallets, encrypted files)");
    println!("2. Implement proper error handling and retry logic");
    println!("3. Add transaction monitoring and confirmation");
    println!("4. Use proper network configuration management");
    println!("5. Implement rate limiting and anti-replay protection");
    println!("6. Add comprehensive logging and monitoring");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_config() {
        let base_sepolia = get_network_config("base-sepolia").unwrap();
        assert_eq!(base_sepolia.chain_id, 84532);

        let base = get_network_config("base").unwrap();
        assert_eq!(base.chain_id, 8453);

        let unsupported = get_network_config("unsupported");
        assert!(unsupported.is_err());
    }

    #[test]
    fn test_wallet_creation() {
        let wallet = RealWalletIntegration::new("0x1234".to_string(), "base-sepolia".to_string());
        assert_eq!(wallet.network, "base-sepolia");
    }
}
