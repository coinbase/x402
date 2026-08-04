//! ARKHE-JAX ZK — Camada 3: Provas de Correção de Computação
//!
//! Substrato 230 — Cada kernel JIT gera prova ZK de correção.
//! Suporta SHA3-256 commitment e BN254 Groth16/Plonk.

pub mod prover;
pub mod verifier;

pub use prover::{ComputationProof, ZkScheme};
pub use verifier::verify_proof;

/// Selo canónico do Substrato 260 — ZK
pub const SUBSTRATE_260_ZK_SEAL: &str =
    "260.zk.arkhe_jax.0009-0005-2697-4668";
