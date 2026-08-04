//! JIT Engine — Caster da Bicicleta (Substrato 223)
//!
//! Transforma hesitação (grafo simbólico) em movimento (kernel compilado).

use arkhe_jax_core::JaxprGraph;
use super::backends::{XlaBackend, CompiledKernel, BackendError};

pub struct JitEngine<B: XlaBackend> {
    backend: B,
    cache: std::collections::HashMap<u64, CompiledKernel>,
}

impl<B: XlaBackend> JitEngine<B> {
    pub fn new(backend: B) -> Self {
        Self { backend, cache: std::collections::HashMap::new() }
    }

    /// Compila ou recupera kernel do cache
    pub fn compile(&mut self, graph: &JaxprGraph) -> Result<&CompiledKernel, BackendError> {
        let key = Self::hash_graph(graph);
        if !self.cache.contains_key(&key) {
            let kernel = self.backend.compile(graph)?;
            self.cache.insert(key, kernel);
        }
        Ok(self.cache.get(&key).unwrap())
    }

    fn hash_graph(graph: &JaxprGraph) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        graph.complexity().hash(&mut hasher);
        hasher.finish()
    }
}
