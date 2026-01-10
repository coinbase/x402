use alloy::signers::local::PrivateKeySigner;
use axum::body::Body;
use axum::http::HeaderMap;
use axum::routing::get;
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use http::header::ACCEPT;
use http::Request;
use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::str::FromStr;
use std::sync::Arc;
use tower::ServiceExt;
use x402::auth::WalletAuth;
use x402::errors::X402Result;
use x402::facilitator::{default_http_facilitator, Facilitator};
use x402::facilitator::cdprequest_hook::CoinbaseRequestHook;
use x402::frameworks::axum_integration::{x402_middleware, X402ConfigBuilder};
use x402::schemes::evm::sign_transfer_with_authorization;
use x402::server::{ResourceConfig, SchemeNetworkServer, SchemeServer, V1ResourceInfo};
use x402::types::{AssetAmount, CAIPNetwork, AuthorizationV1, PayloadExactV1, PaymentPayloadV1, Network, PaymentPayload, PaymentRequired, PaymentRequirements, Price, Resource, X402Header, PaymentPayloadV2};

fn get_cdp_request_hook() -> Arc<CoinbaseRequestHook> {
    let api_key = env::var("CDP_API_KEY_ID").expect("CDP_API_KEY_ID must be set");
    let api_secret = env::var("CDP_API_SECRET").expect("CDP_API_SECRET must be set");
    let app_name = env::var("APP_NAME").unwrap_or(String::from("x402-rust"));
    let source_version = env::var("CARGO_PKG_VERSION").unwrap_or(String::from("0.1.0"));

    let wallet_auth = WalletAuth::builder()
        .api_key_id(api_key)
        .api_key_secret(api_secret)
        .source(app_name)
        .source_version(source_version)
        .build()
        .unwrap();

    Arc::new(CoinbaseRequestHook { wallet_auth })
}


