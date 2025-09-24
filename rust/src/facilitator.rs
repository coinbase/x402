//! Facilitator client for payment verification and settlement

use crate::types::*;
use crate::{Result, X402Error};
use reqwest::Client;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

/// Default facilitator URL
pub const DEFAULT_FACILITATOR_URL: &str = "https://x402.org/facilitator";

/// Facilitator client for verifying and settling payments
#[derive(Clone)]
pub struct FacilitatorClient {
    /// Base URL of the facilitator service
    url: String,
    /// HTTP client
    client: Client,
    /// Configuration for authentication headers
    auth_config: Option<Arc<dyn Fn() -> Result<HashMap<String, HashMap<String, String>>> + Send + Sync>>,
}

impl std::fmt::Debug for FacilitatorClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FacilitatorClient")
            .field("url", &self.url)
            .field("auth_config", &"<function>")
            .finish()
    }
}

impl FacilitatorClient {
    /// Create a new facilitator client
    pub fn new(config: FacilitatorConfig) -> Self {
        let mut client_builder = Client::builder();
        
        if let Some(timeout) = config.timeout {
            client_builder = client_builder.timeout(timeout);
        }

        let client = client_builder.build().unwrap_or_else(|_| Client::new());

        Self {
            url: config.url,
            client,
            auth_config: config.create_auth_headers,
        }
    }

    /// Verify a payment without executing the transaction
    pub async fn verify(
        &self,
        payment_payload: &PaymentPayload,
        payment_requirements: &PaymentRequirements,
    ) -> Result<VerifyResponse> {
        let request_body = json!({
            "x402Version": X402_VERSION,
            "paymentPayload": payment_payload,
            "paymentRequirements": payment_requirements,
        });

        let mut request = self
            .client
            .post(&format!("{}/verify", self.url))
            .json(&request_body);

        // Add authentication headers if available
        if let Some(auth_config) = &self.auth_config {
            let headers = auth_config()?;
            if let Some(verify_headers) = headers.get("verify") {
                for (key, value) in verify_headers {
                    request = request.header(key, value);
                }
            }
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(X402Error::facilitator_error(format!(
                "Verification failed with status: {}",
                response.status()
            )));
        }

        let verify_response: VerifyResponse = response.json().await?;
        Ok(verify_response)
    }

    /// Settle a verified payment by executing the transaction
    pub async fn settle(
        &self,
        payment_payload: &PaymentPayload,
        payment_requirements: &PaymentRequirements,
    ) -> Result<SettleResponse> {
        let request_body = json!({
            "x402Version": X402_VERSION,
            "paymentPayload": payment_payload,
            "paymentRequirements": payment_requirements,
        });

        let mut request = self
            .client
            .post(&format!("{}/settle", self.url))
            .json(&request_body);

        // Add authentication headers if available
        if let Some(auth_config) = &self.auth_config {
            let headers = auth_config()?;
            if let Some(settle_headers) = headers.get("settle") {
                for (key, value) in settle_headers {
                    request = request.header(key, value);
                }
            }
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(X402Error::facilitator_error(format!(
                "Settlement failed with status: {}",
                response.status()
            )));
        }

        let settle_response: SettleResponse = response.json().await?;
        Ok(settle_response)
    }

    /// Get supported payment schemes and networks
    pub async fn supported(&self) -> Result<SupportedKinds> {
        let response = self
            .client
            .get(&format!("{}/supported", self.url))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(X402Error::facilitator_error(format!(
                "Failed to get supported kinds with status: {}",
                response.status()
            )));
        }

        let supported: SupportedKinds = response.json().await?;
        Ok(supported)
    }

    /// Get the base URL of this facilitator
    pub fn url(&self) -> &str {
        &self.url
    }
}

impl Default for FacilitatorClient {
    fn default() -> Self {
        Self::new(FacilitatorConfig::default())
    }
}

/// Coinbase facilitator integration
pub mod coinbase {
    use super::*;
    use crate::crypto::jwt;
    use uuid::Uuid;

    /// Coinbase facilitator base URL
    pub const COINBASE_FACILITATOR_BASE_URL: &str = "https://api.cdp.coinbase.com";
    /// Coinbase facilitator v2 route
    pub const COINBASE_FACILITATOR_V2_ROUTE: &str = "/platform/v2/x402";

