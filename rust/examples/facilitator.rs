//! Example facilitator implementation

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing_subscriber;

use rand::Rng;
use x402::{types::*, Result, X402Error};

/// Simple in-memory facilitator for demonstration
#[derive(Debug, Clone)]
struct SimpleFacilitator {
    /// Track processed nonces to prevent replay attacks
    processed_nonces: Arc<RwLock<HashMap<String, bool>>>,
}

impl SimpleFacilitator {
    fn new() -> Self {
        Self {
            processed_nonces: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Verify a payment payload
    async fn verify_payment(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
    ) -> Result<VerifyResponse> {
        // Check if nonce has been used before (replay protection)
        let nonce = &payload.payload.authorization.nonce;
        {
            let nonces = self.processed_nonces.write().await;
            if nonces.contains_key(nonce) {
                return Ok(VerifyResponse {
                    is_valid: false,
                    invalid_reason: Some("nonce_already_used".to_string()),
                    payer: Some(payload.payload.authorization.from.clone()),
                });
            }
        }

        // Verify authorization timing
        if !payload.payload.authorization.is_valid_now()? {
            return Ok(VerifyResponse {
                is_valid: false,
                invalid_reason: Some("authorization_expired".to_string()),
                payer: Some(payload.payload.authorization.from.clone()),
            });
        }

        // Verify amount meets requirements
        let payment_amount: u128 = payload
            .payload
            .authorization
            .value
            .parse()
            .map_err(|_| X402Error::invalid_payment_requirements("Invalid payment amount"))?;
        let required_amount: u128 = requirements
            .max_amount_required
            .parse()
            .map_err(|_| X402Error::invalid_payment_requirements("Invalid required amount"))?;

        if payment_amount < required_amount {
            return Ok(VerifyResponse {
                is_valid: false,
                invalid_reason: Some("insufficient_amount".to_string()),
                payer: Some(payload.payload.authorization.from.clone()),
            });
        }

        // Verify recipient matches
        if payload.payload.authorization.to != requirements.pay_to {
            return Ok(VerifyResponse {
                is_valid: false,
                invalid_reason: Some("recipient_mismatch".to_string()),
                payer: Some(payload.payload.authorization.from.clone()),
            });
        }

        // Mark nonce as processed
        {
            let mut nonces = self.processed_nonces.write().await;
            nonces.insert(nonce.clone(), true);
        }

        Ok(VerifyResponse {
            is_valid: true,
            invalid_reason: None,
            payer: Some(payload.payload.authorization.from.clone()),
        })
    }

    /// Settle a verified payment
    async fn settle_payment(
        &self,
        payload: &PaymentPayload,
        _requirements: &PaymentRequirements,
    ) -> Result<SettleResponse> {
        // In a real implementation, this would:
        // 1. Call the blockchain to execute the transfer
        // 2. Wait for transaction confirmation
        // 3. Return the transaction hash
        // 4. Handle gas estimation and transaction fees
        // 5. Implement retry logic for failed transactions

        // For this example, we'll simulate a realistic settlement process
        use x402::crypto::signature;

        // Generate a more realistic transaction hash (64 hex characters)
        let mut rng = rand::thread_rng();
        let tx_hash_bytes: [u8; 32] = rng.gen();
        let mock_transaction_hash = format!("0x{}", hex::encode(tx_hash_bytes));

        // Simulate network delay (in real implementation, this would be blockchain confirmation time)
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // In production, you would verify the transaction was actually mined
        // and check its status on the blockchain

        Ok(SettleResponse {
            success: true,
            error_reason: None,
            transaction: mock_transaction_hash,
            network: payload.network.clone(),
            payer: Some(payload.payload.authorization.from.clone()),
        })
    }
}

/// Request types for the facilitator API
#[derive(Debug, Deserialize)]
struct VerifyRequest {
    x402_version: u32,
    payment_payload: PaymentPayload,
    payment_requirements: PaymentRequirements,
}

#[derive(Debug, Deserialize)]
struct SettleRequest {
    x402_version: u32,
    payment_payload: PaymentPayload,
    payment_requirements: PaymentRequirements,
}

/// Supported networks query
#[derive(Debug, Deserialize)]
struct SupportedQuery {
    #[serde(default)]
    _format: Option<String>,
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Create facilitator instance
    let facilitator = SimpleFacilitator::new();

    // Create the API routes
    let app = Router::new()
        .route("/verify", post(verify_handler))
        .route("/settle", post(settle_handler))
        .route("/supported", get(supported_handler))
        .with_state(facilitator);

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    println!("🔧 Facilitator server running on http://0.0.0.0:3000");
    println!("📋 Available endpoints:");
    println!("   POST /verify - Verify payment authorization");
    println!("   POST /settle - Settle verified payment");
    println!("   GET /supported - Get supported payment schemes");

    axum::serve(listener, app).await?;

    Ok(())
}

/// Handle payment verification requests
async fn verify_handler(
    State(facilitator): State<SimpleFacilitator>,
    Json(request): Json<VerifyRequest>,
) -> std::result::Result<Json<VerifyResponse>, StatusCode> {
    if request.x402_version != X402_VERSION {
        return Err(StatusCode::BAD_REQUEST);
    }

    match facilitator
        .verify_payment(&request.payment_payload, &request.payment_requirements)
        .await
    {
        Ok(response) => Ok(Json(response)),
        Err(e) => {
            eprintln!("Verification error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Handle payment settlement requests
async fn settle_handler(
    State(facilitator): State<SimpleFacilitator>,
    Json(request): Json<SettleRequest>,
) -> std::result::Result<Json<SettleResponse>, StatusCode> {
    if request.x402_version != X402_VERSION {
        return Err(StatusCode::BAD_REQUEST);
    }

    match facilitator
        .settle_payment(&request.payment_payload, &request.payment_requirements)
        .await
    {
        Ok(response) => Ok(Json(response)),
        Err(e) => {
            eprintln!("Settlement error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Handle supported payment schemes requests
async fn supported_handler(Query(_query): Query<SupportedQuery>) -> Json<SupportedKinds> {
    Json(SupportedKinds {
        kinds: vec![
            SupportedKind {
                x402_version: X402_VERSION,
                scheme: schemes::EXACT.to_string(),
                network: networks::BASE_SEPOLIA.to_string(),
            },
            SupportedKind {
                x402_version: X402_VERSION,
                scheme: schemes::EXACT.to_string(),
                network: networks::BASE_MAINNET.to_string(),
            },
            SupportedKind {
                x402_version: X402_VERSION,
                scheme: schemes::EXACT.to_string(),
                network: networks::AVALANCHE_FUJI.to_string(),
            },
            SupportedKind {
                x402_version: X402_VERSION,
                scheme: schemes::EXACT.to_string(),
                network: networks::AVALANCHE_MAINNET.to_string(),
            },
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_facilitator_creation() {
        let facilitator = SimpleFacilitator::new();
        assert!(facilitator.processed_nonces.read().await.is_empty());
    }

    #[tokio::test]
    async fn test_verify_payment() {
        let facilitator = SimpleFacilitator::new();

        let authorization = ExactEvmPayloadAuthorization::new(
            "0x857b06519E91e3A54538791bDbb0E22373e36b66",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "10000",
            chrono::Utc::now().timestamp().to_string(),
            (chrono::Utc::now().timestamp() + 300).to_string(),
            "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
        );

        let payload = PaymentPayload::new(
            schemes::EXACT,
            networks::BASE_SEPOLIA,
            ExactEvmPayload {
                signature: "0x".to_string(),
                authorization,
            },
        );

        let requirements = PaymentRequirements::new(
            schemes::EXACT,
            networks::BASE_SEPOLIA,
            "10000",
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "https://example.com/test",
            "Test payment",
        );

        let response = facilitator
            .verify_payment(&payload, &requirements)
            .await
            .unwrap();
        assert!(response.is_valid);
        assert_eq!(
            response.payer,
            Some("0x857b06519E91e3A54538791bDbb0E22373e36b66".to_string())
        );
    }
}
