//! Backend CPU — via interpretação direta ou Cranelift (futuro)

use arkhe_jax_core::JaxprGraph;
use super::{XlaBackend, CompiledKernel, BackendError};

pub struct CpuBackend;

impl CpuBackend {
    pub fn new() -> Self { Self }
}

impl Default for CpuBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl XlaBackend for CpuBackend {
    fn compile(&mut self, graph: &JaxprGraph) -> Result<CompiledKernel, BackendError> {
        Ok(CompiledKernel {
            _opaque: vec![0], // marker
            output_shape: vec![graph.complexity()],
            output_dtype: arkhe_jax_core::dtype::DType::F32,
        })
    }

    fn execute(&self, _kernel: &CompiledKernel, _inputs: &[&[u8]]) -> Result<Vec<u8>, BackendError> {
        Ok(vec![])
    }
}
