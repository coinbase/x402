use http::HeaderMap;
use crate::errors::{X402Error, X402Result};
use crate::types::{PaymentPayload, PaymentRequirements, SettleResponse, VerifyRequest, VerifyResponse};

pub struct Facilitator {
    pub url: String,
    client: reqwest::Client,
    headers: HeaderMap,
}

impl Facilitator {
    pub fn new(url: &str) -> Self {
        Facilitator {
            url: url.to_string(),
            client: reqwest::Client::new(),
            headers: HeaderMap::new(),
        }
    }

    pub fn with_headers(url: &str, headers: reqwest::header::HeaderMap) -> Self {
        Facilitator {
            url: url.to_string(),
            client: reqwest::Client::new(),
            headers,
        }
    }

    pub async fn verify(
        &self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> X402Result<VerifyResponse> {
        // This is a simplified version of the TypeScript implementation.
        // It assumes the use of Coinbase's facilitator and will be abstracted to a plug-in system in the future.
        let url = format!("{}/verify", self.url.trim_end_matches('/'));

        let request = crate::types::VerifyRequest {
            payment_payload: payload,
            payment_requirements: requirements,
        };


        use serde_json::to_string_pretty;

        let json = to_string_pretty(&request)?;
        println!("JSON: {json}");

        let response = self.client.post(url)
            .headers(self.headers.clone())
            .json(&request)
            .send()
            .await?;

        let response_status = response.status();
        if !response_status.is_success() {
            let err_text = response.text().await.unwrap_or_else(|_| String::from("Unknown Error"));
            return Err(X402Error::FacilitatorRejection(response_status.as_u16(), err_text))
        }

        Ok(response.json::<VerifyResponse>().await?)
    }

    pub async fn settle(
        &self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> Result<SettleResponse, reqwest::Error> {
        // This is a simplified version of the TypeScript implementation.
        // It assumes the use of Coinbase's facilitator and will be abstracted to a plug-in system in the future.
        let url = format!("{}/settle", self.url);

        let request = VerifyRequest {
            payment_payload: payload,
            payment_requirements: requirements
        };

        let response = self.client.post(url)
            .headers(self.headers.clone())
            .json(&request)
            .send()
            .await?;

        response.json::<SettleResponse>().await
    }
}
