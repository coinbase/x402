//! Actix-web integration for x402
//!
//! This module provides integration with the Actix-web framework.

use crate::middleware::PaymentMiddleware;
use crate::types::{PaymentRequirements, PaymentRequirementsResponse};
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
}

/// Create x402 middleware for Actix-web
pub fn create_x402_middleware(payment_middleware: PaymentMiddleware) -> X402Middleware {
    X402Middleware::new(payment_middleware)
}

/// Extract payment requirements from request
fn extract_payment_requirements(_req: &ServiceRequest) -> Result<Option<Vec<PaymentRequirements>>> {
    // This would typically extract from route metadata or configuration
    // For now, return None to indicate no payment required
    Ok(None)
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
    _payment_header: &HeaderValue,
    _requirements: &[PaymentRequirements],
) -> Result<()> {
    // TODO: Implement actual payment verification
    // This would parse the X-PAYMENT header and verify the signature
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
    // For now, just pass through to the next middleware
    // TODO: Implement actual payment verification logic
    next.call(req).await
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