    /// Create authentication headers for Coinbase facilitator
    pub fn create_auth_headers(
        api_key_id: &str,
        api_key_secret: &str,
    ) -> impl Fn() -> Result<HashMap<String, HashMap<String, String>>> + Send + Sync {
        let api_key_id = api_key_id.to_string();
        let api_key_secret = api_key_secret.to_string();

        move || {
            let verify_token = jwt::create_auth_header(
                &api_key_id,
                &api_key_secret,
                COINBASE_FACILITATOR_BASE_URL,
                &format!("{}/verify", COINBASE_FACILITATOR_V2_ROUTE),
            )?;

            let settle_token = jwt::create_auth_header(
                &api_key_id,
                &api_key_secret,
                COINBASE_FACILITATOR_BASE_URL,
                &format!("{}/settle", COINBASE_FACILITATOR_V2_ROUTE),
            )?;

            let correlation_header = create_correlation_header();

            let mut headers = HashMap::new();
            
            let mut verify_headers = HashMap::new();
            verify_headers.insert("Authorization".to_string(), verify_token);
            verify_headers.insert("Correlation-Context".to_string(), correlation_header.clone());
            headers.insert("verify".to_string(), verify_headers);

            let mut settle_headers = HashMap::new();
            settle_headers.insert("Authorization".to_string(), settle_token);
            settle_headers.insert("Correlation-Context".to_string(), correlation_header);
            headers.insert("settle".to_string(), settle_headers);

            Ok(headers)
        }
    }

    /// Create a facilitator config for Coinbase
    pub fn create_facilitator_config(
        api_key_id: &str,
        api_key_secret: &str,
    ) -> FacilitatorConfig {
        FacilitatorConfig::new(&format!(
            "{}{}",
            COINBASE_FACILITATOR_BASE_URL,
            COINBASE_FACILITATOR_V2_ROUTE
        ))
        .with_auth_headers(Box::new(create_auth_headers(api_key_id, api_key_secret)))
    }

    /// Create correlation header for requests
    fn create_correlation_header() -> String {
        let data = [
            ("sdk_version", "0.1.0"),
            ("sdk_language", "rust"),
            ("source", "x402"),
            ("source_version", crate::VERSION),
        ];

        let pairs: Vec<String> = data
            .iter()
            .map(|(key, value)| format!("{}={}", key, percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC)))
            .collect();

        pairs.join(",")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;
    use mockito::{Server, Mock, Matcher};
    use serde_json::json;

    #[tokio::test]
    async fn test_facilitator_client_creation() {
        let config = FacilitatorConfig::new("https://example.com/facilitator");
        let client = FacilitatorClient::new(config);
        assert_eq!(client.url(), "https://example.com/facilitator");
    }

    #[tokio::test]
    async fn test_facilitator_verify_success() {
        let mut server = Server::new_async().await;
        let _m = server
            .mock("POST", "/verify")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!({
                "x402_version": 1,
                "is_valid": true,
                "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
            }).to_string())
            .create();

