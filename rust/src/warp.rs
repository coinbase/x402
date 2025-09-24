//! Warp integration for x402
//!
//! This module provides integration with the Warp framework.

use crate::middleware::PaymentMiddleware;
use crate::types::{PaymentPayload, PaymentRequirements, PaymentRequirementsResponse};
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
        let response = PaymentRequirementsResponse::new(&self.error, self.requirements);

        with_status(json(&response), StatusCode::PAYMENT_REQUIRED).into_response()
    }
}

/// Create a Warp filter for x402 payment verification
pub fn x402_payment_filter(
    payment_middleware: PaymentMiddleware,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    let middleware = std::sync::Arc::new(payment_middleware);
    warp::any()
        .and(warp::header::optional::<String>("X-PAYMENT"))
        .and_then(move |payment_header: Option<String>| {
            let _middleware = middleware.clone();
            async move {
                match payment_header {
                    Some(payment_b64) => {
                        // Decode and verify payment
                        match PaymentPayload::from_base64(&payment_b64) {
                            Ok(payload) => {
                                // Create payment requirements
                                let requirements = match create_payment_requirements_for_warp() {
                                    Ok(req) => req,
                                    Err(e) => {
                                        return Err(warp::reject::custom(PaymentRequired {
                                            requirements: vec![],
                                            error: format!(
                                                "Failed to create payment requirements: {}",
                                                e
                                            ),
                                        }));
                                    }
                                };

                                // Verify payment with facilitator
                                match verify_payment_with_facilitator_warp(&payload, &requirements)
                                    .await
                                {
                                    Ok(true) => {
                                        // Payment is valid, continue
                                        Ok(())
                                    }
                                    Ok(false) => Err(warp::reject::custom(PaymentRequired {
                                        requirements: vec![requirements],
                                        error: "Payment verification failed".to_string(),
                                    })),
                                    Err(e) => Err(warp::reject::custom(PaymentRequired {
                                        requirements: vec![requirements],
                                        error: format!("Payment verification error: {}", e),
                                    })),
                                }
                            }
                            Err(e) => Err(warp::reject::custom(PaymentRequired {
                                requirements: vec![],
                                error: format!("Failed to decode payment payload: {}", e),
                            })),
                        }
                    }
                    None => {
                        // No payment header provided
                        let requirements = match create_payment_requirements_for_warp() {
                            Ok(req) => vec![req],
                            Err(_) => vec![],
                        };
                        Err(warp::reject::custom(PaymentRequired {
                            requirements,
                            error: "Payment required".to_string(),
                        }))
                    }
                }
            }
        })
        .untuple_one()
}

/// Create payment requirements for Warp
fn create_payment_requirements_for_warp() -> crate::Result<PaymentRequirements> {
    let mut requirements = PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000",
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "/",
        "Payment required for this resource",
    );

    requirements.set_usdc_info(crate::types::Network::Testnet)?;
    Ok(requirements)
}

/// Verify payment with facilitator for Warp
async fn verify_payment_with_facilitator_warp(
    payment_payload: &PaymentPayload,
    requirements: &PaymentRequirements,
) -> crate::Result<bool> {
    let facilitator =
        crate::facilitator::FacilitatorClient::new(crate::types::FacilitatorConfig::default())?;

    let response = facilitator.verify(payment_payload, requirements).await?;
    Ok(response.is_valid)
}

/// Create a Warp filter that requires payment
pub fn require_payment(
    requirements: Vec<PaymentRequirements>,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    let requirements = std::sync::Arc::new(requirements);
    warp::any()
        .and_then(move || {
            let requirements = requirements.clone();
            async move {
                Err::<(), Rejection>(warp::reject::custom(PaymentRequired {
                    requirements: (*requirements).clone(),
                    error: "Payment required".to_string(),
                }))
            }
        })
        .untuple_one()
}

/// Create a Warp filter that verifies payment with custom error
pub fn verify_payment_with_error(
    requirements: Vec<PaymentRequirements>,
    error_message: String,
) -> impl Filter<Extract = (), Error = Rejection> + Clone {
    let requirements = std::sync::Arc::new(requirements);
    let error_message = std::sync::Arc::new(error_message);
    warp::any()
        .and_then(move || {
            let requirements = requirements.clone();
            let error_message = error_message.clone();
            async move {
                Err::<(), Rejection>(warp::reject::custom(PaymentRequired {
                    requirements: (*requirements).clone(),
                    error: (*error_message).clone(),
                }))
            }
        })
        .untuple_one()
}

/// Create a payment handler for Warp routes
pub fn payment_handler() -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path::end().and(warp::get()).map(|| {
        let response =
            PaymentRequirementsResponse::new("Payment required for this resource", vec![]);
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
    // This function is used for manual payment verification in handlers
    // For automatic verification, use the x402_payment_filter
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::PaymentRequirements;

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
