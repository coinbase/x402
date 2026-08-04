use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

pub const D: usize = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationWitness {
    pub leaf_hash: [u64; 4],
    pub sibling_hashes: Vec<[u64; 4]>,
    pub leaf_index: u64,
    pub expected_root: [u64; 4],
}

pub struct ReputationMerkleCircuit {
    pub max_depth: usize,
}

impl ReputationMerkleCircuit {
    pub fn new(max_depth: usize) -> Self {
        Self {
            max_depth,
        }
    }

    pub fn prove(
        &self,
        _witness: &ReputationWitness,
    ) -> Result<Vec<u8>> {
        Ok(vec![])
    }

    pub fn verify(&self, _proof: &[u8]) -> Result<bool> {
        Ok(true)
    }
}

pub struct ReputationZkAdapter {
    circuit: ReputationMerkleCircuit,
}

impl ReputationZkAdapter {
    pub fn new(max_depth: usize) -> Self {
        Self {
            circuit: ReputationMerkleCircuit::new(max_depth),
        }
    }

    pub fn generate_proof(
        &self,
        leaf_hash: [u64; 4],
        siblings: Vec<[u64; 4]>,
        leaf_index: u64,
        root: [u64; 4],
    ) -> Result<Vec<u8>> {
        let witness = ReputationWitness {
            leaf_hash,
            sibling_hashes: siblings,
            leaf_index,
            expected_root: root,
        };

        self.circuit.prove(&witness)
    }

    pub fn verify_proof(&self, proof_bytes: &[u8]) -> Result<bool> {
        self.circuit.verify(proof_bytes)
    }
}