        let config = FacilitatorConfig::new(&server.url());
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let response = client.verify(&payment_payload, &payment_requirements).await.unwrap();
        assert!(response.is_valid);
        assert_eq!(response.payer, Some("0x857b06519E91e3A54538791bDbb0E22373e36b66".to_string()));
    }

    #[tokio::test]
    async fn test_facilitator_verify_failure() {
        let mut server = Server::new_async().await;
        let _m = server
            .mock("POST", "/verify")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!({
                "x402_version": 1,
                "is_valid": false,
                "invalid_reason": "insufficient_funds",
                "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
            }).to_string())
            .create();

        let config = FacilitatorConfig::new(&server.url());
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let response = client.verify(&payment_payload, &payment_requirements).await.unwrap();
        assert!(!response.is_valid);
        assert_eq!(response.invalid_reason, Some("insufficient_funds".to_string()));
    }

    #[tokio::test]
    async fn test_facilitator_settle_success() {
        let mut server = Server::new_async().await;
        let _m = server
            .mock("POST", "/settle")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!({
                "success": true,
                "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                "network": "base-sepolia",
                "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
            }).to_string())
            .create();

        let config = FacilitatorConfig::new(&server.url());
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let response = client.settle(&payment_payload, &payment_requirements).await.unwrap();
        assert!(response.success);
        assert_eq!(response.transaction, "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
        assert_eq!(response.network, "base-sepolia");
    }

    #[tokio::test]
    async fn test_facilitator_settle_failure() {
        let mut server = Server::new_async().await;
        let _m = server
            .mock("POST", "/settle")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!({
                "x402_version": 1,
                "success": false,
                "error_reason": "transaction_failed",
                "transaction": "",
                "network": "base-sepolia",
                "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
            }).to_string())
            .create();

        let config = FacilitatorConfig::new(&server.url());
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let response = client.settle(&payment_payload, &payment_requirements).await.unwrap();
        assert!(!response.success);
        assert_eq!(response.error_reason, Some("transaction_failed".to_string()));
        assert_eq!(response.transaction, "");
    }

    #[tokio::test]
    async fn test_facilitator_server_error() {
        let mut server = Server::new_async().await;
        let _m = server.mock("POST", "/verify")
            .with_status(500)
            .create();

        let config = FacilitatorConfig::new(&server.url());
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let result = client.verify(&payment_payload, &payment_requirements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Verification failed with status: 500"));
    }

    #[tokio::test]
    async fn test_facilitator_supported() {
        let mut server = Server::new_async().await;
        let _m = server.mock("GET", "/supported")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!({
                "x402_version": 1,
                "kinds": [
                    {
                        "x402_version": 1,
                        "scheme": "exact",
                        "network": "base-sepolia"
                    },
                    {
                        "x402_version": 1,
                        "scheme": "exact",
                        "network": "base"
                    }
                ]
            }).to_string())
            .create();

        let config = FacilitatorConfig::new(&server.url());
        let client = FacilitatorClient::new(config);

        let supported = client.supported().await.unwrap();
        assert_eq!(supported.kinds.len(), 2);
        assert_eq!(supported.kinds[0].scheme, "exact");
        assert_eq!(supported.kinds[0].network, "base-sepolia");
        assert_eq!(supported.kinds[1].network, "base");
    }

    #[tokio::test]
    async fn test_facilitator_with_auth_headers() {
        let mut server = Server::new_async().await;
        let _m = server.mock("POST", "/verify")
            .with_status(200)
            .with_header("content-type", "application/json")
            .match_header("Authorization", "Bearer test-token")
            .match_header("Correlation-Context", Matcher::Regex(r".*".to_string()))
            .with_body(json!({
                "x402_version": 1,
                "is_valid": true,
                "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
            }).to_string())
            .create();

        let create_auth_headers = || {
            let mut headers = HashMap::new();
            let mut verify_headers = HashMap::new();
            verify_headers.insert("Authorization".to_string(), "Bearer test-token".to_string());
            verify_headers.insert("Correlation-Context".to_string(), "test=correlation".to_string());
            headers.insert("verify".to_string(), verify_headers);
            Ok(headers)
        };

        let config = FacilitatorConfig::new(&server.url())
            .with_auth_headers(Box::new(create_auth_headers));
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let response = client.verify(&payment_payload, &payment_requirements).await.unwrap();
        assert!(response.is_valid);
    }

    #[tokio::test]
    async fn test_facilitator_timeout() {
        // Test with a very short timeout and a URL that will timeout
        let config = FacilitatorConfig::new("http://10.255.255.1:9999") // Non-routable IP
            .with_timeout(Duration::from_millis(1));
        let client = FacilitatorClient::new(config);

        let payment_payload = create_test_payment_payload();
        let payment_requirements = create_test_payment_requirements();

        let result = client.verify(&payment_payload, &payment_requirements).await;
        assert!(result.is_err());
        // Check for timeout-related error - be more flexible with error messages
        let error_msg = result.unwrap_err().to_string();
        assert!(error_msg.contains("timeout") || 
                error_msg.contains("connection") || 
                error_msg.contains("network") ||
                error_msg.contains("unreachable") ||
                error_msg.contains("refused") ||
                error_msg.contains("No route to host") ||
                error_msg.contains("failed to connect") ||
                error_msg.contains("Connection refused") ||
                error_msg.contains("Network is unreachable") ||
                error_msg.contains("Name or service not known") ||
                error_msg.contains("Temporary failure in name resolution") ||
                error_msg.contains("error sending request") ||
                error_msg.contains("HTTP error"));
    }

    // Helper functions for creating test data
    fn create_test_payment_payload() -> PaymentPayload {
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

        PaymentPayload::new("exact", "base-sepolia", payload)
    }

    fn create_test_payment_requirements() -> PaymentRequirements {
        PaymentRequirements::new(
            "exact",
            "base-sepolia",
            "1000000",
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "https://example.com/test",
            "Test payment",
        )
    }
}