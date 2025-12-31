use std::collections::HashMap;
use axum::{
    body::Body,
    extract::State,
    http::{Request, Response, StatusCode},
    middleware::Next,
    response::IntoResponse,
};

use crate::types::{PaymentPayload, X402Header, PaymentRequired, Network};
use std::sync::Arc;
use crate::errors::{X402Error, X402Result};
use crate::facilitator::FacilitatorClient;
use crate::server::{InMemoryResourceServer, ResourceConfig, ResourceServer, SchemeNetworkServer};


#[derive(Clone)]
pub struct RouteMeta {
    pub resource_url: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
    pub resource_config: ResourceConfig,
}

#[derive(Clone)]
pub struct X402Config {
    pub facilitator: Arc<dyn FacilitatorClient>,
    pub resource_server: Arc<InMemoryResourceServer>,
    pub routes: Arc<HashMap<String, RouteMeta>>
}

pub struct X402ConfigBuilder {
    facilitator: Arc<dyn FacilitatorClient>,
    resource_server: InMemoryResourceServer,
    routes: HashMap<String, RouteMeta>,
}

impl X402ConfigBuilder {
    pub fn new(facilitator: Arc<dyn FacilitatorClient>) -> Self {
        Self {
            facilitator,
            resource_server: InMemoryResourceServer::new(),
            routes: HashMap::new(),
        }
    }

    pub fn register_scheme(
        &mut self,
        network: Network,
        server: Arc<dyn SchemeNetworkServer>,
    ) -> &mut Self {
        self.resource_server.register_scheme(network, server);
        self
    }

    pub fn register_resource(
        &mut self,
        resource_config: ResourceConfig,
        resource_url: String,
        description: Option<String>,
        mime_type: Option<String>,
    ) -> &mut Self {
        let meta = RouteMeta {
            resource_url: resource_url.clone(),
            description,
            mime_type,
            resource_config,
        };
        self.routes.insert(resource_url, meta);
        self
    }

    pub fn build(self) -> X402Config {
        X402Config {
            facilitator: self.facilitator,
            resource_server: Arc::new(self.resource_server),
            routes: Arc::new(self.routes),
        }
    }
}


pub async fn x402_middleware(
    State(config): State<X402Config>,
    req: Request<Body>,
    next: Next,
) -> Response<Body> {

    // Configuration
    let path = req.uri().path();

    let route = match config.routes.get(path) {
        Some(route) => route,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Route not registered: {}. Please register this resource in the X402Config before passing it to the middleware layer.", path),
            ).into_response();
        }
    };

    // Build the payment requirements we have registered in the resource server
    let accepts = match config.resource_server.build_payment_requirements(&route.resource_config) {
        Ok(payment_required) => payment_required,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to build payment requirements for route {}: {}", path, e),
            ).into_response();
        }
    };

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


            let client_req = &payload.accepted;

            // Ensure the client-chosen requirement matches one of our 'accepts'.
            let matched_req = accepts.iter().find(|server_req| {
                server_req.scheme == client_req.scheme
                    && server_req.network == client_req.network
                    && server_req.pay_to == client_req.pay_to
                    && server_req.amount == client_req.amount
                    && server_req.asset == client_req.asset
            });


            // Verify with facilitator
            let accepted_requirement = match matched_req.cloned() {
                Some(requirement) => requirement,
                None => {
                    return (
                        StatusCode::UNAUTHORIZED,
                        format!("Client-chosen requirement does not match any of the accepted requirements for route: {}", path),
                    ).into_response();
                }
            };

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
            let payment_required = PaymentRequired {
                x402_version: 2,
                resource: route.resource_url.clone(),
                accepts,
                description: route.description.clone(),
                extensions: None,
            };

            match payment_required.to_header() {
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
    use wiremock::matchers::method;
    use crate::types::{PaymentRequirements, Resource, VerifyResponse};
    use serde_json::json;
    use crate::facilitator::HttpFacilitator;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };

    struct MockSchemeServer;

    impl SchemeNetworkServer for MockSchemeServer {
        fn scheme(&self) -> &str {
            "exact"
        }

        fn build_requirements(
            &self,
            resource_config: &ResourceConfig,
        ) -> X402Result<PaymentRequirements> {
            let (amount, asset) = resource_config.price.to_asset_amount();
            Ok(PaymentRequirements {
                scheme: self.scheme().to_owned(),
                network: resource_config.network.to_string(),
                pay_to: resource_config.pay_to.clone(),
                amount,
                asset,
                data: None,
                extra: None,
            })
        }
    }

    async fn setup_test_app(facilitator_url: &str) -> Router {
        let facilitator: Arc<dyn FacilitatorClient> = Arc::new(HttpFacilitator::new(facilitator_url));

        let network = Network::new("ethereum".to_string(), "1".to_string());
        let resource_config = ResourceConfig::new(
            "exact",
            "0x123",
            "100".into(),
            network.clone(),
            None,
        );

        // Create a config builder
        let mut builder = X402ConfigBuilder::new(facilitator);

        builder
            // Register a scheme to our config
            .register_scheme(network, Arc::new(MockSchemeServer))
            // register a resource (a route)
            .register_resource(resource_config, "/test".to_string(), None, None);
        // finalize the config
        let config = builder.build();

        Router::new()
            .route("/test", get(|| async { "Success" }))
            .layer(axum::middleware::from_fn_with_state(config, x402_middleware))
    }

    #[tokio::test]
    async fn test_middleware_accepts_proper_payment_header() {
        let mock_server = MockServer::start().await;

        // Mock a 200 OK from the facilitator
        let mock_verify_response = VerifyResponse {
            is_valid: true,
            invalid_reason: None,
            payer: Some("0xabc".to_string()),
        };

        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(mock_verify_response))
            .mount(&mock_server)
            .await;

        let app = setup_test_app(&mock_server.uri()).await;

        // Create a fake valid-looking header
        let payload = PaymentPayload {
            x402_version: 1,
            resource: Resource {
                url: "/test".to_string(),
                description: "Test".to_string(),
                mime_type: "text/plain".to_string(),
            },
            accepted: PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum:1".to_string(),
                pay_to: "0x123".to_string(),
                amount: "100".to_string(),
                asset: None,
                data: None,
                extra: None,
            },
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
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

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(body, "Success");
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
            .respond_with(ResponseTemplate::new(403).set_body_string("Insufficient Balance"))
            .mount(&mock_server)
            .await;

        let app = setup_test_app(&mock_server.uri()).await;

        // Create a fake valid-looking header
        let payload = PaymentPayload {
            x402_version: 1,
            resource: Resource {
                url: "/test".to_string(),
                description: "Test".to_string(),
                mime_type: "text/plain".to_string(),
            },
            accepted: PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum:1".to_string(),
                pay_to: "0x123".to_string(),
                amount: "100".to_string(),
                asset: None,
                data: None,
                extra: None,
            },
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
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
            resource: Resource {
                url: "/test".to_string(),
                description: "Test".to_string(),
                mime_type: "text/plain".to_string(),
            },
            accepted: PaymentRequirements {
                scheme: "exact".to_string(),
                network: "ethereum:1".to_string(),
                pay_to: "0x123".to_string(),
                amount: "100".to_string(),
                asset: None,
                data: None,
                extra: None,
            },
            payload: json!({"signature": "<SIG_PLACEHOLDER>"}),
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