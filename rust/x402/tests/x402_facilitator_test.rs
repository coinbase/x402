use alloy::signers::local::PrivateKeySigner;
use axum::{
    body::Body,
    http::Request,
    routing::get,
    Router,
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use reqwest::Client;
use serde_json::json;
use serde_json::Value;
use std::env;
use std::str::FromStr;
use tower::ServiceExt;
use x402::facilitator::default_http_facilitator;
use x402::frameworks::axum_integration::{x402_middleware, X402ConfigBuilder};
use x402::schemes::evm::sign_transfer_with_authorization;
use x402::server::SchemeServer;
use x402::types::{AssetAmount, Price, X402Header};
use x402::types::{PaymentPayload, PaymentRequired, Resource};

#[tokio::test]
async fn test_x402_axum_facilitator_integration() {

    let private_key = env::var("PRIVATE_KEY").expect("PRIVATE_KEY environment variable must be set");
    let signer = PrivateKeySigner::from_str(&private_key)
        .expect("Invalid PRIVATE_KEY");

    let wallet_address = signer.address();


    let facilitator_url = "https://x402.org/facilitator";
    let facilitator = default_http_facilitator(facilitator_url);

    let to_address = "0xB013a7f5F82bEA73c682fe6BFFB23715bb58e656".to_lowercase();
    let usdc_address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_lowercase();
    let price = Price::AssetAmount(AssetAmount::new(usdc_address, "1000".to_string(), None));

    let scheme_server = SchemeServer::new_default();
    let resource_config = scheme_server.build_resource_config(
        &to_address,
        price,
        None,
    );

    let mut builder = X402ConfigBuilder::new(facilitator);
    builder
        .register_scheme(scheme_server.network(), scheme_server)
        .register_resource(
            resource_config,
            "/api/premium".to_string(),
            Some("Test Resource".to_string()),
            None,
        );

    let config = builder.build();

    let app = Router::new()
        .route("/api/premium", get(|| async { "Success" }))
        .layer(axum::middleware::from_fn_with_state(config, x402_middleware));

    // 1. First request: no PAYMENT-SIGNATURE -> should return 402 with PAYMENT-REQUIRED
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/premium")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    println!("Response Status (Missing Header): {}", response.status());
    assert_eq!(response.status(), axum::http::StatusCode::PAYMENT_REQUIRED);

    if let Some(header) = response.headers().get("PAYMENT-REQUIRED") {
        println!("PAYMENT-REQUIRED Header (raw): {:?}", header);

        // Decode PAYMENT-REQUIRED into PaymentRequired
        let header_str = header.to_str().expect("header to be valid UTF-8");
        let decoded = URL_SAFE_NO_PAD
            .decode(header_str)
            .expect("base64url decode PAYMENT-REQUIRED");
        let json_str = String::from_utf8(decoded).expect("PAYMENT-REQUIRED to be valid UTF-8");
        let mut payment_required: PaymentRequired =
            serde_json::from_str(&json_str).expect("decode PaymentRequired JSON");

        println!("Decoded PAYMENT-REQUIRED: {}", json_str);

        // Force x402Version = 2 to match facilitator's supported kinds
        payment_required.x402_version = 2;

        // 2. Build a PaymentPayload that matches the server's `accepts`
        let accepted = payment_required
            .accepts
            .first()
            .expect("at least one accepted requirement")
            .clone();

        let resource = Resource {
            url: payment_required.resource.clone(),
            description: payment_required
                .description
                .clone()
                .unwrap_or_else(|| "Test Resource".to_string()),
            mime_type: "application/json".to_string(),
        };

        let chain_id = 84532u64; // from "eip155:84532"
        let (signature_hex, auth) = sign_transfer_with_authorization(
            &signer,
            &wallet_address.to_string(),
            &accepted,
            chain_id,
            None
        ).await.expect("sign_transfer_with_authorization failed");

        let authorization_json = json!({
       "from": wallet_address,
       "to": accepted.pay_to,
       "value": accepted.amount,
       "validAfter": auth.validAfter.to_string(),
       "validBefore": auth.validBefore.to_string(),
       "nonce": format!("0x{}", hex::encode(auth.nonce.as_slice())),
   });

        let evm_like_payload = json!({
            "signature": signature_hex,
            "authorization": authorization_json,
        });

        let payment_payload = PaymentPayload {
            x402_version: payment_required.x402_version,
            resource,
            accepted: accepted.clone(),
            payload: evm_like_payload,
            extensions: None,
        };

        let payment_signature_header = payment_payload
            .to_header()
            .expect("encode PaymentPayload to PAYMENT-SIGNATURE header");

        // 4. Second request WITH PAYMENT-SIGNATURE:
        //    - Axum middleware should accept it (matches `accepts`)
        //    - Facilitator is called and returns a verification failure
        let response_with_sig = app
            .oneshot(
                Request::builder()
                    .uri("/api/premium")
                    .header("PAYMENT-SIGNATURE", payment_signature_header)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let status = response_with_sig.status();
        let body_bytes = axum::body::to_bytes(response_with_sig.into_body(), 1024)
            .await
            .unwrap();
        let body_str = String::from_utf8_lossy(&body_bytes);

        println!("Response Status: {}", status);
        println!(
            "Response Body: {}",
            body_str
        );

        // 5. Assertions:
        //    - We should not see 402 here (that would mean we never left the Axum middleware)
        assert_ne!(
            status,
            axum::http::StatusCode::PAYMENT_REQUIRED,
            "Second request should not fail at the Axum middleware with 402"
        );

        //    - Middleware should surface a verification failure error from the facilitator
        assert_eq!(status, axum::http::StatusCode::OK);
    }
}

#[tokio::test]
async fn test_x402_v1_axum_facilitator_integration() {
 todo!()
}

#[tokio::test]
async fn test_supported_schemes() {
    let facilitator_url = "https://x402.org/facilitator/supported";
    let client = Client::new();
    let res = client
        .get(facilitator_url)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    dbg!(&res);
}

/*

{
  payload: {
    x402Version: 2,
    payload: { signature: 'test_signature', from: 'test_sender' },
    accepted: {
      scheme: 'test-scheme',
      network: 'test:network',
      amount: '1000000',
      asset: 'TEST_ASSET',
      payTo: 'test_recipient',
      maxTimeoutSeconds: 300,
      extra: {}
    },
    resource: {
      url: 'https://example.com/resource',
      description: 'Test resource',
      mimeType: 'application/json'
    }
  },
  requirements: {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '1000000',
    asset: 'TEST_ASSET',
    payTo: 'test_recipient',
    maxTimeoutSeconds: 300,
    extra: {}
  },
  result
*/
