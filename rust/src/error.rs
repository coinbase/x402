//! Error types for the x402 library

use thiserror::Error;

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
}
