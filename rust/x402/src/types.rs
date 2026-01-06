use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use crate::errors::X402Result;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaymentRequirements {
    pub scheme: String,
    pub network: String,
    #[serde(rename="payTo")]
    pub pay_to: String,
    pub amount: String,
    pub asset: Option<String>,
    pub data: Option<Value>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub extra: Option<Value>,
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
    pub resource: Resource,
    pub accepted: PaymentRequirements,
    pub payload: Value,
    pub extensions: Option<Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Resource {
    pub url: String,
    pub description: String,
    #[serde(rename="mimeType")]
    pub mime_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    pub payment_payload: PaymentPayload,
    pub payment_requirements: PaymentRequirements,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleRequest {
    pub payment_payload: PaymentPayload,
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
pub struct SettleResponse {
    pub success: bool,
    #[serde(rename = "errorReason")]
    pub error_reason: Option<String>,
    pub payer: Option<String>,
    pub transaction: Option<String>,
    pub network: String,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Money {
    Number(f64),
    Text(String)
}

impl Money {
    pub fn to_string(&self) -> String {
        match self {
            Money::Number(n) => n.to_string(),
            Money::Text(s) => s.clone(),
        }
    }

    pub fn to_amount_asset(&self) -> (String, Option<String>) {
        match self {
            Money::Number(n) => (n.to_string(), None),
            Money::Text(s) => (s.clone(), None),
        }
    }

    pub fn from_str(s: &str) -> X402Result<Money> {
        if let Ok(n) = s.parse::<f64>() {
            return Ok(Money::Number(n));
        }
        Ok(Money::Text(s.to_string()))
    }
}

// Convenience conversions so callers don't need to construct Money manually.
impl From<f64> for Money {
    fn from(n: f64) -> Self {
        Money::Number(n)
    }
}

impl From<String> for Money {
    fn from(s: String) -> Self {
        // We reuse from_str so "1000" becomes Number(1000.0), "abc" becomes Text("abc")
        Money::from_str(&s).expect("Money::from_str should not fail")
    }
}

impl From<&str> for Money {
    fn from(s: &str) -> Self {
        Money::from_str(s).expect("Money::from_str should not fail")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetAmount {
    asset: String,
    amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    extra: Option<HashMap<String, Value>>,
}

impl AssetAmount {
    pub fn new(asset: String, amount: String, extra: Option<HashMap<String, Value>>) -> Self {
        AssetAmount { asset, amount, extra }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Price {
    Money(Money),
    AssetAmount(AssetAmount),
}

impl Price {
    pub fn to_asset_amount(&self) -> (String, Option<String>) {
        match self {
            Price::AssetAmount(aa) => (aa.amount.clone(), Some(aa.asset.clone())),
            Price::Money(m) => m.to_amount_asset(),
        }
    }
    /// Helper method to create money from something that converts into Money
    pub fn money<M: Into<Money>>(&self, m:M) -> Self {
        Price::Money(m.into())
    }
}

impl From<Money> for Price {
    fn from(m: Money) -> Self {
        Price::Money(m)
    }
}

impl From<f64> for Price {
    fn from(n: f64) -> Self {
        Price::Money(Money::Number(n))
    }
}

impl From<String> for Price {
    fn from(s: String) -> Self {
        Price::Money(Money::from(s))
    }
}

impl From<&str> for Price {
    fn from(s: &str) -> Self {
        Price::Money(Money::from(s))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Hash, Eq, PartialEq)]
#[serde(untagged)]
pub enum Network {
    CAIPNetwork(CAIPNetwork),
    String(String),
}

impl Network {
    pub fn to_string(&self) -> String {
        match self {
            Network::CAIPNetwork(caip_network) => caip_network.to_string(),
            Network::String(string_val) => string_val.to_owned(),
        }
    }
}

impl Default for Network {
    fn default() -> Self {
        Network::CAIPNetwork(CAIPNetwork::default())
    }
}

impl From<CAIPNetwork> for Network {
    fn from(caip_network: CAIPNetwork) -> Self {
        Network::CAIPNetwork(caip_network)
    }
}

impl From<String> for Network {
    fn from(s: String) -> Self {
        Network::String(s)
    }
}

impl From<&str> for Network {
    fn from(s: &str) -> Self {
        Network::String(s.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct CAIPNetwork {
    namespace: String,
    reference: String,
}

impl CAIPNetwork {
    pub fn new(namespace: String, reference: String) -> CAIPNetwork {
        CAIPNetwork { namespace, reference }
    }

    pub fn to_string(&self) -> String {
        format!("{}:{}", self.namespace, self.reference)
    }
}

/// Defaults to eip155:84532 (base-sepolia)
impl Default for CAIPNetwork {
    fn default() -> Self {
        CAIPNetwork {
            namespace: String::from("eip155"),
            reference: String::from("84532"),
        }
    }
}

// =======================
// CDP API (platform/v2/x402) DTOs
// =======================
// This will move to a default facilitator on abstraction

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdpVerifyRequestV1 {
    #[serde(rename="x402Version")]
    pub x402_version: u32,
    pub payment_payload: CdpPaymentPayloadV1,
    pub payment_requirements: CdpPaymentRequirementsV1,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdpPaymentPayloadV1 {
    pub x402_version: u32,
    pub scheme: String,
    pub network: String,
    pub payload: CdpExactPayloadV1,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdpExactPayloadV1 {
    pub signature: String,
    pub authorization: CdpAuthorizationV1,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdpAuthorizationV1 {
    pub from: String,
    pub to: String,
    pub value: String,
    pub valid_after: String,
    pub valid_before: String,
    pub nonce: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdpPaymentRequirementsV1 {
    pub scheme: String,
    pub network: String,
    pub max_amount_required: String,
    pub resource: String,
    pub description: String,
    pub mime_type: String,
    pub pay_to: String,
    pub max_timeout_seconds: u64,
    pub asset: String,
    pub output_schema: Option<Value>,
    pub extra: Option<Value>
}


/// Helper trait to handle the Base64 encoding/decoding for headers
pub trait X402Header: Serialize + for<'de> Deserialize<'de> {
    fn to_header(&self) -> X402Result<String> {
        let json = serde_json::to_string(self)?;
        Ok(URL_SAFE_NO_PAD.encode(json))
    }

    fn from_header(header: &str) -> X402Result<Self> {
        let decoded = URL_SAFE_NO_PAD.decode(header)?;
        let header: Self = serde_json::from_str(&String::from_utf8(decoded)?)?;
        Ok(header)
    }
}

impl X402Header for PaymentPayload {}
impl X402Header for PaymentRequired {}


#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_payment_requirements_serialization() {
        let req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234567890abcdef".to_string(),
            amount: "1000000".to_string(),
            asset: Some("USDC".to_string()),
            data: Some(json!({"key": "value"})),
            extra: None,
        };

        let json_str = serde_json::to_string(&req).unwrap();
        let deserialized: PaymentRequirements = serde_json::from_str(&json_str).unwrap();

        assert_eq!(req.scheme, deserialized.scheme);
        assert_eq!(req.network, deserialized.network);
        assert_eq!(req.pay_to, deserialized.pay_to);
        assert_eq!(req.amount, deserialized.amount);
        assert_eq!(req.asset, deserialized.asset);
    }

    #[test]
    fn test_payment_required_full_serialization() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234567890abcdef".to_string(),
            amount: "1000000".to_string(),
            asset: Some("USDC".to_string()),
            data: None,
            extra: None,
        };

        let required = PaymentRequired {
            x402_version: 1,
            resource: "/api/weather".to_string(),
            accepts: vec![payment_req],
            description: Some("Weather data access".to_string()),
            extensions: Some(json!({"custom": "field"})),
        };

        let json_str = serde_json::to_string(&required).unwrap();
        let deserialized: PaymentRequired = serde_json::from_str(&json_str).unwrap();

        assert_eq!(required.x402_version, deserialized.x402_version);
        assert_eq!(required.resource, deserialized.resource);
        assert_eq!(required.accepts.len(), deserialized.accepts.len());
        assert_eq!(required.description, deserialized.description);
    }

    #[test]
    fn test_payment_required_minimal_serialization() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "solana".to_string(),
            pay_to: "So11111111111111111111111111111111111111112".to_string(),
            amount: "500000".to_string(),
            asset: None,
            data: None,
            extra: None,
        };

        let required = PaymentRequired {
            x402_version: 1,
            resource: "/api/data".to_string(),
            accepts: vec![payment_req],
            description: None,
            extensions: None,
        };

        let json_str = serde_json::to_string(&required).unwrap();
        let deserialized: PaymentRequired = serde_json::from_str(&json_str).unwrap();

        assert_eq!(required.x402_version, deserialized.x402_version);
        assert_eq!(required.resource, deserialized.resource);
        assert!(deserialized.description.is_none());
        assert!(deserialized.extensions.is_none());
    }

    #[test]
    fn test_payment_payload_serialization() {
        let accepted = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0xabcdef1234567890".to_string(),
            amount: "2000000".to_string(),
            asset: Some("DAI".to_string()),
            data: Some(json!({"nonce": 123})),
            extra: None,
        };

        let payload = PaymentPayload {
            x402_version: 1,
            resource: Resource {
                url: "/api/premium".to_string(),
                description: "Test".to_string(),
                mime_type: "text/plain".to_string(),
            },
            accepted,
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
            extensions: Some(json!({"metadata": "test"})),
        };

        let json_str = serde_json::to_string(&payload).unwrap();
        let deserialized: PaymentPayload = serde_json::from_str(&json_str).unwrap();

        assert_eq!(payload.x402_version, deserialized.x402_version);
        assert_eq!(payload.resource.url, deserialized.resource.url);
        assert_eq!(payload.payload, deserialized.payload);
        assert_eq!(payload.accepted.scheme, deserialized.accepted.scheme);
    }

    #[test]
    fn test_payment_required_header_encoding() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234".to_string(),
            amount: "1000".to_string(),
            asset: None,
            data: None,
            extra: None,
        };

        let required = PaymentRequired {
            x402_version: 1,
            resource: "/test".to_string(),
            accepts: vec![payment_req],
            description: Some("Test".to_string()),
            extensions: None,
        };

        let header = required.to_header().unwrap();
        assert!(!header.is_empty());
        assert!(!header.contains('='));
        assert!(!header.contains('+'));
        assert!(!header.contains('/'));

        let decoded = PaymentRequired::from_header(&header).unwrap();
        assert_eq!(required.x402_version, decoded.x402_version);
        assert_eq!(required.resource, decoded.resource);
        assert_eq!(required.description, decoded.description);
    }

    #[test]
    fn test_payment_payload_header_encoding() {
        let accepted = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "solana".to_string(),
            pay_to: "0xtest".to_string(),
            amount: "5000".to_string(),
            asset: None,
            data: None,
            extra: None,
        };

        let payload = PaymentPayload {
            x402_version: 1,
            resource: Resource {
                url: "/api/premium".to_string(),
                description: "Test".to_string(),
                mime_type: "text/plain".to_string(),
            },
            accepted,
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
            extensions: None,
        };

        let header = payload.to_header().unwrap();
        assert!(!header.is_empty());

        let decoded = PaymentPayload::from_header(&header).unwrap();
        assert_eq!(payload.x402_version, decoded.x402_version);
        assert_eq!(payload.resource.url, decoded.resource.url);
        assert_eq!(payload.payload, decoded.payload);
    }

    #[test]
    fn test_header_encoding_with_special_characters() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234".to_string(),
            amount: "1000".to_string(),
            asset: None,
            data: Some(json!({"test": "value+with/special=chars"})),
            extra: None,
        };

        let required = PaymentRequired {
            x402_version: 1,
            resource: "/test?param=value".to_string(),
            accepts: vec![payment_req],
            description: Some("Test with special chars: +/=".to_string()),
            extensions: None,
        };

        let header = required.to_header().unwrap();
        let decoded = PaymentRequired::from_header(&header).unwrap();

        assert_eq!(required.resource, decoded.resource);
        assert_eq!(required.description, decoded.description);
    }

    #[test]
    fn test_invalid_base64_decoding() {
        let result = PaymentRequired::from_header("not-valid-base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_json_deserialization() {
        let invalid_json_base64 = URL_SAFE_NO_PAD.encode("not valid json");
        let result = PaymentRequired::from_header(&invalid_json_base64);
        assert!(result.is_err());
    }

    #[test]
    fn test_caip_network_to_string() {
        let caip = CAIPNetwork::new("eip155".to_string(), "1".to_string());
        assert_eq!(caip.to_string(), "eip155:1");
    }

    #[test]
    fn test_caip_network_default() {
        let caip = CAIPNetwork::default();
        assert_eq!(caip.to_string(), "eip155:84532");
    }

    #[test]
    fn test_network_to_string() {
        let n1 = Network::String("solana:mainnet".to_string());
        assert_eq!(n1.to_string(), "solana:mainnet");

        let n2 = Network::CAIPNetwork(CAIPNetwork::new("eip155".to_string(), "1".to_string()));
        assert_eq!(n2.to_string(), "eip155:1");
    }

    #[test]
    fn test_network_default() {
        let n = Network::default();
        assert_eq!(n.to_string(), "eip155:84532");
    }

    #[test]
    fn test_network_conversions() {
        let caip = CAIPNetwork::new("eip155".to_string(), "1".to_string());
        let n: Network = caip.into();
        assert_eq!(n.to_string(), "eip155:1");

        let n2: Network = Network::from("solana:mainnet");
        assert_eq!(n2.to_string(), "solana:mainnet");
    }

    #[test]
    fn test_network_serialization() {
        let n = Network::from("solana:mainnet");
        let json = serde_json::to_string(&n).unwrap();
        // Network is now untagged, so it should serialize as a plain string
        assert_eq!(json, "\"solana:mainnet\"");

        let n2: Network = serde_json::from_str(&json).unwrap();
        match n2 {
            Network::String(s) => assert_eq!(s, "solana:mainnet"),
            _ => panic!("Expected Network::String"),
        }

        let n3 = Network::CAIPNetwork(CAIPNetwork::new("eip155".to_string(), "1".to_string()));
        let json2 = serde_json::to_string(&n3).unwrap();
        // CAIPNetwork is a struct, so it serializes as an object
        assert_eq!(json2, "{\"namespace\":\"eip155\",\"reference\":\"1\"}");

        let n4: Network = serde_json::from_str(&json2).unwrap();
        match n4 {
            Network::CAIPNetwork(caip) => {
                assert_eq!(caip.namespace, "eip155");
                assert_eq!(caip.reference, "1");
            }
            _ => panic!("Expected Network::CAIPNetwork"),
        }
    }
}


