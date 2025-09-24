//! Error types for the x402 library

use thiserror::Error;

#[cfg(feature = "actix-web")]
use actix_web::{HttpResponse, ResponseError};

/// Result type alias for x402 operations
pub type Result<T> = std::result::Result<T, X402Error>;

/// Main error type for x402 operations
#[derive(Error, Debug)]
pub enum X402Error {
    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// HTTP client error
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// Base64 encoding/decoding error
    #[error("Base64 error: {0}")]
    Base64(#[from] base64::DecodeError),

    /// Invalid payment payload
    #[error("Invalid payment payload: {message}")]
    InvalidPaymentPayload { message: String },

    /// Invalid payment requirements
    #[error("Invalid payment requirements: {message}")]
    InvalidPaymentRequirements { message: String },

    /// Payment verification failed
    #[error("Payment verification failed: {reason}")]
    PaymentVerificationFailed { reason: String },

    /// Payment settlement failed
    #[error("Payment settlement failed: {reason}")]
    PaymentSettlementFailed { reason: String },

    /// Facilitator communication error
    #[error("Facilitator error: {message}")]
    FacilitatorError { message: String },

    /// Cryptographic error
    #[error("Cryptographic error: {0}")]
    Crypto(#[from] Box<dyn std::error::Error + Send + Sync>),

    /// Invalid signature
    #[error("Invalid signature: {message}")]
    InvalidSignature { message: String },

    /// Invalid authorization
    #[error("Invalid authorization: {message}")]
    InvalidAuthorization { message: String },

    /// Network not supported
    #[error("Network not supported: {network}")]
    NetworkNotSupported { network: String },

    /// Scheme not supported
    #[error("Scheme not supported: {scheme}")]
    SchemeNotSupported { scheme: String },

    /// Insufficient funds
    #[error("Insufficient funds")]
    InsufficientFunds,

    /// Authorization expired
    #[error("Authorization expired")]
    AuthorizationExpired,

    /// Authorization not yet valid
    #[error("Authorization not yet valid")]
    AuthorizationNotYetValid,

    /// Invalid amount
    #[error("Invalid amount: expected {expected}, got {got}")]
    InvalidAmount { expected: String, got: String },

    /// Recipient mismatch
    #[error("Recipient mismatch: expected {expected}, got {got}")]
    RecipientMismatch { expected: String, got: String },

    /// Unexpected error
    #[error("Unexpected error: {message}")]
    Unexpected { message: String },

    /// Configuration error
    #[error("Configuration error: {message}")]
    Config { message: String },

    /// Timeout error
    #[error("Request timeout")]
    Timeout,

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl X402Error {
    /// Create an invalid payment payload error
    pub fn invalid_payment_payload(message: impl Into<String>) -> Self {
        Self::InvalidPaymentPayload {
            message: message.into(),
        }
    }

    /// Create an invalid payment requirements error
    pub fn invalid_payment_requirements(message: impl Into<String>) -> Self {
        Self::InvalidPaymentRequirements {
            message: message.into(),
        }
    }

    /// Create a payment verification failed error
    pub fn payment_verification_failed(reason: impl Into<String>) -> Self {
        Self::PaymentVerificationFailed {
            reason: reason.into(),
        }
    }

    /// Create a payment settlement failed error
    pub fn payment_settlement_failed(reason: impl Into<String>) -> Self {
        Self::PaymentSettlementFailed {
            reason: reason.into(),
        }
    }

    /// Create a facilitator error
    pub fn facilitator_error(message: impl Into<String>) -> Self {
        Self::FacilitatorError {
            message: message.into(),
        }
    }

    /// Create an invalid signature error
    pub fn invalid_signature(message: impl Into<String>) -> Self {
        Self::InvalidSignature {
            message: message.into(),
        }
    }

    /// Create an invalid authorization error
    pub fn invalid_authorization(message: impl Into<String>) -> Self {
        Self::InvalidAuthorization {
            message: message.into(),
        }
    }

    /// Create an unexpected error
    pub fn unexpected(message: impl Into<String>) -> Self {
        Self::Unexpected {
            message: message.into(),
        }
    }

    /// Create a configuration error
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config {
            message: message.into(),
        }
    }

    /// Get HTTP status code for this error
    pub fn status_code(&self) -> u16 {
        match self {
            Self::InvalidPaymentPayload { .. } => 400,
            Self::InvalidPaymentRequirements { .. } => 400,
            Self::PaymentVerificationFailed { .. } => 402,
            Self::PaymentSettlementFailed { .. } => 402,
            Self::FacilitatorError { .. } => 502,
            Self::InvalidSignature { .. } => 400,
            Self::InvalidAuthorization { .. } => 401,
            Self::NetworkNotSupported { .. } => 400,
            Self::SchemeNotSupported { .. } => 400,
            Self::InsufficientFunds => 402,
            Self::AuthorizationExpired => 401,
            Self::AuthorizationNotYetValid => 401,
            Self::InvalidAmount { .. } => 400,
            Self::RecipientMismatch { .. } => 400,
            Self::Unexpected { .. } => 500,
            Self::Config { .. } => 500,
            Self::Timeout => 408,
            Self::Json(_) => 400,
            Self::Http(_) => 502,
            Self::Base64(_) => 400,
            Self::Crypto(_) => 500,
            Self::Io(_) => 500,
        }
    }

    /// Get error type string
    pub fn error_type(&self) -> &'static str {
        match self {
            Self::InvalidPaymentPayload { .. } => "invalid_payment_payload",
            Self::InvalidPaymentRequirements { .. } => "invalid_payment_requirements",
            Self::PaymentVerificationFailed { .. } => "payment_verification_failed",
            Self::PaymentSettlementFailed { .. } => "payment_settlement_failed",
            Self::FacilitatorError { .. } => "facilitator_error",
            Self::InvalidSignature { .. } => "invalid_signature",
            Self::InvalidAuthorization { .. } => "invalid_authorization",
            Self::NetworkNotSupported { .. } => "network_not_supported",
            Self::SchemeNotSupported { .. } => "scheme_not_supported",
            Self::InsufficientFunds => "insufficient_funds",
            Self::AuthorizationExpired => "authorization_expired",
            Self::AuthorizationNotYetValid => "authorization_not_yet_valid",
            Self::InvalidAmount { .. } => "invalid_amount",
            Self::RecipientMismatch { .. } => "recipient_mismatch",
            Self::Unexpected { .. } => "unexpected_error",
            Self::Config { .. } => "configuration_error",
            Self::Timeout => "timeout",
            Self::Json(_) => "json_error",
            Self::Http(_) => "http_error",
            Self::Base64(_) => "base64_error",
            Self::Crypto(_) => "crypto_error",
            Self::Io(_) => "io_error",
        }
    }
}

/// Unified error response structure
#[derive(Debug, Clone, serde::Serialize)]
pub struct ErrorResponse {
    /// Error message
    pub error: String,
    /// Error type
    #[serde(rename = "type")]
    pub error_type: String,
    /// HTTP status code
    pub status_code: u16,
    /// Protocol version
    #[serde(rename = "x402Version")]
    pub x402_version: u32,
    /// Additional error details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl ErrorResponse {
    /// Create a new error response from X402Error
    pub fn from_x402_error(error: &X402Error) -> Self {
        Self {
            error: error.to_string(),
            error_type: error.error_type().to_string(),
            status_code: error.status_code(),
            x402_version: 1,
            details: None,
        }
    }

    /// Create a new error response with custom message
    pub fn new(error: impl Into<String>, error_type: impl Into<String>, status_code: u16) -> Self {
        Self {
            error: error.into(),
            error_type: error_type.into(),
            status_code,
            x402_version: 1,
            details: None,
        }
    }

    /// Add error details
    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

impl From<&X402Error> for ErrorResponse {
    fn from(error: &X402Error) -> Self {
        Self::from_x402_error(error)
    }
}

#[cfg(feature = "actix-web")]
impl ResponseError for X402Error {
    fn error_response(&self) -> HttpResponse {
        let error_response = ErrorResponse::from_x402_error(self);
        let status_code = actix_web::http::StatusCode::from_u16(self.status_code())
            .unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR);

        HttpResponse::build(status_code).json(error_response)
    }
}
