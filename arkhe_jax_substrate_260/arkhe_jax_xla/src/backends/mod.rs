//! Backends de compilação — CPU (Cranelift) e GPU (wgpu)

pub mod wgpu_backend;
pub mod cpu_backend;

use arkhe_jax_core::{JaxprGraph, dtype::DType};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BackendError {
    #[error("GPU device not available")]
    GpuUnavailable,
    #[error("Shader compilation failed: {0}")]
    ShaderCompile(String),
    #[error("FHE bridge offline")]
    FheOffline,
}

/// Trait unificado de backend XLA
pub trait XlaBackend {
    /// Compila JaxprGraph para kernel nativo
    fn compile(&mut self, graph: &JaxprGraph) -> Result<CompiledKernel, BackendError>;
    /// Executa kernel com inputs dados
    fn execute(&self, kernel: &CompiledKernel, inputs: &[&[u8]]) -> Result<Vec<u8>, BackendError>;
}

/// Handle opaco para kernel compilado
pub struct CompiledKernel {
    pub(crate) _opaque: Vec<u8>,
    pub output_shape: Vec<usize>,
    pub output_dtype: DType,
}
