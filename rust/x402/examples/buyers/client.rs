use alloy::signers::local::PrivateKeySigner;
use serde_json::Value;
use std::env;
use std::str::FromStr;
use x402::client::X402Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let private_key = env::var("PRIVATE_KEY").expect("PRIVATE_KEY environment variable must be set");
    let signer = PrivateKeySigner::from_str(&private_key)
        .expect("Invalid PRIVATE_KEY");

    let wallet_address = signer.address();
    println!("Wallet address: {wallet_address}");

    // Creates an underlying reqwest client
    let x402_client = X402Client::new();

    let url = "http://0.0.0.0:3000/api/premium".to_string();

    let res = x402_client.execute_with_evm_exact_v2(
        || x402_client.client.post(&url),
        signer
    ).await?;

    println!("Status: {}", res.status());
    println!("Headers: {:#?}", res.headers());

    let val = res.json::<Value>().await?;
    println!("{:#?}", val);

    Ok(())
}
