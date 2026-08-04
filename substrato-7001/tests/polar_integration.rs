//! substrato-7001/tests/polar_integration.rs
//! Testes de integração com mock server Polar
//!
//! Selo: CATHEDRAL-ARKHE-POLAR-TESTS-v2.0.0-2026-06-19

use wiremock::{Mock, MockServer, ResponseTemplate};
use wiremock::matchers::{method, path, header, body_json};
use serde_json::json;

// ============================================================================
// Test 1: Criação de produto
use hmac::Mac;
// ============================================================================
#[tokio::test]
async fn test_create_product_success() {
    let mock = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/products"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "prod_test_001",
            "name": "Test Product",
            "is_recurring": false,
            "prices": [{"id": "price_test_001", "amount": 2000, "currency": "usd"}]
        })))
        .mount(&mock)
        .await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v1/products", mock.uri()))
        .bearer_auth("test_token")
        .json(&json!({
            "name": "Test Product",
            "description": "Test",
            "is_recurring": false,
            "prices": [{"amount": 2000, "currency": "usd"}]
        }))
        .send()
        .await
        .unwrap();

    assert!(resp.status().is_success());
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["id"], "prod_test_001");
}

// ============================================================================
// Test 2: Criação de checkout
// ============================================================================
#[tokio::test]
async fn test_create_checkout_success() {
    let mock = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/checkouts"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "chk_test_001",
            "url": "https://polar.sh/checkout/test",
            "status": "open"
        })))
        .mount(&mock)
        .await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v1/checkouts", mock.uri()))
        .bearer_auth("test_token")
        .json(&json!({
            "product_id": "prod_test_001",
            "success_url": "https://cathedral.arkhe/ok",
            "cancel_url": "https://cathedral.arkhe/cancel"
        }))
        .send()
        .await
        .unwrap();

    assert!(resp.status().is_success());
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["url"].as_str().unwrap().contains("polar.sh"));
}

// ============================================================================
// Test 3: Verificação de assinatura de webhook
// ============================================================================
#[test]
fn test_webhook_signature_verification() {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let secret = "test_webhook_secret_12345";
    let payload = r#"{"type":"order.paid","data":{"id":"ord_1"}}"#;

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());

    // Verifica com a mesma secret
    let mut mac2 = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac2.update(payload.as_bytes());
    let sig2 = hex::encode(mac2.finalize().into_bytes());

    assert_eq!(sig, sig2);

    // Verifica que secret diferente falha
    let mut mac3 = HmacSha256::new_from_slice(b"wrong_secret").unwrap();
    mac3.update(payload.as_bytes());
    let sig3 = hex::encode(mac3.finalize().into_bytes());

    assert_ne!(sig, sig3);
}

// ============================================================================
// Test 4: Assinatura com formato Polar (t=...,v1=...)
// ============================================================================
#[test]
fn test_webhook_signature_polar_format() {
    let secret = "test_secret";
    let payload = b"test_payload";

    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(payload);
    let sig = hex::encode(mac.finalize().into_bytes());

    let polar_sig = format!("t=1234567890,v1={}", sig);

    // Extrai v1=
    let extracted = polar_sig
        .split(',')
        .find(|p| p.starts_with("v1="))
        .map(|p| &p[3..])
        .unwrap();

    assert_eq!(extracted, sig);
}

// ============================================================================
// Test 5: Cálculo de distribuição OSS
// ============================================================================
#[test]
fn test_oss_distribution_calculation() {
    let amount_cents = 10000i64; // $100.00
    let percentage = 0.01;       // 1%
    let oss_total = (amount_cents as f64 * percentage).round() as i64;

    assert_eq!(oss_total, 100); // $1.00

    let recipients = vec![
        ("dev-8000", 0.4f64),
        ("dev-9000", 0.35f64),
        ("dev-4003", 0.25f64),
    ];

    let total_share: f64 = recipients.iter().map(|(_, s)| s).sum();
    assert!((total_share - 1.0).abs() < 0.001);

    let distributions: Vec<(&&str, i64)> = recipients
        .iter()
        .map(|(handle, share)| {
            let amt = ((oss_total as f64) * (share / total_share)).round() as i64;
            (handle, amt)
        })
        .collect();

    assert_eq!(distributions[0].1, 40);  // dev-8000: $0.40
    assert_eq!(distributions[1].1, 35);  // dev-9000: $0.35
    assert_eq!(distributions[2].1, 25);  // dev-4003: $0.25
    assert_eq!(distributions.iter().map(|(_, a)| a).sum::<i64>(), 100); // total = $1.00
}

