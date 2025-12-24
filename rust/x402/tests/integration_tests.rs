use std::sync::Arc;
use axum::middleware::from_fn_with_state;
use axum::Router;
use axum::routing::get;
use reqwest::StatusCode;
use serde_json::json;
use tokio::net::TcpListener;
use wiremock::{Mock, MockServer, ResponseTemplate};
use wiremock::matchers::{method, path};
use x402::client::X402Client;
use x402::frameworks::axum_integration::{x402_middleware, X402Config};
use x402::server::{Facilitator, VerifyResponse};
use x402::types::{PaymentPayload, PaymentRequired, PaymentRequirements};

#[tokio::test]
async fn test_x402_axum_flow_with_mock_facilitator() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/verify"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            VerifyResponse {
                is_valid: true,
                invalid_reason: None,
                payer: Some("0x123".to_string()),
            }
        ))
        .mount(&mock_server)
        .await;

    let facilitator = Arc::new(Facilitator::new(&mock_server.uri()));

    let payment_requirements = PaymentRequired {
        x402_version: 0,
        resource: "/protected".to_string(),
        accepts: vec![
            PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum".to_string(),
                pay_to: "0x123".to_string(),
                value: "1000".to_string(),
                asset: None,
                data: None,
            }
        ],
        description: None,
        extensions: None,
    };

    let config = X402Config {
        facilitator,
        requirements: payment_requirements,
    };

    // Axum server

    let app = Router::new()
        .route("/protected", get(|| async { "Successfully completed!" }))
        .layer(from_fn_with_state(config, x402_middleware));

    let listener = TcpListener::bind("127.0.0.1:3000").await.unwrap();
    let adr = listener.local_addr().unwrap();

    println!("Listening on {}", adr);

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Use x402 to make the client request
    let x402_client = X402Client::new();
    let url = format!("http://{}/protected", adr);

    // Simulate the client receiving a 402 and signing it.
    let res = x402_client.execute(
        || x402_client.client.get(&url),
        |challenge| async move {
            Ok(PaymentPayload {
                x402_version: challenge.x402_version,
                resource: challenge.resource,
                accepted: challenge.accepts[0].clone(),
                payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
                extensions: None,
            })
        }
    ).await.unwrap();

    dbg!(&res);
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.text().await.unwrap(), "Successfully completed!");
}