//! # x402 - HTTP-native micropayments
//!
//! A Rust implementation of the x402 protocol for HTTP-native micropayments.
//! This library provides the core types, client, and middleware for implementing
//! payment-protected HTTP resources.

pub mod client;
pub mod crypto;
pub mod error;
pub mod facilitator;
pub mod middleware;
pub mod proxy;
pub mod template;
pub mod types;

// Re-exports for convenience
pub use client::X402Client;
pub use error::{Result, X402Error};
pub use types::*;

// Feature-gated framework support
#[cfg(feature = "axum")]
pub mod axum;

#[cfg(feature = "actix-web")]
pub mod actix_web;

#[cfg(feature = "warp")]
pub mod warp;

/// Current version of the x402 library
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// x402 protocol version
pub const X402_VERSION: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_constants() {
        assert_eq!(X402_VERSION, 1);
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn test_payment_requirements_creation() {
        let requirements = PaymentRequirements::new(
            "exact",
            "base-sepolia",
            "1000000",
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "https://example.com/test",
            "Test payment",
        );

        assert_eq!(requirements.scheme, "exact");
        assert_eq!(requirements.network, "base-sepolia");
        assert_eq!(requirements.max_amount_required, "1000000");
        assert_eq!(
            requirements.asset,
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
        );
        assert_eq!(
            requirements.pay_to,
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
        );
        assert_eq!(requirements.resource, "https://example.com/test");
        assert_eq!(requirements.description, "Test payment");
    }

    #[test]
    fn test_payment_requirements_usdc_info() {
        let mut requirements = PaymentRequirements::new(
            "exact",
            "base-sepolia",
            "1000000",
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "https://example.com/test",
            "Test payment",
        );

        requirements
            .set_usdc_info(crate::types::Network::Testnet)
            .unwrap();
        assert!(requirements.extra.is_some());

        let extra = requirements.extra.as_ref().unwrap();
        assert_eq!(extra["name"], "USDC");
        assert_eq!(extra["version"], "2");
    }

    #[test]
    fn test_payment_payload_creation() {
        let authorization = ExactEvmPayloadAuthorization::new(
            "0x857b06519E91e3A54538791bDbb0E22373e36b66",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "1000000",
            "1745323800",
            "1745323985",
            "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
        );

        let payload = ExactEvmPayload {
            signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c".to_string(),
            authorization,
        };

        let payment_payload = PaymentPayload::new("exact", "base-sepolia", payload);

        assert_eq!(payment_payload.x402_version, X402_VERSION);
        assert_eq!(payment_payload.scheme, "exact");
        assert_eq!(payment_payload.network, "base-sepolia");
    }

    #[test]
    fn test_payment_payload_base64_encoding() {
        let authorization = ExactEvmPayloadAuthorization::new(
            "0x857b06519E91e3A54538791bDbb0E22373e36b66",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "1000000",
            "1745323800",
            "1745323985",
            "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
        );

        let payload = ExactEvmPayload {
            signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c".to_string(),
            authorization,
        };

        let payment_payload = PaymentPayload::new("exact", "base-sepolia", payload);
        let encoded = payment_payload.to_base64().unwrap();
        let decoded = PaymentPayload::from_base64(&encoded).unwrap();

        assert_eq!(payment_payload.x402_version, decoded.x402_version);
        assert_eq!(payment_payload.scheme, decoded.scheme);
        assert_eq!(payment_payload.network, decoded.network);
    }

    #[test]
    fn test_authorization_validity() {
        let now = chrono::Utc::now().timestamp();
        let valid_after = (now - 100).to_string();
        let valid_before = (now + 100).to_string();

        let authorization = ExactEvmPayloadAuthorization::new(
            "0x857b06519E91e3A54538791bDbb0E22373e36b66",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "1000000",
            valid_after,
            valid_before,
            "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
        );

        assert!(authorization.is_valid_now().unwrap());
    }

    #[test]
    fn test_authorization_expired() {
        let now = chrono::Utc::now().timestamp();
        let valid_after = (now - 200).to_string();
        let valid_before = (now - 100).to_string(); // Expired

        let authorization = ExactEvmPayloadAuthorization::new(
            "0x857b06519E91e3A54538791bDbb0E22373e36b66",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "1000000",
            valid_after,
            valid_before,
            "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
        );

        assert!(!authorization.is_valid_now().unwrap());
    }

    #[test]
    fn test_facilitator_config() {
        let config = FacilitatorConfig::new("https://example.com/facilitator")
            .with_timeout(std::time::Duration::from_secs(30));

        assert_eq!(config.url, "https://example.com/facilitator");
        assert_eq!(config.timeout, Some(std::time::Duration::from_secs(30)));
    }

    #[test]
    fn test_networks() {
        assert_eq!(networks::BASE_MAINNET, "base");
        assert_eq!(networks::BASE_SEPOLIA, "base-sepolia");
        assert_eq!(networks::AVALANCHE_MAINNET, "avalanche");
        assert_eq!(networks::AVALANCHE_FUJI, "avalanche-fuji");

        assert!(networks::is_supported("base-sepolia"));
        assert!(networks::is_supported("base"));
        assert!(!networks::is_supported("unsupported-network"));

        assert_eq!(
            networks::get_usdc_address("base-sepolia"),
            Some("0x036CbD53842c5426634e7929541eC2318f3dCF7e")
        );
        assert_eq!(
            networks::get_usdc_address("base"),
            Some("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
        );
    }

    #[test]
    fn test_schemes() {
        assert_eq!(schemes::EXACT, "exact");
    }
}
