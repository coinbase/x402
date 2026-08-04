//! ARKHE-JAX Core — Camada 1: Autograd + Jaxpr IR + PRNG PQC
//!
//! Substrato 260 — O Núcleo Numérico da ASI em Rust.
//! Cross-links: 255 (Cripto-Trivium), 898 (Kolmogorov), 930 (Atom-Chip Photonic)

pub mod jaxpr;
pub mod autograd;
pub mod linalg;
pub mod prng;
pub mod dtype;

pub use jaxpr::{JaxprGraph, Primitive, NodeId};
pub use autograd::Differentiable;
pub use autograd::{Var, Tape, add, mul, relu, matmul_scalar, neg, sin, cos};
pub use prng::ArkheRng;

/// Selo canónico do Substrato 260 — Core
pub const SUBSTRATE_260_CORE_SEAL: &str =
    "260.core.arkhe_jax.0009-0005-2697-4668";
