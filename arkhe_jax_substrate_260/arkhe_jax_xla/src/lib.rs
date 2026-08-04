//! ARKHE-JAX XLA — Camada 2: JIT + Runtime wgpu + Device Mesh
//!
//! Substrato 260 — Compilador JIT com backend cross-platform.
//! Cross-links: 223 (Caster da Bicicleta), 840 (Octra FHE), 913 (World Model)

pub mod jit;
pub mod mesh;
pub mod backends;
pub mod fhe_bridge;

pub use jit::JitEngine;
pub use backends::CompiledKernel;
pub use mesh::{DeviceMesh, ShardSpec};

/// Selo canónico do Substrato 260 — XLA
pub const SUBSTRATE_260_XLA_SEAL: &str =
    "260.xla.arkhe_jax.0009-0005-2697-4668";
