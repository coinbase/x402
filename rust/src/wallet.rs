//! Real wallet integration for x402 payments
//!
//! This module provides real wallet implementations for creating and signing
//! x402 payment payloads with actual private keys and EIP-712 signatures.

use crate::{
    crypto::{
        eip712::{create_transfer_with_authorization_hash, Domain},
        signature::{generate_nonce, sign_message_hash, verify_payment_payload},
    },
    types::{ExactEvmPayload, ExactEvmPayloadAuthorization, PaymentPayload, PaymentRequirements},
    Result, X402Error,
};
use ethereum_types::{Address, U256};
use std::str::FromStr;

/// Wallet implementation for x402 payments
#[derive(Debug)]
pub struct Wallet {
    /// Private key for signing (in production, this should come from secure storage)
    private_key: String,
    /// Network configuration
    network: String,
}

impl Wallet {
    /// Create a new wallet instance
    ///
    /// # Security Note
    /// In production, the private key should be loaded from:
    /// - Hardware wallets (Ledger, Trezor)
    /// - Encrypted key stores
    /// - Secure environment variables
    /// - Key management services (AWS KMS, Azure Key Vault)
    pub fn new(private_key: String, network: String) -> Self {
        Self {
            private_key,
            network,
        }
    }

    /// Create a payment payload with real EIP-712 signature
    ///
    /// This is the production-ready implementation that:
    /// 1. Generates cryptographically secure random nonce
    /// 2. Creates proper EIP-712 message hash
    /// 3. Signs with the user's private key
    /// 4. Verifies the signature before returning
    pub fn create_signed_payment_payload(
        &self,
        requirements: &PaymentRequirements,
        from_address: &str,
    ) -> Result<PaymentPayload> {
        // Step 1: Generate cryptographically secure nonce
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
        let network_config = self.get_network_config()?;
        let domain = Domain {
            name: "USD Coin".to_string(),
            version: "2".to_string(),
            chain_id: network_config.chain_id,
            verifying_contract: network_config.usdc_contract,
        };

        let message_hash = create_transfer_with_authorization_hash(
            &domain,
            Address::from_str(from_address)
                .map_err(|_| X402Error::invalid_authorization("Invalid from address format"))?,
            Address::from_str(&requirements.pay_to)
                .map_err(|_| X402Error::invalid_authorization("Invalid pay_to address format"))?,
            U256::from_str_radix(&requirements.max_amount_required, 10)
                .map_err(|_| X402Error::invalid_authorization("Invalid amount format"))?,
            U256::from_str_radix(&authorization.valid_after, 10)
                .map_err(|_| X402Error::invalid_authorization("Invalid valid_after format"))?,
            U256::from_str_radix(&authorization.valid_before, 10)
                .map_err(|_| X402Error::invalid_authorization("Invalid valid_before format"))?,
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

        // Step 7: Verify the signature (production best practice)
        let is_valid =
            verify_payment_payload(&payment_payload.payload, from_address, &self.network)?;

        if !is_valid {
            return Err(X402Error::invalid_signature(
                "Generated signature verification failed",
            ));
        }

        Ok(payment_payload)
    }

    /// Get network configuration for the current network
    pub fn get_network_config(&self) -> Result<WalletNetworkConfig> {
        match self.network.as_str() {
            "base-sepolia" => Ok(WalletNetworkConfig {
                chain_id: 84532,
                usdc_contract: Address::from_str("0x036CbD53842c5426634e7929541eC2318f3dCF7e")
                    .map_err(|_| X402Error::invalid_network("Invalid USDC contract address"))?,
            }),
            "base" => Ok(WalletNetworkConfig {
                chain_id: 8453,
                usdc_contract: Address::from_str("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
                    .map_err(|_| X402Error::invalid_network("Invalid USDC contract address"))?,
            }),
            "avalanche-fuji" => Ok(WalletNetworkConfig {
                chain_id: 43113,
                usdc_contract: Address::from_str("0x5425890298aed601595a70AB815c96711a31Bc65")
                    .map_err(|_| X402Error::invalid_network("Invalid USDC contract address"))?,
            }),
            "avalanche" => Ok(WalletNetworkConfig {
                chain_id: 43114,
                usdc_contract: Address::from_str("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E")
                    .map_err(|_| X402Error::invalid_network("Invalid USDC contract address"))?,
            }),
            _ => Err(X402Error::invalid_network(format!(
                "Unsupported network: {}",
                self.network
            ))),
        }
    }

    /// Get the network name
    pub fn network(&self) -> &str {
        &self.network
    }
}

/// Wallet network configuration for different blockchains
#[derive(Debug, Clone)]
pub struct WalletNetworkConfig {
    pub chain_id: u64,
    pub usdc_contract: Address,
}

/// Wallet factory for creating wallets from different sources
pub struct WalletFactory;

impl WalletFactory {
    /// Create wallet from private key string
    pub fn from_private_key(private_key: &str, network: &str) -> Result<Wallet> {
        // Validate private key format
        if !private_key.starts_with("0x") || private_key.len() != 66 {
            return Err(X402Error::invalid_authorization(
                "Invalid private key format. Must be 64 hex characters with 0x prefix",
            ));
        }

        // Validate hex format
        hex::decode(&private_key[2..])
            .map_err(|_| X402Error::invalid_authorization("Invalid hex in private key"))?;

        Ok(Wallet::new(private_key.to_string(), network.to_string()))
    }

    /// Create wallet from environment variable
    pub fn from_env(private_key_env: &str, network: &str) -> Result<Wallet> {
        let private_key = std::env::var(private_key_env).map_err(|_| {
            X402Error::config(format!(
                "Environment variable {} not found",
                private_key_env
            ))
        })?;

        Self::from_private_key(&private_key, network)
    }

    /// Create wallet with network from environment
    pub fn from_env_with_network(private_key_env: &str, network_env: &str) -> Result<Wallet> {
        let private_key = std::env::var(private_key_env).map_err(|_| {
            X402Error::config(format!(
                "Environment variable {} not found",
                private_key_env
            ))
        })?;

        let network = std::env::var(network_env).map_err(|_| {
            X402Error::config(format!("Environment variable {} not found", network_env))
        })?;

        Self::from_private_key(&private_key, &network)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_creation() {
        let wallet = Wallet::new(
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string(),
            "base-sepolia".to_string(),
        );
        assert_eq!(wallet.network(), "base-sepolia");
    }

    #[test]
    fn test_wallet_factory_valid_key() {
        let wallet = WalletFactory::from_private_key(
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "base-sepolia",
        );
        assert!(wallet.is_ok());
    }

    #[test]
    fn test_wallet_factory_invalid_key() {
        let wallet = WalletFactory::from_private_key("invalid", "base-sepolia");
        assert!(wallet.is_err(), "Invalid private key should fail");

        // Verify the specific error type
        let error = wallet.unwrap_err();
        match error {
            X402Error::InvalidAuthorization { message: _ } => {
                // This is the expected error type
            }
            _ => panic!("Expected InvalidAuthorization error, got: {:?}", error),
        }
    }

    #[test]
    fn test_wallet_factory_edge_cases() {
        // Test empty string
        let wallet = WalletFactory::from_private_key("", "base-sepolia");
        assert!(wallet.is_err(), "Empty private key should fail");

        // Test too short key
        let wallet = WalletFactory::from_private_key("0x123", "base-sepolia");
        assert!(wallet.is_err(), "Too short private key should fail");

        // Test too long key
        let wallet = WalletFactory::from_private_key("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", "base-sepolia");
        assert!(wallet.is_err(), "Too long private key should fail");

        // Test invalid hex characters
        let wallet = WalletFactory::from_private_key(
            "0xgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg",
            "base-sepolia",
        );
        assert!(wallet.is_err(), "Invalid hex characters should fail");

        // Test missing 0x prefix
        let wallet = WalletFactory::from_private_key(
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "base-sepolia",
        );
        assert!(wallet.is_err(), "Missing 0x prefix should fail");
    }

    #[test]
    fn test_network_config() {
        let wallet = Wallet::new(
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string(),
            "base-sepolia".to_string(),
        );
        let config = wallet.get_network_config().unwrap();
        assert_eq!(config.chain_id, 84532);
    }
}
