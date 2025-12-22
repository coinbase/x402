use serde::{Deserialize, Serialize};
use crate::types::{PaymentRequirements, PaymentPayload};

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyRequest {
    #[serde(rename = "paymentPayload")]
    pub payment_payload: PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyResponse {
    #[serde(rename = "isValid")]
    pub is_valid: bool,
    #[serde(rename = "invalidReason")]
    pub invalid_reason: Option<String>,
    pub payer: Option<String>,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct SettleRequest {
    #[serde(rename = "paymentPayload")]
    pub payment_payload: PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettleResponse {
    pub success: bool,
    #[serde(rename = "errorReason")]
    pub error_reason: Option<String>,
    pub payer: Option<String>,
    pub transaction: String,
    pub network: String,
}


pub struct Facilitator {
    pub url: String,
    client: reqwest::Client,
}

impl Facilitator {
    pub fn new(url: &str) -> Self {
        Facilitator {
            url: url.to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn verify(
        &self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> Result<VerifyResponse, reqwest::Error> {
        // This is a simplified version of the TypeScript implementation.
        // It assumes the use of Coinbase's facilitator and will be abstracted to a plug-in system in the future.
        let url = format!("{}/verify", self.url);
        let request = VerifyRequest {
            payment_payload: payload,
            payment_requirements: requirements,
        };

        let response = self.client.post(url)
            .json(&request)
            .send()
            .await?;

        response.json::<VerifyResponse>().await
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
            payment_requirements: requirements,
        };

        let response = self.client.post(url)
            .json(&request)
            .send()
            .await?;

        response.json::<SettleResponse>().await
    }
}