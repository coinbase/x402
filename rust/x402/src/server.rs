use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use crate::types::{PaymentRequirements, PaymentPayload, CdpVerifyRequestV1, CdpPaymentPayloadV1, CdpExactPayloadV1, CdpAuthorizationV1, CdpPaymentRequirementsV1};
use crate::errors::{X402Error, X402Result};

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyRequest {
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
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
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
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

        let request = CdpVerifyRequestV1 {
            x402_version: payload.x402_version,
            payment_payload: CdpPaymentPayloadV1 {
                x402_version: payload.x402_version,
                scheme: payload.accepted.scheme.clone(),
                network: payload.accepted.network.clone(),
                payload: CdpExactPayloadV1 {
                    signature: payload.payload.get("signature")
                        .and_then(|v| v.as_str())
                        .unwrap_or("0x...")
                        .to_string(),
                    authorization: CdpAuthorizationV1 {
                        from: payload.payload.get("authorization")
                            .and_then(|a| a.get("from"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("0x...")
                            .to_string(),
                        to: payload.payload.get("authorization")
                            .and_then(|a| a.get("to"))
                            .and_then(|v| v.as_str())
                            .unwrap_or(requirements.pay_to.as_str())
                            .to_string(),
                        value: payload.payload.get("authorization")
                            .and_then(|a| a.get("value"))
                            .and_then(|v| v.as_str())
                            .unwrap_or(requirements.value.as_str())
                            .to_string(),
                        valid_after: payload.payload.get("authorization")
                            .and_then(|a| a.get("valid_after"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("...")
                            .to_string(),
                        valid_before: payload.payload.get("authorization")
                            .and_then(|a| a.get("valid_before"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("...")
                            .to_string(),
                        nonce: payload.payload.get("authorization")
                            .and_then(|a| a.get("nonce"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("0x...")
                            .to_string(),
                    },
                },
            },
            payment_requirements: CdpPaymentRequirementsV1 {
                scheme: requirements.scheme.clone(),
                network: requirements.network.clone(),
                max_amount_required: requirements.value.clone(),
                resource: payload.resource.clone(),
                pay_to: requirements.pay_to.clone(),
                asset: requirements.asset.clone().unwrap_or_else(|| "0x...".to_string()),
            },
        };


        dbg!(&request);

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
            x402_version: payload.x402_version,
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