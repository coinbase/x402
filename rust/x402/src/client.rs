use reqwest::{Client, RequestBuilder, Response, StatusCode};
use crate::types::{PaymentPayload, PaymentRequired, X402Header};

pub struct X402Client {
    client: Client,
}

impl X402Client {
    pub fn new() -> Self {
        Self {
            client: Client::new()
        }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client }
    }

    pub async fn execute<B, S, FutS> (
        &self,
        mut build_req: B,
        signer: S,
    ) -> Result<Response, Box<dyn std::error::Error>>
    where
        B: FnMut() -> RequestBuilder,
        S: Fn(PaymentRequired) -> FutS,
        FutS: Future<Output = Result<PaymentPayload, Box<dyn std::error::Error>>>,
    {
        // Make the first attempt with no payment
        let response = build_req().send().await?;

        // Handle x402 challenge
        if response.status() == StatusCode::PAYMENT_REQUIRED {
            if let Some(header) = response.headers().get("PAYMENT_REQUIRED") {
                let header_str = header.to_str()?;
                let challenge = PaymentRequired::from_header(header_str)?;

                // Use signer to solve the challenge
                let payload = signer(challenge).await?;
                let signature_header = payload.to_header()?;

                // Retry with payment
                return Ok(build_req()
                    .header("PAYMENT-SIGNATURE", signature_header)
                    .send()
                    .await?);
            }
        }
        Ok(response)
    }
}