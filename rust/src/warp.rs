//! Warp integration for x402
//!
//! This module provides integration with the Warp framework.

use crate::middleware::PaymentMiddleware;
use crate::types::{PaymentRequirements, PaymentRequirementsResponse};
use warp::{
    http::StatusCode,
    reject::{Reject, Rejection},
    reply::{json, with_status},
    Filter, Reply,
};

/// Custom rejection for payment required
#[derive(Debug)]
pub struct PaymentRequired {
    pub requirements: Vec<PaymentRequirements>,
    pub error: String,
}

impl Reject for PaymentRequired {}

impl Reply for PaymentRequired {
    fn into_response(self) -> warp::reply::Response {
        let response = PaymentRequirementsResponse::new(
            &self.error,
            self.requirements,
        );
        
        with_status(
            json(&response),
            StatusCode::PAYMENT_REQUIRED,
        )
        .into_response()
    }
}

/// Create a Warp filter for x402 payment verification
pub fn x402_payment_filter(
    _payment_middleware: PaymentMiddleware,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    warp::any().map(|| ())
}

/// Create a Warp filter that requires payment
pub fn require_payment(
    requirements: Vec<PaymentRequirements>,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    warp::any().and_then(move || async move {
        Err::<(), Rejection>(warp::reject::custom(PaymentRequired {
            requirements: requirements.clone(),
            error: "Payment required".to_string(),
        }))
    })
}

/// Create a Warp filter that verifies payment with custom error
pub fn verify_payment_with_error(
    requirements: Vec<PaymentRequirements>,
    error_message: String,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    warp::any().and_then(move || async move {
        Err::<(), Rejection>(warp::reject::custom(PaymentRequired {
            requirements: requirements.clone(),
            error: error_message.clone(),
        }))
    })
}

/// Create a payment handler for Warp routes
pub fn payment_handler() -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path::end()
        .and(warp::get())
        .map(|| {
            let response = PaymentRequirementsResponse::new(
                "Payment required for this resource",
                vec![],
            );
            with_status(json(&response), StatusCode::PAYMENT_REQUIRED)
        })
}

/// Create x402 middleware for Warp
pub fn create_x402_middleware(
    payment_middleware: PaymentMiddleware,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    x402_payment_filter(payment_middleware)
}

/// Handle payment verification in Warp handlers
pub async fn handle_payment_verification(
    _requirements: &[PaymentRequirements],
) -> std::result::Result<Option<warp::reply::Response>, Box<dyn std::error::Error>> {
    // TODO: Implement actual payment verification
    // This would check for X-PAYMENT header and verify the signature
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::PaymentRequirements;
    use std::str::FromStr;

    #[test]
    fn test_payment_required_rejection() {
        let requirements = vec![PaymentRequirements {
            scheme: "exact".to_string(),
            network: "base-sepolia".to_string(),
            max_amount_required: "1000000".to_string(),
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(),
            pay_to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
            resource: "/test".to_string(),
            description: "Test payment".to_string(),
            mime_type: Some("application/json".to_string()),
            max_timeout_seconds: 300,
            output_schema: None,
            extra: None,
        }];

        let rejection = PaymentRequired {
            requirements: requirements.clone(),
            error: "Test error".to_string(),
        };

        assert_eq!(rejection.requirements.len(), 1);
        assert_eq!(rejection.error, "Test error");
    }

    #[test]
    fn test_payment_handler() {
        let _handler = payment_handler();
        // This is a basic test to ensure the handler compiles
        assert!(true);
    }
}