#[tokio::test]
async fn test_coinbase_facilitator_integration_v1() {
    let cdp_hook = get_cdp_request_hook();

    let private_key = env::var("PRIVATE_KEY").expect("PRIVATE_KEY environment variable must be set");
    let signer = PrivateKeySigner::from_str(&private_key)
        .expect("Invalid PRIVATE_KEY");

    let wallet_address = signer.address();


    let usdc_address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_lowercase();
    let price = Price::AssetAmount(AssetAmount::new(usdc_address, "1000".to_string(), None));
    let api_base = "https://api.example.com";
    let protected_route = "/api/premium";
    let resource_v1_route = format!("{}{}", api_base, protected_route);

    let v1_resource_info = V1ResourceInfo::new(&resource_v1_route, "Premium Access", "application/json", None);

    let scheme_server = Arc::new(SchemeServer::new(
        1,
        Some("exact"),
        Some(json!({
            "name": "USDC",
            "version": "2"
        })),
        Network::from("base-sepolia"),
        Some(v1_resource_info)
    ));
    let resource_config = scheme_server.build_resource_config(
        &wallet_address.to_string(),
        price,
        None,
    );


    let client = reqwest::Client::builder()
        .user_agent("x402-rust-integration-tests/0.1 (coinbase-cdp)")
        .build()
        .expect("Failed to build reqwest client");

    let facilitator_url = "https://api.cdp.coinbase.com/platform/v2/x402";
    let facilitator_builder = Facilitator::builder(facilitator_url)
        .with_request_hook(cdp_hook)
        .with_client(client)
        .build();
    let facilitator = Arc::new(facilitator_builder);



    let mut builder = X402ConfigBuilder::new("https://api.example.com",facilitator);
    builder
        .register_scheme(scheme_server.network(), scheme_server)
        .register_resource(
            resource_config,
            protected_route.to_string(),
            Some("Test Resource".to_string()),
            None,
        );

    let config = builder.build();

    let app = Router::new()
        .route(protected_route, get(|| async { "Success" }))
        .layer(axum::middleware::from_fn_with_state(config, x402_middleware));

    // 1. First request: no PAYMENT-SIGNATURE -> should return 402 with PAYMENT-REQUIRED
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(protected_route)
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

        // 2. Build a PaymentPayload that matches the server's `accepts`
        let accepted = payment_required
            .accepts
            .first()
            .expect("at least one accepted requirement");

        let chain_id = 84532u64; // from "eip155:84532"
        let (signature_hex, auth) = sign_transfer_with_authorization(
            &signer,
            &wallet_address.to_string(),
            &accepted,
            chain_id,
            None
        ).await.expect("sign_transfer_with_authorization failed");

        let accepted_v1 = match &accepted {
            PaymentRequirements::V1(req) => req,
            other => panic!("expected V1 requirements, got: {:?}", other),
        };
        let exact_payment_payload = PayloadExactV1 {
            signature: signature_hex,
            authorization: AuthorizationV1 {
                from: wallet_address.to_string(),
                to: accepted_v1.pay_to.clone(),
                value: accepted_v1.max_amount_required.to_string(),
                valid_after: auth.validAfter.to_string(),
                valid_before: auth.validBefore.to_string(),
                nonce: format!("0x{}", hex::encode(auth.nonce.as_slice())),
            },
        };

        let payment_payload = PaymentPayloadV1 {
            x402_version: 1,
            scheme: accepted_v1.scheme.clone(),
            network: accepted_v1.network.clone(),
            payload: exact_payment_payload,
        };

        let payment_signature_header = PaymentPayload::V1(payment_payload)
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
        let body_bytes = axum::body::to_bytes(response_with_sig.into_body(), 1024 * 1024)
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
async fn test_coinbase_facilitator_integration_v2() {
    let private_key = env::var("PRIVATE_KEY").expect("PRIVATE_KEY environment variable must be set");
    let signer = PrivateKeySigner::from_str(&private_key)
        .expect("Invalid PRIVATE_KEY");

    let wallet_address = signer.address();

    let cdp_hook = get_cdp_request_hook();

    let client = reqwest::Client::builder()
        .user_agent("x402-rust-integration-tests/0.1 (coinbase-cdp)")
        .build()
        .expect("Failed to build reqwest client");

    let facilitator_url = "https://api.cdp.coinbase.com/platform/v2/x402";
    let facilitator_builder = Facilitator::builder(facilitator_url)
        .with_request_hook(cdp_hook)
        .with_client(client)
        .build();
    let facilitator = Arc::new(facilitator_builder);

    let to_address = "0xB013a7f5F82bEA73c682fe6BFFB23715bb58e656".to_lowercase();
    let usdc_address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_lowercase();
    let price = Price::AssetAmount(AssetAmount::new(usdc_address, "1000".to_string(), None));

    let scheme_server = SchemeServer::new_default();
    let resource_config = scheme_server.build_resource_config(
        &to_address,
        price,
        Some(60),
    );

    let mut builder = X402ConfigBuilder::new("https://api.example.com",facilitator);
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

    dbg!(&response);
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

        // 2. Build a PaymentPayload that matches the server's `accepts`
        let accepted: PaymentRequirements = payment_required
            .accepts
            .first()
            .expect("at least one accepted requirement")
            .clone();

        let chain_id = 84532u64; // from "eip155:84532"
        let (signature_hex, auth) = sign_transfer_with_authorization(
            &signer,
            &wallet_address.to_string(),
            &accepted,
            chain_id,
            None
        ).await.expect("sign_transfer_with_authorization failed");

        let accepted_v2 = match &accepted {
            PaymentRequirements::V2(req) => req,
            other => panic!("expected V2 requirements, got: {:?}", other),
        };

        let authorization_json = json!({
       "from": wallet_address,
       "to": accepted_v2.pay_to,
       "value": accepted_v2.amount,
       "validAfter": auth.validAfter.to_string(),
       "validBefore": auth.validBefore.to_string(),
       "nonce": format!("0x{}", hex::encode(auth.nonce.as_slice())),
        });

        let evm_like_payload = json!({
            "signature": signature_hex,
            "authorization": authorization_json,
        });

        let payment_payload = PaymentPayloadV2 {
            x402_version: payment_required.x402_version,
            resource:payment_required.resource,
            accepted: accepted.clone(),
            payload: evm_like_payload,
            extensions: None,
        };

        let payment_signature_header = PaymentPayload::V2(payment_payload)
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

        //    - Middleware should get a successful response
        assert_eq!(status, axum::http::StatusCode::OK);
    }

}
// #[tokio::test]
// async fn test_facilitator_supported() {
//     let cdp_hook = get_cdp_request_hook();
//     let url = "https://api.cdp.coinbase.com/platform/v2/x402/supported";
//     let client = Client::new();
//
//     let req = client.get(url)
//         .headers(headers);
//     // dbg!(&req);
//
//         let res = req.send().await.unwrap();
//     // dbg!(&res.text().await.unwrap());
//     dbg!(&res.json::<Value>().await.unwrap());
// }

