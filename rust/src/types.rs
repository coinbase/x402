//! Core types for the x402 protocol

use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

/// Type alias for authentication headers function
pub type AuthHeadersFn =
    dyn Fn() -> crate::Result<HashMap<String, HashMap<String, String>>> + Send + Sync;

/// Type alias for authentication headers function wrapped in Arc
pub type AuthHeadersFnArc = Arc<AuthHeadersFn>;

/// Type alias for authentication headers function wrapped in Box
pub type AuthHeadersFnBox = Box<AuthHeadersFn>;

/// x402 protocol version
pub const X402_VERSION: u32 = 1;

/// Network configuration for x402 payments
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Mainnet,
    Testnet,
}

/// Network configuration with chain-specific details
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    /// Chain ID for the network
    pub chain_id: u64,
    /// USDC contract address
    pub usdc_contract: String,
    /// Network name
    pub name: String,
    /// Whether this is a testnet
    pub is_testnet: bool,
}

impl NetworkConfig {
    /// Base mainnet configuration
    pub fn base_mainnet() -> Self {
        Self {
            chain_id: 8453,
            usdc_contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(),
            name: "base".to_string(),
            is_testnet: false,
        }
    }

    /// Base Sepolia testnet configuration
    pub fn base_sepolia() -> Self {
        Self {
            chain_id: 84532,
            usdc_contract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string(),
            name: "base-sepolia".to_string(),
            is_testnet: true,
        }
    }

    /// Get network config by name
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "base" => Some(Self::base_mainnet()),
            "base-sepolia" => Some(Self::base_sepolia()),
            _ => None,
        }
    }
}

impl Network {
    /// Get the network identifier string
    pub fn as_str(&self) -> &'static str {
        match self {
            Network::Mainnet => "base",
            Network::Testnet => "base-sepolia",
        }
    }

    /// Get the USDC contract address for this network
    pub fn usdc_address(&self) -> &'static str {
        match self {
            Network::Mainnet => "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            Network::Testnet => "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        }
    }

    /// Get the USDC token name for this network
    pub fn usdc_name(&self) -> &'static str {
        match self {
            Network::Mainnet => "USD Coin",
            Network::Testnet => "USDC",
        }
    }
}

/// Payment requirements for a resource
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequirements {
    /// Payment scheme identifier (e.g., "exact")
    pub scheme: String,
    /// Blockchain network identifier (e.g., "base-sepolia", "ethereum-mainnet")
    pub network: String,
    /// Required payment amount in atomic token units
    #[serde(rename = "maxAmountRequired")]
    pub max_amount_required: String,
    /// Token contract address
    pub asset: String,
    /// Recipient wallet address for the payment
    #[serde(rename = "payTo")]
    pub pay_to: String,
    /// URL of the protected resource
    pub resource: String,
    /// Human-readable description of the resource
    pub description: String,
    /// MIME type of the expected response
    #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    /// JSON schema describing the response format
    #[serde(rename = "outputSchema", skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Value>,
    /// Maximum time allowed for payment completion in seconds
    #[serde(rename = "maxTimeoutSeconds")]
    pub max_timeout_seconds: u32,
    /// Scheme-specific additional information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<Value>,
}

impl PaymentRequirements {
    /// Create a new payment requirements instance
    pub fn new(
        scheme: impl Into<String>,
        network: impl Into<String>,
        max_amount_required: impl Into<String>,
        asset: impl Into<String>,
        pay_to: impl Into<String>,
        resource: impl Into<String>,
        description: impl Into<String>,
    ) -> Self {
        Self {
            scheme: scheme.into(),
            network: network.into(),
            max_amount_required: max_amount_required.into(),
            asset: asset.into(),
            pay_to: pay_to.into(),
            resource: resource.into(),
            description: description.into(),
            mime_type: None,
            output_schema: None,
            max_timeout_seconds: 60,
            extra: None,
        }
    }

    /// Set USDC token information in the extra field
    pub fn set_usdc_info(&mut self, network: Network) -> crate::Result<()> {
        let mut usdc_info = HashMap::new();
        usdc_info.insert("name".to_string(), network.usdc_name().to_string());
        usdc_info.insert("version".to_string(), "2".to_string());

        self.extra = Some(serde_json::to_value(usdc_info)?);
        Ok(())
    }

    /// Get the amount as a decimal
    pub fn amount_as_decimal(&self) -> crate::Result<Decimal> {
        self.max_amount_required
            .parse()
            .map_err(|_| crate::X402Error::invalid_payment_requirements("Invalid amount format"))
    }

