pub mod reputation_circuit;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum PhysicalConstraintType {
    SafetyFactor,
    Toxicity,
    Weight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZkProof {
    pub proof_bytes: Vec<u8>,
    pub public_inputs: Vec<u64>,
    pub circuit_id: String,
    pub verification_key_hash: String,
}

pub trait ZkBackend: Send + Sync {
    fn generate_proof(&self, constraint_type: PhysicalConstraintType, design_hash: &str, parameters: &serde_json::Value) -> Result<ZkProof>;
    fn verify_proof(&self, proof: &ZkProof) -> Result<bool>;
}

pub struct PhysicalConstraintProofGenerator<'a> {
    backend: Box<&'a dyn ZkBackend>,
}

impl<'a> PhysicalConstraintProofGenerator<'a> {
    pub fn new(backend: Box<&'a dyn ZkBackend>) -> Self {
        Self { backend }
    }

    pub fn generate_proof(&self, constraint_type: PhysicalConstraintType, design_hash: &str, parameters: &serde_json::Value) -> Result<ZkProof> {
        self.backend.generate_proof(constraint_type, design_hash, parameters)
    }
}
