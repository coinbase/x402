
use alloy::signers::local::PrivateKeySigner;
use tokio::task;
use x402::client::evm::exact::EvmExactClient;
use x402::client::X402Client;

mod common;
use common::build_test_app; // your helper that returns axum::Router

#[tokio::test]
async fn test_x402_client_against_axum_server_happy_path() {
    // 1. Build the Axum app.
    let app = build_test_app();

    // 2. Bind to an ephemeral port on localhost.
    let std_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = std_listener.local_addr().unwrap();
    let listener = tokio::net::TcpListener::from(std_listener);

    // 3. Spawn the server in the background.
    task::spawn(async move {
        axum::serve(listener, app).await.expect("axum::serve failed");
    });

    // 4. Create a test signer.
    let signer = PrivateKeySigner::random();

    // 5. Build the EVM/x402 clients
    let evm_client = EvmExactClient::new(signer.clone());
    let x402_client = X402Client::new(evm_client);

    let url = format!("http://{}/api/premium", addr);

    // 6. Use the *real* high-level client API to exercise the whole flow:
    //    - initial request
    //    - 402 + PAYMENT-REQUIRED
    //    - sign & build PAYMENT-SIGNATURE
    //    - retry with payment
    let res = x402_client
        .execute_with_evm_exact(
            || x402_client.client.post(&url),
            signer,
        )
        .await
        .expect("x402 client flow should succeed");

    let status = res.status();
    let text = res.text().await.expect("read response body");
    dbg!(&status, &text);

    assert!(status.is_success());
}