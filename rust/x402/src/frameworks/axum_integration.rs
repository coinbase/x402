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
use crate::errors::X402Error;

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
                Err(e) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        format!("Invalid payment header format: {}", e),
                        ).into_response();
                }
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
                Ok(verify_result) => {
                    let reason = verify_result.invalid_reason.unwrap_or_else(|| "Unknown verification error".to_string());
                    (StatusCode::UNAUTHORIZED, format!("Payment verification failed: {}", reason)).into_response()
                }
                Err(X402Error::FacilitatorRejection(code, msg)) => {
                    // Facilitator explicitly said 'No'
                    (StatusCode::from_u16(code).unwrap_or(StatusCode::BAD_REQUEST), msg).into_response()
                }
                Err(e) => {
                    // Failed to verify signature
                    (StatusCode::SERVICE_UNAVAILABLE, format!("Facilitator error: {}", e)).into_response()
                }
            }
        }
        None => {
            //  No signature provided: Return 402 with the required payment info
            match config.requirements.to_header() {
                Ok(header_val) => {
                    Response::builder()
                        .status(StatusCode::PAYMENT_REQUIRED)
                        .header("PAYMENT-REQUIRED", header_val)
                        .body(Body::from("Payment Required"))
                        .unwrap()
                }
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::get, Router};
    use tower::ServiceExt; // for oneshot
    use wiremock::{Mock, MockServer, ResponseTemplate};
    use wiremock::matchers::{method, path};
    use crate::types::PaymentRequirements;
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

    async fn setup_test_app(facilitator_url: &str) -> Router {
        let facilitator = Arc::new(Facilitator::new(facilitator_url));
        let requirements = PaymentRequired {
            x402_version: 1,
            resource: "/test".to_string(),
            accepts: vec![PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum".to_string(),
                pay_to: "0x123".to_string(),
                value: "100".to_string(),
                asset: None,
                data: None,
            }],
            description: None,
            extensions: None,
        };

        let config = X402Config { facilitator, requirements };
        Router::new()
            .route("/test", get(|| async { "Success" }))
            .layer(axum::middleware::from_fn_with_state(config, x402_middleware))
    }

    #[tokio::test]
    async fn test_middleware_returns_402_when_header_missing() {
        let app = setup_test_app("http://localhost:1234").await;
        
        let response = app
            .oneshot(Request::builder().uri("/test").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PAYMENT_REQUIRED);
        assert!(response.headers().contains_key("PAYMENT-REQUIRED"));
    }

    #[tokio::test]
    async fn test_middleware_handles_facilitator_rejection() {
        let mock_server = MockServer::start().await;
        
        // Mock a 403 Forbidden from the facilitator
        Mock::given(method("POST"))
            .and(path("/verify"))
            .respond_with(ResponseTemplate::new(403).set_body_string("Insufficient Balance"))
            .mount(&mock_server)
            .await;

        let app = setup_test_app(&mock_server.uri()).await;

        // Create a fake valid-looking header
        let payload = PaymentPayload {
            x402_version: 1,
            resource: "/test".to_string(),
            accepted: PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum".to_string(),
                pay_to: "0x123".to_string(),
                value: "100".to_string(),
                asset: None,
                data: None,
            },
            signature: "0xabc".to_string(),
            extensions: None,
        };
        let header_val = payload.to_header().unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/test")
                    .header("PAYMENT-SIGNATURE", header_val)
                    .body(Body::empty())
                    .unwrap()
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let body = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(body, "Insufficient Balance");
    }


    #[tokio::test]
    async fn test_middleware_handles_facilitator_not_available() {

        // Point to a port that is definitely not listening
        let app = setup_test_app("http://127.0.0.1:1").await;

        // Create a fake valid-looking header
        let payload = PaymentPayload {
            x402_version: 1,
            resource: "/test".to_string(),
            accepted: PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum".to_string(),
                pay_to: "0x123".to_string(),
                value: "100".to_string(),
                asset: None,
                data: None,
            },
            signature: "0xabc".to_string(),
            extensions: None,
        };
        let header_val = payload.to_header().unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/test")
                    .header("PAYMENT-SIGNATURE", header_val)
                    .body(Body::empty())
                    .unwrap()
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body_bytes = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
        let body_str = String::from_utf8_lossy(&body_bytes);
        // This will contain the reqwest error message
        assert!(body_str.contains("Facilitator error"));
    }
}