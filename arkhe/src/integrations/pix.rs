use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PixPaymentRequest {
    pub amount: f64,
    pub description: String,
    pub payer_name: Option<String>,
    pub payer_document: Option<String>,
    pub expiration_seconds: Option<u32>,
    pub callback_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum PixStatus { Created, Waiting, Paid, Expired, Cancelled, Failed }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PixWebhookPayload {
    pub transaction_id: String,
    pub status: PixStatus,
    pub paid_amount: Option<f64>,
    pub paid_at: Option<DateTime<Utc>>,
    pub payer_document: Option<String>,
    pub payer_name: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

pub struct PixGateway {
    pub base_url: String,
    api_key: String,
    merchant_id: String,
}

impl PixGateway {
    pub fn new(base_url: &str, api_key: &str, merchant_id: &str) -> Self {
        Self { base_url: base_url.to_string(), api_key: api_key.to_string(), merchant_id: merchant_id.to_string() }
    }

    pub async fn create_payment(&self, _request: &PixPaymentRequest) -> Result<(), String> {
        Ok(())
    }
}

pub struct OpenFinanceClient {
    base_url: String,
    client_id: String,
    client_secret: String,
}

impl OpenFinanceClient {
    pub fn new(base_url: &str, client_id: &str, client_secret: &str) -> Self {
        Self { base_url: base_url.to_string(), client_id: client_id.to_string(), client_secret: client_secret.to_string() }
    }

    pub async fn transfer_pix(&self, _consent: &super::pix_openapi::OpenFinanceConsent, _pix_key: &str, _amount: f64, _description: &str) -> Result<(), String> {
        Ok(())
    }
}
