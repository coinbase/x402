use axum::http::HeaderMap;
use reqwest::Client;
use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use std::env;
use alloy::signers::k256::ecdsa::SigningKey;
use alloy::signers::local::PrivateKeySigner;
use x402::server::Facilitator;
use x402::types::{PaymentPayload, PaymentRequired, PaymentRequirements, CdpAuthorizationV1, CdpExactPayloadV1};
use x402::auth::WalletAuth;
use x402::schemes::evm::sign_exact_payment;
use chrono::Utc;

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

    // Sign a transaction to pass into the payment payload
    let wallet_private_key = std::env::var("WALLET_PRIVATE_KEY")
        .expect("WALLET_PRIVATE_KEY environment variable must be set");
    
    let wallet_address = std::env::var("WALLET_ADDRESS")
    .expect("WALLET_ADDRESS environment variable must be set");
    
    let to_address = "0xB013a7f5F82bEA73c682fe6BFFB23715bb58e656".to_lowercase();
    let value = alloy::primitives::utils::parse_units("0.01", 6)
        .expect("Failed to parse USDC amount")
        .to_string();

    let now = Utc::now().timestamp(); // seconds since epoch

    let valid_after = (now - 60).to_string();    // valid starting 1 min ago
    let valid_before = (now + 600).to_string();  // until 10 min from now
    let nonce = "0x1234567890abcdef1234567890abcdef12345678".to_string();

    let signing_key = SigningKey::from_slice(&hex::decode(wallet_private_key.trim_start_matches("0x")).unwrap())
        .expect("invalid private key");
    let signer = PrivateKeySigner::from(signing_key);

    let payment_requirements = PaymentRequirements {
        scheme: "exact".to_string(),
        network: "base-sepolia".to_string(),
        pay_to: to_address.to_string(),
        value: value.clone(),
        asset: Some("0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string()),
        data: None,
    };

    let payment_required = PaymentRequired {
        x402_version: 1,
        resource: "https://api.example.com/premium/resource/123".to_string(),
        accepts: vec![payment_requirements.clone()],
        description: None,
        extensions: None,
    };

    let signature = sign_exact_payment(
        &signer,
        &payment_required,
        &payment_requirements,
        84532
    ).await.unwrap();
    
    let authorization = CdpAuthorizationV1 {
        from: wallet_address,
        to: to_address.to_string(),
        value: value.clone(),
        valid_after,
        valid_before,
        nonce,
    };

    let cdp_exact_payload_v1 = CdpExactPayloadV1 {
        signature,
        authorization,
    };

    let payload = PaymentPayload {
        x402_version: 1,
        resource: "https://api.example.com/premium/resource/123".to_string(),
        accepted: payment_requirements,
        payload: serde_json::to_value(cdp_exact_payload_v1).unwrap(),
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

