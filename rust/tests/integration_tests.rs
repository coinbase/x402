//! Integration tests for the x402 library

use base64::Engine;
use mockito::{Matcher, Server};
use serde_json::json;
use std::str::FromStr;
use x402::{
    client::{DiscoveryClient, DiscoveryFilters, X402Client},
    types::*,
    X402Error,
};

#[tokio::test]
async fn test_client_with_payment_required() {
    // Mock a 402 response
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/protected")
        .with_status(402)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "x402Version": 1,
                "error": "X-PAYMENT header is required",
                "accepts": [{
                    "scheme": "exact",
                    "network": "base-sepolia",
                    "maxAmountRequired": "1000000",
                    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                    "resource": "https://example.com/protected",
                    "description": "Test protected resource",
                    "mimeType": "application/json",
                    "maxTimeoutSeconds": 60
                }]
            })
            .to_string(),
        )
        .create();

    let client = X402Client::new().unwrap();
    let response = client
        .get(&format!("{}/protected", server.url()))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 402);

    let payment_req: PaymentRequirementsResponse = response.json().await.unwrap();
    assert_eq!(payment_req.x402_version, 1);
    assert_eq!(payment_req.error, "X-PAYMENT header is required");
    assert_eq!(payment_req.accepts.len(), 1);
    assert_eq!(payment_req.accepts[0].scheme, "exact");
    assert_eq!(payment_req.accepts[0].network, "base-sepolia");
}

#[tokio::test]
async fn test_client_with_successful_payment() {
    // Mock successful response after payment
    let mut server = Server::new_async().await;
    let _m = server.mock("GET", "/protected")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_header("X-PAYMENT-RESPONSE", "eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6IjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZiIsIm5ldHdvcmsiOiJiYXNlLXNlcG9saWEiLCJwYXllciI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNkI2NiJ9")
        .with_body(json!({
            "data": "This is protected content",
            "timestamp": "2024-01-01T00:00:00Z"
        }).to_string())
        .create();

    let client = X402Client::new().unwrap();
    let payment_payload = create_test_payment_payload();

    let response = client
        .get(&format!("{}/protected", server.url()))
        .payment(&payment_payload)
        .unwrap()
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    // Check settlement response header first (before consuming response)
    let settlement_header = response.headers().get("X-PAYMENT-RESPONSE").unwrap().clone();
    let data: serde_json::Value = response.json().await.unwrap();
    assert_eq!(data["data"], "This is protected content");
    
    let settlement: SettleResponse = serde_json::from_slice(
        &base64::engine::general_purpose::STANDARD
            .decode(settlement_header.to_str().unwrap())
            .unwrap(),
    )
    .unwrap();
    assert!(settlement.success);
    assert_eq!(settlement.network, "base-sepolia");
}

#[tokio::test]
async fn test_discovery_client() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/resources")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "x402Version": 1,
                "items": [
                    {
                        "resource": "https://api.example.com/premium-data",
                        "type": "http",
                        "x402Version": 1,
                        "accepts": [{
                            "scheme": "exact",
                            "network": "base-sepolia",
                            "maxAmountRequired": "10000",
                            "resource": "https://api.example.com/premium-data",
                            "description": "Access to premium market data",
                            "mimeType": "application/json",
                            "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                            "maxTimeoutSeconds": 60,
                            "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
                        }],
                        "lastUpdated": 1703123456,
                        "metadata": {
                            "category": "finance",
                            "provider": "Example Corp"
                        }
                    }
                ],
                "pagination": {
                    "limit": 20,
                    "offset": 0,
                    "total": 1
                }
            })
            .to_string(),
        )
        .create();

    let discovery = DiscoveryClient::new(&server.url());
    let response = discovery.get_all_resources().await.unwrap();

    assert_eq!(response.x402_version, 1);
    assert_eq!(response.items.len(), 1);
    assert_eq!(
        response.items[0].resource,
        "https://api.example.com/premium-data"
    );
    assert_eq!(response.items[0].r#type, "http");
    assert_eq!(response.pagination.total, 1);
}

#[tokio::test]
async fn test_discovery_with_filters() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/resources")
        .with_status(200)
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("type".to_string(), "http".to_string()),
            Matcher::UrlEncoded("limit".to_string(), "10".to_string()),
            Matcher::UrlEncoded("offset".to_string(), "0".to_string()),
        ]))
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "x402Version": 1,
                "items": [],
                "pagination": {
                    "limit": 10,
                    "offset": 0,
                    "total": 0
                }
            })
            .to_string(),
        )
        .create();

    let discovery = DiscoveryClient::new(&server.url());
    let filters = DiscoveryFilters::new()
        .with_resource_type("http")
        .with_limit(10)
        .with_offset(0);

    let response = discovery.discover_resources(Some(filters)).await.unwrap();

    assert_eq!(response.items.len(), 0);
    assert_eq!(response.pagination.limit, 10);
}

