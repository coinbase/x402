use std::sync::Arc;
use alloy::signers::local::PrivateKeySigner;
use async_trait::async_trait;
use axum::Router;
use axum::routing::post;
use x402::errors::X402Result;
use x402::facilitator::FacilitatorClient;
use x402::frameworks::axum_integration::{x402_middleware, X402ConfigBuilder};
use x402::server::SchemeServer;
use x402::types::{AssetAmount, CAIPNetwork, Network, PaymentPayload, PaymentRequirements, Price, SettleResponse, SupportedKind, SupportedResponse, VerifyResponse};


pub fn test_signer() -> PrivateKeySigner {
    PrivateKeySigner::random()
}



#[derive(Debug, Clone)]
pub struct MockFacilitator;

#[async_trait]
impl FacilitatorClient for MockFacilitator {
    async fn verify(
        &self,
        _payload: PaymentPayload,
        _requirements: PaymentRequirements,
    ) -> X402Result<VerifyResponse> {
        Ok(VerifyResponse {
            is_valid: true,
            invalid_reason: None,
            payer: None,
        })
    }

    async fn settle(
        &self,
        _payload: PaymentPayload,
        _requirements: PaymentRequirements,
    ) -> X402Result<SettleResponse> {
        Ok(SettleResponse {
            success: true,
            error_reason: None,
            payer: Some("0xMockPayer".to_string()),
            transaction: Some("0xMockTransaction".to_string()),
            network: "0xMockNetwork".to_string(),
        })
    }

    async fn supported(
        &self,
    ) -> X402Result<SupportedResponse> {
        Ok(SupportedResponse {
            kinds: vec![
                SupportedKind {
                    x402_version: 2,
                    scheme: "exact".to_string(),
                    network: Network::CAIPNetwork(CAIPNetwork::new(
                        "eip155", "84532"
                    )),
                    extra: None,
                },
            ]
        })
    }
}

pub fn build_test_app() -> Router {
    let scheme_server = SchemeServer::new_default();

    // Address to receive payment
    let receiving_address = "0x0000000000000000000000000000000000000001".to_string();

    let usdc_address = "0x0000000000000000000000000000000000000002".to_string();

    let price = Price::AssetAmount(AssetAmount::new(&usdc_address, "1000", None));


    let resource_config = scheme_server.build_resource_config(&receiving_address, price, Some(60));

    let facilitator = Arc::new(MockFacilitator);

    let mut builder = X402ConfigBuilder::new("https://api.example.com", facilitator);
    builder
        .register_scheme(scheme_server.network(), scheme_server)
        .register_resource(
            resource_config,
            "/api/premium",
            Some("Test Resource"),
            None,
        );

    let config = builder.build();

    Router::new()
        .route("/api/premium", post(|| async { "Success" }))
        .layer(axum::middleware::from_fn_with_state(
            config,
            x402_middleware,
        ))
}