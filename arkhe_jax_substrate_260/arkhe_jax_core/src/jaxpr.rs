//! Jaxpr IR — Wengert list com arena allocation
//!
//! O grafo computacional da ASI. Cada nó é uma operação primitiva;
//! a tape é a lista de Wengert que permite VJP/JVP.

use bumpalo::Bump;
use crate::dtype::DType;

pub type NodeId = usize;

/// Operação primitiva — extensível via registro dinâmico
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Primitive {
    Add,
    Mul,
    Neg,
    Sin,
    Cos,
    Exp,
    Log,
    MatMul,
    Transpose,
    Reshape { new_shape: Vec<usize> },
    Slice { starts: Vec<usize>, ends: Vec<usize> },
    // ——— Primitivas quânticas (Substrato 930) ———
    Hadamard,
    PhaseShift { theta: u64 },
    CNot,
    // ——— Primitivas FHE (Substrato 840) ———
    FheAdd,
    FheMul,
}

/// Nó no grafo
pub struct Node {
    pub primitive: Primitive,
    pub inputs: Vec<NodeId>,
}

/// Valor traçável — o "Tracer" do ARKHE-JAX
pub struct Tracer<'a> {
    pub id: NodeId,
    pub shape: &'a [usize],
    pub dtype: DType,
    // Referência ao grafo para construção lazy
    #[allow(dead_code)]
    pub(crate) graph: &'a mut JaxprGraph,
}

/// Grafo computacional (Wengert list) com arena allocation
pub struct JaxprGraph {
    pub(crate) arena: Bump,
    pub nodes: Vec<Node>,
    pub tape: Vec<(Primitive, Vec<NodeId>, NodeId)>,
    pub(crate) next_id: NodeId,
}

impl JaxprGraph {
    pub fn new() -> Self {
        Self {
            arena: Bump::new(),
            nodes: Vec::new(),
            tape: Vec::new(),
            next_id: 0,
        }
    }

    /// Aloca shape no arena e retorna referência estável
    pub fn alloc_shape(&mut self, shape: Vec<usize>) -> &[usize] {
        let slice = self.arena.alloc_slice_copy(&shape);
        slice
    }

    /// Registra operação primitiva e retorna Tracer resultado
    pub fn add_op<'a>(
        &'a mut self,
        prim: Primitive,
        inputs: &[&Tracer<'a>],
        out_shape: Vec<usize>,
        out_dtype: DType,
    ) -> Tracer<'a> {
        let in_ids: Vec<NodeId> = inputs.iter().map(|t| t.id).collect();
        let out_id = self.next_id;
        self.next_id += 1;

        self.nodes.push(Node {
            primitive: prim.clone(),
            inputs: in_ids.clone(),
        });
        self.tape.push((prim, in_ids, out_id));

        let shape = self.alloc_shape(out_shape);
        let shape_ptr: *const [usize] = shape;
        let shape_ref: &'a [usize] = unsafe { &*shape_ptr };
        Tracer {
            id: out_id,
            shape: shape_ref,
            dtype: out_dtype,
            graph: self,
        }
    }

    /// Kolmogorov complexity proxy — número de primitivas na tape
    /// (Substrato 898 — Kolmogorov Weight Theorem)
    pub fn complexity(&self) -> usize {
        self.tape.len()
    }

    /// Verifica pureza determinística: nenhuma primitiva de efeito
    pub fn is_pure(&self) -> bool {
        self.tape.iter().all(|(p, _, _)| !matches!(p,
            Primitive::FheAdd | Primitive::FheMul
        ))
    }
}

impl Default for JaxprGraph {
    fn default() -> Self { Self::new() }
}
