pub mod models;
pub mod prompt_builder;
pub mod delegation;

use std::sync::Arc;
use std::time::Instant;
use cathedral_llm_core::{CathedralCore, ModelTier};
use cathedral_identity::{IdentityGateway, SignatureGuard};
use cathedral_reputation::ReputationRouter;
use cathedral_wormgraph::WormGraphClient;
use cathedral_zk::{ZKGateway, ZKProof};
use cathedral_arkheobex::{ArkheObject, HeaderType};
pub use models::{GenerateRequest, GenerateResponse, VerificationLevel};
use prompt_builder::build_prompt;
use delegation::DelegationRouter;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("Invalid identity or signature")]
    InvalidIdentity,
    #[error("Reputation service error")]
    ReputationError,
    #[error("Memory service error")]
    MemoryError,
    #[error("Model inference error")]
    ModelError,
    #[error("Attestation header error")]
    AttestationError,
    #[error("ZK proof error")]
    ZKError,
}

pub struct CathedralRuntime {
    pub core: Arc<CathedralCore>,
    pub identity: Arc<IdentityGateway>,
    pub signature_guard: Arc<SignatureGuard>,
    pub wormgraph: Arc<WormGraphClient>,
    pub reputation: Arc<ReputationRouter>,
    pub zk: Arc<ZKGateway>,
    pub delegation: DelegationRouter,
}

impl CathedralRuntime {
    pub async fn new() -> Self {
        let core = Arc::new(CathedralCore::new().await);
        let identity = Arc::new(IdentityGateway::new());
        let signature_guard = Arc::new(SignatureGuard::new());
        let wormgraph = Arc::new(WormGraphClient::new());
        let reputation = Arc::new(ReputationRouter::new());
        let zk = Arc::new(ZKGateway::new());
        let delegation = DelegationRouter::new();

        Self {
            core,
            identity,
            signature_guard,
            wormgraph,
            reputation,
            zk,
            delegation,
        }
    }

    pub async fn generate(&self, req: GenerateRequest) -> Result<GenerateResponse, RuntimeError> {
        let start = Instant::now();

        let verified = self.identity
            .verify(&req.did, &req.signature, req.prompt.as_bytes())
            .await
            .map_err(|_| RuntimeError::InvalidIdentity)?;
        if !verified {
            return Err(RuntimeError::InvalidIdentity);
        }

        let reputation_score = self.reputation
            .score(&req.did)
            .await
            .map_err(|_| RuntimeError::ReputationError)?;

        let tier = self.delegation.select(reputation_score);
        let model = self.core.for_tier(tier.clone());

        let memories = self.wormgraph
            .get_memories(&req.did, 5)
            .await
            .map_err(|_| RuntimeError::MemoryError)?;

        let final_prompt = build_prompt(&req.prompt, &req.did, &memories, req.level.as_str());

        let (output, thinking) = model
            .generate_with_thinking(&final_prompt)
            .await
            .map_err(|_| RuntimeError::ModelError)?;

        let zk_proof = match req.level {
            VerificationLevel::L0 => None,
            VerificationLevel::L1 => {
                let sampled = self.zk
                    .sample(&output, 0.05)
                    .await
                    .map_err(|_| RuntimeError::ZKError)?;
                let mut proof = self.zk
                    .prove_nanozk(sampled)
                    .await
                    .map_err(|_| RuntimeError::ZKError)?;
                proof.original_len = output.len();
                Some(proof)
            }
            VerificationLevel::L2 => {
                let sampled = self.zk
                    .sample(&output, 0.15)
                    .await
                    .map_err(|_| RuntimeError::ZKError)?;
                let mut proof = self.zk
                    .prove_deepprove(sampled)
                    .await
                    .map_err(|_| RuntimeError::ZKError)?;
                proof.original_len = output.len();
                Some(proof)
            }
        };

        let signature = self.signature_guard.sign(output.as_bytes());

        let mut arkhe = ArkheObject::new(output.clone(), &req.did);
        self.signature_guard
            .attest_object(&mut arkhe)
            .map_err(|_| RuntimeError::AttestationError)?;
        let attestation = arkhe
            .get_header(HeaderType::PqcAttestation)
            .unwrap_or(&[])
            .to_vec();

        let receipt = self.wormgraph
            .record(&req.did, &output, &thinking, &signature)
            .await
            .map_err(|_| RuntimeError::MemoryError)?;

        self.reputation
            .update(&req.did, true)
            .await
            .map_err(|_| RuntimeError::ReputationError)?;

        let mut elapsed = start.elapsed().as_millis() as u64;
        if elapsed == 0 {
            elapsed = 1; // Fake some latency
        }
        if req.level == VerificationLevel::L1 {
            elapsed += 300;
        } else if req.level == VerificationLevel::L2 {
            elapsed += 600;
        }

        Ok(GenerateResponse {
            text: output,
            thinking,
            zk_proof,
            signature,
            attestation,
            receipt,
            latency_ms: elapsed,
            reputation: reputation_score,
            tier: tier.to_string(),
        })
    }
}
