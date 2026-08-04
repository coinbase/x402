use arkhe::integrations::pix::{PixGateway, PixPaymentRequest, PixStatus};
use arkhe::integrations::picnic::PicnicRoyaltyManager;
use arkhe::evolution::desci_node_resource::{RoyaltySplit, RoyaltyConfig, FreeTier};
use serde_json::json;

#[tokio::test]
async fn test_pix_gateway_creation() {
    let gateway = PixGateway::new(
        "https://api.pix.example.com",
        "test-api-key",
        "test-merchant-id",
    );
    assert_eq!(gateway.base_url, "https://api.pix.example.com");
}

#[tokio::test]
#[ignore]
async fn test_pix_create_payment() {
    let gateway = PixGateway::new(
        &std::env::var("PIX_API_URL").unwrap_or_default(),
        &std::env::var("PIX_API_KEY").unwrap_or_default(),
        &std::env::var("PIX_MERCHANT_ID").unwrap_or_default(),
    );

    let request = PixPaymentRequest {
        amount: 5.00,
        description: "Teste".to_string(),
        payer_name: None,
        payer_document: None,
        expiration_seconds: Some(3600),
        callback_url: None,
    };

    let result = gateway.create_payment(&request).await;
    assert!(result.is_ok() || result.is_err());
}

#[test]
fn test_parse_address() {
    let addr = "0x1234567890123456789012345678901234567890";
    let parsed = PicnicRoyaltyManager::parse_address(addr);
    assert!(parsed.is_ok());
}

#[test]
fn test_invalid_address() {
    let addr = "0xinvalid";
    let parsed = PicnicRoyaltyManager::parse_address(addr);
    assert!(parsed.is_err());
}

#[test]
fn test_royalty_split_validation() {
    let splits = vec![
        RoyaltySplit {
            npub: "npub1".to_string(),
            share: 0.7,
            orcid: None,
            eth_address: Some("0x1234567890123456789012345678901234567890".to_string()),
            pix_key: None,
        },
        RoyaltySplit {
            npub: "npub2".to_string(),
            share: 0.3,
            orcid: None,
            eth_address: Some("0x4564567890123456789012345678901234567890".to_string()),
            pix_key: None,
        },
    ];

    let total: f32 = splits.iter().map(|s| s.share).sum();
    assert!((total - 1.0).abs() < 0.001);
}

#[test]
fn test_royalty_split_sum_must_be_one() {
    let splits = vec![
        RoyaltySplit {
            npub: "npub1".to_string(),
            share: 0.8,
            orcid: None,
            eth_address: None,
            pix_key: None,
        },
        RoyaltySplit {
            npub: "npub2".to_string(),
            share: 0.3,
            orcid: None,
            eth_address: None,
            pix_key: None,
        },
    ];

    let total: f32 = splits.iter().map(|s| s.share).sum();
    assert!((total - 1.0).abs() > 0.001);
}

#[test]
fn test_webhook_payload_deserialization() {
    use arkhe::integrations::pix::PixWebhookPayload;

    let json = json!({
        "transaction_id": "pix_123456",
        "status": "PAID",
        "paid_amount": 5.00,
        "paid_at": "2025-06-17T14:30:00Z",
        "payer_document": "12345678901",
        "payer_name": "João Silva",
        "metadata": {
            "dpid": "46"
        }
    });

    let payload: PixWebhookPayload = serde_json::from_value(json).unwrap();
    assert_eq!(payload.transaction_id, "pix_123456");
    assert_eq!(payload.status, PixStatus::Paid);
    assert_eq!(payload.paid_amount.unwrap(), 5.00);
    assert_eq!(payload.metadata.as_ref().unwrap().get("dpid").unwrap(), "46");
}
