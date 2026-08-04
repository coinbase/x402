//! Diferenciação Automática — VJP (reverse-mode) e JVP (forward-mode)
//!
//! Retrocausalidade Constitucional (Glosa 248):
//! O gradiente é a informação do futuro que ajusta o presente.

pub mod tape;
pub mod primitives;
pub mod var;

pub use var::Var;
pub use tape::Tape;
pub use primitives::{add, mul, relu, matmul_scalar, neg, sin, cos};

use crate::jaxpr::{JaxprGraph, Primitive, NodeId};

/// Trait de diferenciação automática para tipos algébricos
pub trait Differentiable {
    type Tangent;
    fn jvp(&self, tangent: &Self::Tangent) -> Self::Tangent;
    fn vjp(&self, cotangent: &Self::Tangent) -> Vec<Self::Tangent>;
}

impl Differentiable for f64 {
    type Tangent = f64;
    fn jvp(&self, tangent: &f64) -> f64 { *tangent }
    fn vjp(&self, cotangent: &f64) -> Vec<f64> { vec![*cotangent] }
}

/// Engine de autograd sobre JaxprGraph (tape-based)
pub struct AutogradEngine<'a> {
    graph: &'a JaxprGraph,
}

impl<'a> AutogradEngine<'a> {
    pub fn new(graph: &'a JaxprGraph) -> Self {
        Self { graph }
    }

    /// Computa VJP usando tape traversal com regras de pullback
    pub fn reverse_diff(&self, output_id: NodeId, cotangent: f64) -> Vec<(NodeId, f64)> {
        let mut grads: Vec<(NodeId, f64)> = Vec::new();
        grads.push((output_id, cotangent));
        // Reverse topological sort + pullback application
        for (prim, inputs, out) in self.graph.tape.iter().rev() {
            let g_out = if let Some((_, g)) = grads.iter().find(|(id, _)| *id == *out) { *g } else { continue; };
            match prim {
                Primitive::Add => {
                    for inp in inputs {
                        grads.push((*inp, g_out));
                    }
                }
                Primitive::Mul => {
                    for inp in inputs {
                        grads.push((*inp, g_out));
                    }
                }
                _ => {}
            }
        }
        grads
    }
}
