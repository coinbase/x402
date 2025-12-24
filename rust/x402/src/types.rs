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
    pub payload: Value,
    pub extensions: Option<Value>,
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
            value: "1000000".to_string(),
            asset: Some("USDC".to_string()),
            data: Some(json!({"key": "value"})),
        };

        let json_str = serde_json::to_string(&req).unwrap();
        let deserialized: PaymentRequirements = serde_json::from_str(&json_str).unwrap();

        assert_eq!(req.scheme, deserialized.scheme);
        assert_eq!(req.network, deserialized.network);
        assert_eq!(req.pay_to, deserialized.pay_to);
        assert_eq!(req.value, deserialized.value);
        assert_eq!(req.asset, deserialized.asset);
    }

    #[test]
    fn test_payment_required_full_serialization() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234567890abcdef".to_string(),
            value: "1000000".to_string(),
            asset: Some("USDC".to_string()),
            data: None,
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
            value: "500000".to_string(),
            asset: None,
            data: None,
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
            value: "2000000".to_string(),
            asset: Some("DAI".to_string()),
            data: Some(json!({"nonce": 123})),
        };

        let payload = PaymentPayload {
            x402_version: 1,
            resource: "/api/premium".to_string(),
            accepted,
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
            extensions: Some(json!({"metadata": "test"})),
        };

        let json_str = serde_json::to_string(&payload).unwrap();
        let deserialized: PaymentPayload = serde_json::from_str(&json_str).unwrap();

        assert_eq!(payload.x402_version, deserialized.x402_version);
        assert_eq!(payload.resource, deserialized.resource);
        assert_eq!(payload.payload, deserialized.payload);
        assert_eq!(payload.accepted.scheme, deserialized.accepted.scheme);
    }

    #[test]
    fn test_payment_required_header_encoding() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234".to_string(),
            value: "1000".to_string(),
            asset: None,
            data: None,
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
            value: "5000".to_string(),
            asset: None,
            data: None,
        };

        let payload = PaymentPayload {
            x402_version: 1,
            resource: "/resource".to_string(),
            accepted,
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
            extensions: None,
        };

        let header = payload.to_header().unwrap();
        assert!(!header.is_empty());

        let decoded = PaymentPayload::from_header(&header).unwrap();
        assert_eq!(payload.x402_version, decoded.x402_version);
        assert_eq!(payload.resource, decoded.resource);
        assert_eq!(payload.payload, decoded.payload);
    }

    #[test]
    fn test_header_encoding_with_special_characters() {
        let payment_req = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "evm".to_string(),
            pay_to: "0x1234".to_string(),
            value: "1000".to_string(),
            asset: None,
            data: Some(json!({"test": "value+with/special=chars"})),
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
}


