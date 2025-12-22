use axum::{
    body::Body,
    extract::State,
    http::{Request, Response, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use crate::server::Facilitator;
use crate::types::{PaymentPayload, X402Header, PaymentRequired};
use std::sync::Arc;

#[derive(Clone)]
pub struct X402Config {
    pub facilitator: Arc<Facilitator>,
    pub requirements: PaymentRequired,
}

pub async fn x402_middleware(
    State(config): State<X402Config>,
    req: Request<Body>,
    next: Next,
) -> Response<Body> {
    let signature_header = req.headers()
        .get("PAYMENT-SIGNATURE")
        .and_then(|value| value.to_str().ok());

    match signature_header {
        Some(header_value) => {
            // Decode Payload
            let payload = match PaymentPayload::from_header(header_value) {
                Ok(p) => p,
                Err(_) => return StatusCode::BAD_REQUEST.into_response()
            };

            // Verify with facilitator
            let accepted_requirement = payload.accepted.clone();
            match config.facilitator.verify(payload.clone(), accepted_requirement.clone()).await {
                Ok(verify_result) if verify_result.is_valid => {
                    // Run the route handler
                    let response = next.run(req).await;

                    if response.status().is_success() {
                        let _ = config.facilitator.settle(payload, accepted_requirement).await;
                    }
                    response
                }
                _ => {
                    // Failed to verify signature
                    (StatusCode::PAYMENT_REQUIRED, "Invalid Payment Signature").into_response()
                }
            }
        }
        None => {
            //  No signature provided: Return 402 with the required payment info
            let header_val = config.requirements.to_header().unwrap_or_default();

            Response::builder()
                .status(StatusCode::PAYMENT_REQUIRED)
                .header("PAYMENT-REQUIRED", header_val)
                .body(Body::from("Payment Required"))
                .unwrap()
        }
    }
}