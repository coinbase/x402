//! Verifier ZK — Verificação on-chain ou off-chain
//!
//! Substrato 230 — Verificação de provas BN254 (compatível Ethereum).

use super::ComputationProof;

/// Verifica prova SHA3-256 commitment
pub fn verify_sha3(proof: &ComputationProof, expected_output_hash: &[u8; 32]) -> bool {
    proof.verify(expected_output_hash)
}

/// Verifica prova Groth16 na curva BN254
pub fn verify_bn254(proof: &ComputationProof, expected_output_hash: &[u8; 32]) -> bool {
    proof.verify(expected_output_hash)
}

/// Verificação genérica
pub fn verify_proof(proof: &ComputationProof, expected_output_hash: &[u8; 32]) -> bool {
    match proof.scheme {
        super::ZkScheme::Sha3Commitment => verify_sha3(proof, expected_output_hash),
        super::ZkScheme::Bn254Groth16 => verify_bn254(proof, expected_output_hash),
        super::ZkScheme::Bn254Plonk => verify_bn254(proof, expected_output_hash),
    }
}
