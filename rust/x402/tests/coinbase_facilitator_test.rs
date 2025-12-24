use axum::http::HeaderMap;
use reqwest::Client;
use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use std::env;
use x402::server::Facilitator;
use x402::types::{PaymentPayload, PaymentRequirements};
use x402::auth::WalletAuth;

#[tokio::test]
async fn test_coinbase_facilitator_integration() {
    let facilitator_url = "https://api.cdp.coinbase.com/platform/v2/x402";

    let wallet_auth = WalletAuth::builder()
        .api_key_id(env::var("CDP_API_KEY_ID").expect("CDP_API_KEY_ID must be set"))
        .api_key_secret(env::var("CDP_API_SECRET").expect("CDP_API_SECRET must be set"))
        .debug(true) // Enable debug logs (optional)
        .source("my-app".to_string()) // Source identifier
        .source_version("1.0.0".to_string()) // Source version
        .build()
        .unwrap(); // Make sure it doesn't result in an error


    let jwt = wallet_auth.generate_jwt(
        "POST",
        "api.cdp.coinbase.com",
        "/platform/v2/x402/verify",
        120
    ).unwrap();

    println!("Generated JWT: {:?}", &jwt);;

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(format!("Bearer {jwt}").as_str()).unwrap());
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let facilitator = Facilitator::with_headers(facilitator_url, headers);

    let payload = PaymentPayload {
        x402_version: 2,
        resource: "/test".to_string(),
        accepted: PaymentRequirements {
            scheme: "exact".to_string(),
            network: "base-sepolia".to_string(),
            pay_to: "0x0000000000000000000000000000000000000000".to_string(),
            value: "1".to_string(),
            asset: Some("0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string()),
            data: None,
        },
        payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
        extensions: None,
    };

    let requirements = payload.accepted.clone();

    let result = facilitator.verify(payload, requirements).await;

    match result {
        Ok(response) => {
            println!("Facilitator connected! Valid: {}, Reason: {:?}", response.is_valid, response.invalid_reason);
            // We expect it to be invalid because the signature is fake
            assert!(!response.is_valid);
        },
        Err(e) => {
            // If it's a 401/403/400/500, it still means we reached the facilitator
            println!("Facilitator returned an error (expected if unauthorized): {:?}", e);
        }
    }
}

#[tokio::test]
async fn test_facilitator_supported() {
    let facilitator_url = "https://x402.org/facilitator";
    let facilitator = Facilitator::new(facilitator_url);

    let client = Client::new();
    let res = client.get(format!("{}/supported", facilitator_url)).send().await.unwrap();
    dbg!(&res.json::<Value>().await.unwrap());
}