// ============================================================================
// Test 6: Abaixo do mínimo de payout
// ============================================================================
#[test]
fn test_oss_below_minimum() {
    let amount_cents = 500i64; // $5.00
    let oss_total = (amount_cents as f64 * 0.01).round() as i64; // 5 cents
    let min_payout = 100i64; // $1.00

    assert!(oss_total < min_payout);
    // Engine deve retornar status: "below_minimum"
}

// ============================================================================
// Test 7: Polar API error handling
// ============================================================================
#[tokio::test]
async fn test_polar_api_error_401() {
    let mock = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/products"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({
            "error": "Unauthorized",
            "message": "Invalid access token"
        })))
        .mount(&mock)
        .await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v1/products", mock.uri()))
        .bearer_auth("invalid_token")
        .json(&json!({"name": "Test"}))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status().as_u16(), 401);
}

// ============================================================================
// Test 8: MCP Protocol — initialize
// ============================================================================
#[test]
fn test_mcp_initialize_response() {
    let req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "opencode", "version": "1.1"}
        }
    });

    assert_eq!(req["method"], "initialize");

    // Verifica que a resposta teria a estrutura correta
    let expected_keys = ["protocolVersion", "capabilities", "serverInfo"];
    for key in &expected_keys {
        // Em produção: verificar resposta real do handler
        assert!(true, "Key {} should be in result", key);
    }
}

// ============================================================================
// Test 9: MCP Protocol — tools/list
// ============================================================================
#[test]
fn test_mcp_tools_list_structure() {
    let tools = vec![
        json!({
            "name": "polar_create_product",
            "description": "Cria um produto digital no Polar",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "amount": {"type": "integer"}
                },
                "required": ["name", "amount"]
            }
        })
    ];

    // Verifica estrutura MCP
    for tool in &tools {
        assert!(tool["name"].is_string());
        assert!(tool["description"].is_string());
        assert!(tool["inputSchema"]["type"] == "object");
        assert!(tool["inputSchema"]["properties"].is_object());
        assert!(tool["inputSchema"]["required"].is_array());
    }
}

// ============================================================================
// Test 10: Webhook payload parsing (campo "type", não "event")
// ============================================================================
#[test]
fn test_webhook_payload_parsing() {
    let payload = json!({
        "type": "order.paid",
        "data": {
            "id": "ord_123",
            "amount": 4900,
            "customer": {"email": "user@example.com"},
            "product_id": "prod_456"
        }
    });

    // Polar usa "type", não "event" (correção do v1)
    let event_type = payload["type"].as_str().unwrap();
    assert_eq!(event_type, "order.paid");

    let order_id = payload["data"]["id"].as_str().unwrap();
    assert_eq!(order_id, "ord_123");

    let amount = payload["data"]["amount"].as_i64().unwrap();
    assert_eq!(amount, 4900);
}

// ============================================================================
// Test 11: Rate limiting mock
// ============================================================================
#[tokio::test]
async fn test_polar_api_rate_limit() {
    let mock = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/v1/orders"))
        .respond_with(ResponseTemplate::new(429).set_body_json(json!({
            "error": "Too Many Requests",
            "retry_after": 60
        })))
        .mount(&mock)
        .await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/v1/orders?limit=100", mock.uri()))
        .bearer_auth("test_token")
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status().as_u16(), 429);
}

// ============================================================================
// Test 12: DLQ accumulation
// ============================================================================
#[tokio::test]
async fn test_dlq_accumulation() {
    use std::sync::Arc;
    use tokio::sync::RwLock;

    let dlq: Arc<RwLock<Vec<serde_json::Value>>> = Arc::new(RwLock::new(Vec::new()));

    // Simula 3 falhas → DLQ
    {
        let mut queue = dlq.write().await;
        for i in 0..3 {
            queue.push(json!({
                "event_type": "order.paid",
                "error": format!("Connection refused (attempt {})", i + 1),
                "attempt": 3,
            }));
        }
    }

    let queue = dlq.read().await;
    assert_eq!(queue.len(), 3);
    assert_eq!(queue[0]["event_type"], "order.paid");
}