    /// Get the amount in decimal units (e.g., 0.01 for 1 cent)
    pub fn amount_in_decimal_units(&self, decimals: u8) -> crate::Result<Decimal> {
        let amount = self.amount_as_decimal()?;
        let divisor = Decimal::from(10u64.pow(decimals as u32));
        Ok(amount / divisor)
    }
}

/// Payment payload for client payment authorization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentPayload {
    /// Protocol version identifier
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
    /// Payment scheme identifier
    pub scheme: String,
    /// Blockchain network identifier
    pub network: String,
    /// Payment data object
    pub payload: ExactEvmPayload,
}

impl PaymentPayload {
    /// Create a new payment payload
    pub fn new(
        scheme: impl Into<String>,
        network: impl Into<String>,
        payload: ExactEvmPayload,
    ) -> Self {
        Self {
            x402_version: X402_VERSION,
            scheme: scheme.into(),
            network: network.into(),
            payload,
        }
    }

    /// Decode a base64-encoded payment payload
    pub fn from_base64(encoded: &str) -> crate::Result<Self> {
        use base64::{engine::general_purpose, Engine as _};
        let decoded = general_purpose::STANDARD.decode(encoded)?;
        let payload: PaymentPayload = serde_json::from_slice(&decoded)?;
        Ok(payload)
    }

    /// Encode the payment payload to base64
    pub fn to_base64(&self) -> crate::Result<String> {
        use base64::{engine::general_purpose, Engine as _};
        let json = serde_json::to_string(self)?;
        Ok(general_purpose::STANDARD.encode(json))
    }
}

/// Exact EVM payment payload (EIP-3009)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExactEvmPayload {
    /// EIP-712 signature for authorization
    pub signature: String,
    /// EIP-3009 authorization parameters
    pub authorization: ExactEvmPayloadAuthorization,
}

/// EIP-3009 authorization parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExactEvmPayloadAuthorization {
    /// Payer's wallet address
    pub from: String,
    /// Recipient's wallet address
    pub to: String,
    /// Payment amount in atomic units
    pub value: String,
    /// Unix timestamp when authorization becomes valid
    #[serde(rename = "validAfter")]
    pub valid_after: String,
    /// Unix timestamp when authorization expires
    #[serde(rename = "validBefore")]
    pub valid_before: String,
    /// 32-byte random nonce to prevent replay attacks
    pub nonce: String,
}

impl ExactEvmPayloadAuthorization {
    /// Create a new authorization
    pub fn new(
        from: impl Into<String>,
        to: impl Into<String>,
        value: impl Into<String>,
        valid_after: impl Into<String>,
        valid_before: impl Into<String>,
        nonce: impl Into<String>,
    ) -> Self {
        Self {
            from: from.into(),
            to: to.into(),
            value: value.into(),
            valid_after: valid_after.into(),
            valid_before: valid_before.into(),
            nonce: nonce.into(),
        }
    }

    /// Check if the authorization is currently valid
    pub fn is_valid_now(&self) -> crate::Result<bool> {
        let now = Utc::now().timestamp();
        let valid_after: i64 = self.valid_after.parse().map_err(|_| {
            crate::X402Error::invalid_authorization("Invalid valid_after timestamp")
        })?;
        let valid_before: i64 = self.valid_before.parse().map_err(|_| {
            crate::X402Error::invalid_authorization("Invalid valid_before timestamp")
        })?;

        Ok(now >= valid_after && now <= valid_before)
    }

    /// Get the validity duration
    pub fn validity_duration(&self) -> crate::Result<Duration> {
        let valid_after: i64 = self.valid_after.parse().map_err(|_| {
            crate::X402Error::invalid_authorization("Invalid valid_after timestamp")
        })?;
        let valid_before: i64 = self.valid_before.parse().map_err(|_| {
            crate::X402Error::invalid_authorization("Invalid valid_before timestamp")
        })?;

        Ok(Duration::from_secs((valid_before - valid_after) as u64))
    }
}

/// Payment verification response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResponse {
    /// Whether the payment is valid
    #[serde(rename = "isValid")]
    pub is_valid: bool,
    /// Reason for invalidity (if applicable)
    #[serde(rename = "invalidReason", skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    /// Payer's address
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
}

/// Payment settlement response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettleResponse {
    /// Whether the settlement was successful
    pub success: bool,
    /// Error reason if settlement failed
    #[serde(rename = "errorReason", skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    /// Transaction hash or identifier
    pub transaction: String,
    /// Network where the transaction was executed
    pub network: String,
    /// Payer address if applicable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
}

impl SettleResponse {
    /// Encode the settle response to base64
    pub fn to_base64(&self) -> crate::Result<String> {
        use base64::{engine::general_purpose, Engine as _};
        let json = serde_json::to_string(self)?;
        Ok(general_purpose::STANDARD.encode(json))
    }
}

