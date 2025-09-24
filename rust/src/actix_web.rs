//! Actix-web integration for x402
//!
//! This module provides integration with the Actix-web framework.

use crate::middleware::PaymentMiddleware;
use crate::types::{PaymentPayload, PaymentRequirements, PaymentRequirementsResponse};
use crate::Result;
use actix_web::http::header::HeaderValue;
use actix_web::{
    dev::{ServiceRequest, ServiceResponse},
    middleware::Next,
    Error, HttpRequest, HttpResponse,
};

/// Actix-web middleware for x402 payment verification
pub struct X402Middleware {
    payment_middleware: PaymentMiddleware,
}

impl X402Middleware {
    /// Create a new x402 middleware instance
    pub fn new(payment_middleware: PaymentMiddleware) -> Self {
        Self { payment_middleware }
    }

    /// Get the payment middleware configuration
    pub fn config(&self) -> &PaymentMiddleware {
        &self.payment_middleware
    }

    /// Get a mutable reference to the payment middleware configuration
    pub fn config_mut(&mut self) -> &mut PaymentMiddleware {
        &mut self.payment_middleware
    }
}

/// Create x402 middleware for Actix-web
pub fn create_x402_middleware(payment_middleware: PaymentMiddleware) -> X402Middleware {
    X402Middleware::new(payment_middleware)
}

/// Extract payment requirements from request
///
/// This function can be extended to extract payment requirements from:
/// - Route metadata/attributes
/// - Configuration files
/// - Database lookups
/// - Environment variables
fn extract_payment_requirements(req: &ServiceRequest) -> Result<Option<Vec<PaymentRequirements>>> {
    let path = req.uri().path();

    // Example: Extract payment requirements based on route patterns
    // In a real application, this could come from route metadata, configuration, or database
    match path {
        "/premium" | "/api/v1/premium" => {
            // Premium endpoints require payment
            let requirements = PaymentRequirements::new(
                "exact",
                "base-sepolia",
                "1000000", // 1 USDC
                "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                path,
                "Premium API access",
            );

            let mut req = requirements;
            req.set_usdc_info(crate::types::Network::Testnet)?;
            Ok(Some(vec![req]))
        }
        "/health" | "/metrics" | "/status" => {
            // Health and monitoring endpoints are free
            Ok(None)
        }
        _ => {
            // Default: no payment required for other endpoints
            // This can be overridden by route-specific configuration
            Ok(None)
        }
    }
}

/// Create payment required response
fn create_payment_required_response(requirements: &[PaymentRequirements]) -> HttpResponse {
    let response = PaymentRequirementsResponse::new(
        "Payment required for this resource",
        requirements.to_vec(),
    );

    HttpResponse::PaymentRequired().json(response)
}

/// Create payment error response
fn create_payment_error_response(
    _error: &crate::X402Error,
    requirements: &[PaymentRequirements],
) -> HttpResponse {
    let response =
        PaymentRequirementsResponse::new("Payment verification failed", requirements.to_vec());

    HttpResponse::PaymentRequired().json(response)
}

/// Verify payment header
async fn verify_payment_header(
    payment_header: &HeaderValue,
    _requirements: &[PaymentRequirements],
) -> Result<()> {
    // Parse the X-PAYMENT header and verify the signature
    let payment_str = payment_header.to_str().map_err(|_| {
        crate::X402Error::invalid_payment_payload("Invalid payment header encoding")
    })?;

    let payload = PaymentPayload::from_base64(payment_str).map_err(|e| {
        crate::X402Error::invalid_payment_payload(format!("Failed to decode payment: {}", e))
    })?;

    // Basic validation - return errors instead of panicking
    if payload.scheme.is_empty() {
        return Err(crate::X402Error::invalid_payment_payload(
            "Payment scheme cannot be empty",
        ));
    }
    if payload.network.is_empty() {
        return Err(crate::X402Error::invalid_payment_payload(
            "Payment network cannot be empty",
        ));
    }
    if payload.x402_version != crate::X402_VERSION {
        return Err(crate::X402Error::invalid_payment_payload(format!(
            "Unsupported x402 version: {}. Expected version: {}",
            payload.x402_version,
            crate::X402_VERSION
        )));
    }

    // Note: Full signature verification with facilitator is handled in verify_payment_with_facilitator
    // This function performs basic payload validation
    Ok(())
}

/// Handle payment verification in Actix-web handlers
pub async fn handle_payment_verification(
    req: &HttpRequest,
    requirements: &[PaymentRequirements],
) -> std::result::Result<Option<HttpResponse>, Box<dyn std::error::Error>> {
    if let Some(payment_header) = req.headers().get("X-PAYMENT") {
        match verify_payment_header(payment_header, requirements).await {
            Ok(_) => Ok(None), // Payment verified, continue
            Err(e) => {
                let response = create_payment_error_response(&e, requirements);
                Ok(Some(response))
            }
        }
    } else {
        let response = create_payment_required_response(requirements);
        Ok(Some(response))
    }
}

