use anyhow::Result;
use arkhe_zk_circuits::{ZkBackend, ZkProof, PhysicalConstraintType};

pub struct Risc0Backend;
impl Risc0Backend {
    pub fn new() -> Result<Self> { Ok(Self) }
}

impl ZkBackend for Risc0Backend {
    fn generate_proof(&self, _constraint_type: PhysicalConstraintType, _design_hash: &str, _parameters: &serde_json::Value) -> Result<ZkProof> {
        Ok(ZkProof {
            proof_bytes: vec![],
            public_inputs: vec![],
            circuit_id: "risc0-mock".to_string(),
            verification_key_hash: "".to_string(),
        })
    }

    fn verify_proof(&self, _proof: &ZkProof) -> Result<bool> {
        Ok(true)
    }
}