/// Facilitator configuration
#[derive(Clone)]
pub struct FacilitatorConfig {
    /// Base URL of the facilitator service
    pub url: String,
    /// Request timeout
    pub timeout: Option<Duration>,
    /// Function to create authentication headers
    pub create_auth_headers: Option<AuthHeadersFnArc>,
}

impl std::fmt::Debug for FacilitatorConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FacilitatorConfig")
            .field("url", &self.url)
            .field("timeout", &self.timeout)
            .field("create_auth_headers", &"<function>")
            .finish()
    }
}

impl FacilitatorConfig {
    /// Create a new facilitator config
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            timeout: None,
            create_auth_headers: None,
        }
    }

    /// Validate the facilitator configuration
    pub fn validate(&self) -> crate::Result<()> {
        if self.url.is_empty() {
            return Err(crate::X402Error::config("Facilitator URL cannot be empty"));
        }

        if !self.url.starts_with("http://") && !self.url.starts_with("https://") {
            return Err(crate::X402Error::config(
                "Facilitator URL must start with http:// or https://",
            ));
        }

        Ok(())
    }

    /// Set the request timeout
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Set the auth headers creator
    pub fn with_auth_headers(mut self, creator: AuthHeadersFnBox) -> Self {
        self.create_auth_headers = Some(Arc::from(creator));
        self
    }
}

impl Default for FacilitatorConfig {
    fn default() -> Self {
        Self::new("https://x402.org/facilitator")
    }
}

/// Payment requirements response (HTTP 402 response)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequirementsResponse {
    /// Protocol version
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
    /// Human-readable error message
    pub error: String,
    /// Array of acceptable payment methods
    pub accepts: Vec<PaymentRequirements>,
}

impl PaymentRequirementsResponse {
    /// Create a new payment requirements response
    pub fn new(error: impl Into<String>, accepts: Vec<PaymentRequirements>) -> Self {
        Self {
            x402_version: X402_VERSION,
            error: error.into(),
            accepts,
        }
    }
}

/// Supported payment schemes and networks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportedKinds {
    /// List of supported payment schemes and networks
    pub kinds: Vec<SupportedKind>,
}

/// Individual supported payment scheme and network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportedKind {
    /// Protocol version
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
    /// Payment scheme identifier
    pub scheme: String,
    /// Blockchain network identifier
    pub network: String,
}

/// Discovery API resource
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryResource {
    /// The resource URL or identifier
    pub resource: String,
    /// Resource type (e.g., "http")
    pub r#type: String,
    /// Protocol version supported by the resource
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
    /// Payment requirements for this resource
    pub accepts: Vec<PaymentRequirements>,
    /// Unix timestamp of when the resource was last updated
    #[serde(rename = "lastUpdated")]
    pub last_updated: u64,
    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Discovery API response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryResponse {
    /// Protocol version
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
    /// List of discoverable resources
    pub items: Vec<DiscoveryResource>,
    /// Pagination information
    pub pagination: PaginationInfo,
}

/// Pagination information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationInfo {
    /// Maximum number of results
    pub limit: u32,
    /// Number of results skipped
    pub offset: u32,
    /// Total number of results
    pub total: u32,
}

/// Common network configurations
pub mod networks {
    /// Base mainnet configuration
    pub const BASE_MAINNET: &str = "base";
    /// Base Sepolia testnet configuration
    pub const BASE_SEPOLIA: &str = "base-sepolia";
    /// Avalanche mainnet configuration
    pub const AVALANCHE_MAINNET: &str = "avalanche";
    /// Avalanche Fuji testnet configuration
    pub const AVALANCHE_FUJI: &str = "avalanche-fuji";

    /// Get USDC contract address for a network
    pub fn get_usdc_address(network: &str) -> Option<&'static str> {
        match network {
            BASE_MAINNET => Some("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
            BASE_SEPOLIA => Some("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
            AVALANCHE_MAINNET => Some("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"),
            AVALANCHE_FUJI => Some("0x5425890298aed601595a70AB815c96711a31Bc65"),
            _ => None,
        }
    }

    /// Check if a network is supported
    pub fn is_supported(network: &str) -> bool {
        matches!(
            network,
            BASE_MAINNET | BASE_SEPOLIA | AVALANCHE_MAINNET | AVALANCHE_FUJI
        )
    }

    /// Get all supported networks
    pub fn all_supported() -> Vec<&'static str> {
        vec![
            BASE_MAINNET,
            BASE_SEPOLIA,
            AVALANCHE_MAINNET,
            AVALANCHE_FUJI,
        ]
    }
}

/// Common payment schemes
pub mod schemes {
    /// Exact payment scheme (EIP-3009)
    pub const EXACT: &str = "exact";
}