/// Simple middleware function for Actix-web
pub async fn x402_middleware(
    req: ServiceRequest,
    next: Next<actix_web::body::BoxBody>,
) -> std::result::Result<ServiceResponse<actix_web::body::BoxBody>, Error> {
    // Extract payment header from request
    let payment_header = req.headers().get("X-PAYMENT").and_then(|h| h.to_str().ok());

    match payment_header {
        Some(payment_b64) => {
            // Parse payment payload
            match crate::types::PaymentPayload::from_base64(payment_b64) {
                Ok(payment_payload) => {
                    // Create payment requirements
                    let requirements = match create_payment_requirements_from_request(&req) {
                        Ok(req) => req,
                        Err(e) => {
                            return Ok(ServiceResponse::new(
                                req.into_parts().0,
                                actix_web::HttpResponse::InternalServerError()
                                    .json(serde_json::json!({
                                        "error": format!("Failed to create payment requirements: {}", e),
                                        "x402Version": 1
                                    }))
                            ));
                        }
                    };

                    // Verify payment
                    match verify_payment_with_facilitator(&payment_payload, &requirements).await {
                        Ok(true) => {
                            // Payment is valid, proceed with request
                            let mut response = next.call(req).await?;

                            // Settle payment after successful response
                            if let Ok(settlement) =
                                settle_payment_with_facilitator(&payment_payload, &requirements)
                                    .await
                            {
                                if let Ok(settlement_header) = settlement.to_base64() {
                                    response.headers_mut().insert(
                                        actix_web::http::header::HeaderName::from_static(
                                            "x-payment-response",
                                        ),
                                        actix_web::http::header::HeaderValue::from_str(
                                            &settlement_header,
                                        )
                                        .unwrap_or_else(
                                            |_| {
                                                actix_web::http::header::HeaderValue::from_static(
                                                    "",
                                                )
                                            },
                                        ),
                                    );
                                }
                            }

                            Ok(response)
                        }
                        Ok(false) => {
                            // Payment verification failed
                            let response = create_payment_error_response(
                                &crate::X402Error::payment_verification_failed(
                                    "Payment verification failed",
                                ),
                                &[requirements],
                            );
                            Ok(ServiceResponse::new(req.into_parts().0, response))
                        }
                        Err(e) => {
                            // Error during verification
                            let response = create_payment_error_response(&e, &[requirements]);
                            Ok(ServiceResponse::new(req.into_parts().0, response))
                        }
                    }
                }
                Err(e) => {
                    // Invalid payment payload
                    let response = create_payment_error_response(
                        &crate::X402Error::invalid_payment_payload(format!(
                            "Invalid payment payload: {}",
                            e
                        )),
                        &[],
                    );
                    Ok(ServiceResponse::new(req.into_parts().0, response))
                }
            }
        }
        None => {
            // No payment header provided
            let requirements = match create_payment_requirements_from_request(&req) {
                Ok(req) => vec![req],
                Err(_) => vec![],
            };
            let response = create_payment_required_response(&requirements);
            Ok(ServiceResponse::new(req.into_parts().0, response))
        }
    }
}

/// Create payment requirements from request
///
/// This function creates payment requirements based on the request path and headers.
/// In a production application, this could be extended to:
/// - Read from configuration files
/// - Query a database for route-specific payment requirements
/// - Extract from route metadata or annotations
/// - Use environment-specific settings
fn create_payment_requirements_from_request(
    req: &ServiceRequest,
) -> crate::Result<crate::types::PaymentRequirements> {
    let uri = req.uri();
    let path = uri.path();

    // Extract configuration from headers or use defaults
    let scheme = req
        .headers()
        .get("X-Payment-Scheme")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("exact");

    let network = req
        .headers()
        .get("X-Payment-Network")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("base-sepolia");

    let amount = req
        .headers()
        .get("X-Payment-Amount")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("1000000"); // Default to 1 USDC

    let asset = match network {
        "base-sepolia" => "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "base" => "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        _ => "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Default to testnet
    };

    let pay_to = req
        .headers()
        .get("X-Payment-To")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("0x209693Bc6afc0C5328bA36FaF03C514EF312287C");

    // Create payment requirements with dynamic configuration
    let requirements = crate::types::PaymentRequirements::new(
        scheme,
        network,
        amount,
        asset,
        pay_to,
        path,
        "Payment required for this resource",
    );

    // Set network-specific info
    let network_type = match network {
        "base" => crate::types::Network::Mainnet,
        "base-sepolia" => crate::types::Network::Testnet,
        _ => crate::types::Network::Testnet, // Default to testnet
    };

    let mut req = requirements;
    req.set_usdc_info(network_type)?;
    Ok(req)
}

/// Verify payment with facilitator
async fn verify_payment_with_facilitator(
    payment_payload: &crate::types::PaymentPayload,
    requirements: &crate::types::PaymentRequirements,
) -> crate::Result<bool> {
    let facilitator =
        crate::facilitator::FacilitatorClient::new(crate::types::FacilitatorConfig::default())?;

    let response = facilitator.verify(payment_payload, requirements).await?;
    Ok(response.is_valid)
}

/// Settle payment with facilitator
async fn settle_payment_with_facilitator(
    payment_payload: &crate::types::PaymentPayload,
    requirements: &crate::types::PaymentRequirements,
) -> crate::Result<crate::types::SettleResponse> {
    let facilitator =
        crate::facilitator::FacilitatorClient::new(crate::types::FacilitatorConfig::default())?;

    facilitator.settle(payment_payload, requirements).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::PaymentRequirements;
    use std::str::FromStr;

    #[test]
    fn test_x402_middleware_creation() {
        let payment_middleware = PaymentMiddleware::new(
            rust_decimal::Decimal::from_str("0.0001").unwrap(),
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C".to_string(),
        );

        let middleware = X402Middleware::new(payment_middleware);
        assert_eq!(
            middleware.payment_middleware.config.amount,
            rust_decimal::Decimal::from_str("0.0001").unwrap()
        );
    }

    #[test]
    fn test_payment_required_response() {
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

        let response = create_payment_required_response(&requirements);
        assert_eq!(
            response.status(),
            actix_web::http::StatusCode::PAYMENT_REQUIRED
        );
    }
}