#[tokio::test]
async fn test_payment_requirements_creation() {
    let mut requirements = PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000",
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "https://example.com/test",
        "Test payment",
    );

    // Test USDC info setting
    requirements.set_usdc_info(Network::Testnet).unwrap();
    assert!(requirements.extra.is_some());

    let extra = requirements.extra.as_ref().unwrap();
    assert_eq!(extra["name"], "USDC");
    assert_eq!(extra["version"], "2");

    // Test amount conversion
    let amount_decimal = requirements.amount_as_decimal().unwrap();
    assert_eq!(amount_decimal, rust_decimal::Decimal::from(1000000u64));

    let amount_in_units = requirements.amount_in_decimal_units(6).unwrap();
    assert_eq!(
        amount_in_units,
        rust_decimal::Decimal::from_str("1.0").unwrap()
    );
}

#[tokio::test]
async fn test_payment_payload_serialization() {
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

    // Test base64 encoding/decoding
    let encoded = payment_payload.to_base64().unwrap();
    let decoded = PaymentPayload::from_base64(&encoded).unwrap();

    assert_eq!(payment_payload.x402_version, decoded.x402_version);
    assert_eq!(payment_payload.scheme, decoded.scheme);
    assert_eq!(payment_payload.network, decoded.network);
    assert_eq!(
        payment_payload.payload.authorization.from,
        decoded.payload.authorization.from
    );
    assert_eq!(
        payment_payload.payload.authorization.to,
        decoded.payload.authorization.to
    );
}

#[tokio::test]
async fn test_authorization_validity() {
    let now = chrono::Utc::now().timestamp();

    // Test valid authorization
    let valid_auth = ExactEvmPayloadAuthorization::new(
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "1000000",
        (now - 100).to_string(), // valid_after
        (now + 100).to_string(), // valid_before
        "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    );

    assert!(valid_auth.is_valid_now().unwrap());

    // Test expired authorization
    let expired_auth = ExactEvmPayloadAuthorization::new(
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "1000000",
        (now - 200).to_string(), // valid_after
        (now - 100).to_string(), // valid_before (expired)
        "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    );

    assert!(!expired_auth.is_valid_now().unwrap());

    // Test not yet valid authorization
    let future_auth = ExactEvmPayloadAuthorization::new(
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "1000000",
        (now + 100).to_string(), // valid_after (future)
        (now + 200).to_string(), // valid_before
        "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    );

    assert!(!future_auth.is_valid_now().unwrap());
}

#[tokio::test]
async fn test_settle_response_serialization() {
    let settle_response = SettleResponse {
        success: true,
        error_reason: None,
        transaction: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
            .to_string(),
        network: "base-sepolia".to_string(),
        payer: Some("0x857b06519E91e3A54538791bDbb0E22373e36b66".to_string()),
    };

    let encoded = settle_response.to_base64().unwrap();
    let decoded_bytes = base64::engine::general_purpose::STANDARD
        .decode(&encoded)
        .unwrap();
    let decoded: SettleResponse = serde_json::from_slice(&decoded_bytes).unwrap();

    assert_eq!(settle_response.success, decoded.success);
    assert_eq!(settle_response.transaction, decoded.transaction);
    assert_eq!(settle_response.network, decoded.network);
    assert_eq!(settle_response.payer, decoded.payer);
}

#[tokio::test]
async fn test_error_handling() {
    // Test network not supported error
    let error = X402Error::NetworkNotSupported {
        network: "unsupported-network".to_string(),
    };
    assert!(error.to_string().contains("Network not supported"));

    // Test invalid payment payload error
    let error = X402Error::invalid_payment_payload("Invalid signature");
    assert!(error.to_string().contains("Invalid payment payload"));

    // Test insufficient funds error
    let error = X402Error::InsufficientFunds;
    assert!(error.to_string().contains("Insufficient funds"));

    // Test authorization expired error
    let error = X402Error::AuthorizationExpired;
    assert!(error.to_string().contains("Authorization expired"));
}

#[tokio::test]
async fn test_network_configurations() {
    // Test supported networks
    assert!(networks::is_supported("base-sepolia"));
    assert!(networks::is_supported("base"));
    assert!(networks::is_supported("avalanche-fuji"));
    assert!(networks::is_supported("avalanche"));
    assert!(!networks::is_supported("unsupported-network"));

    // Test USDC addresses
    assert_eq!(
        networks::get_usdc_address("base-sepolia"),
        Some("0x036CbD53842c5426634e7929541eC2318f3dCF7e")
    );
    assert_eq!(
        networks::get_usdc_address("base"),
        Some("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
    );
    assert_eq!(
        networks::get_usdc_address("avalanche-fuji"),
        Some("0x5425890298aed601595a70AB815c96711a31Bc65")
    );

    // Test all supported networks
    let all_networks = networks::all_supported();
    assert_eq!(all_networks.len(), 4);
    assert!(all_networks.contains(&"base-sepolia"));
    assert!(all_networks.contains(&"base"));
    assert!(all_networks.contains(&"avalanche-fuji"));
    assert!(all_networks.contains(&"avalanche"));
}

// Helper function for creating test payment payload
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
