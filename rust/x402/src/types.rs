use serde::{Deserialize, Serialize};
use serde_json::Value;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaymentRequirements {
    pub scheme: String,
    pub network: String,
    #[serde(rename="payTo")]
    pub pay_to: String,
    pub value: String,
    pub asset: Option<String>,
    pub data: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaymentRequired {
    #[serde(rename="x402Version")]
    pub x402_version: u32,
    pub resource: String,
    pub accepts: Vec<PaymentRequirements>,
    pub description: Option<String>,
    pub extensions: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaymentPayload {
    #[serde(rename="x402Version")]
    pub x402_version: u32,
    pub resource: String,
    pub accepted: PaymentRequirements,
    pub signature: String,
    pub extensions: Option<Value>,
}


/// Helper trait to handle the Base64 encoding/decoding for headers
pub trait x402Header: Serialize + for<'de> Deserialize<'de> {
    fn to_header(&self) -> Result<String, Box<dyn std::error::Error>> {
        let json = serde_json::to_string(self)?;
        Ok(URL_SAFE_NO_PAD.encode(json))
    }

    fn from_header(header: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let decoded = URL_SAFE_NO_PAD.decode(header)?;
        let header: Self = serde_json::from_str(&String::from_utf8(decoded)?)?;
        Ok(header)
    }
}

impl x402Header for PaymentPayload {}
impl x402Header for PaymentRequired {}