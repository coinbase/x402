//! Tape — Fita de gradientes que viaja no tempo
//!
//! Retrocausalidade Constitucional (Glosa 248):
//! O gradiente é a informação do futuro que ajusta o presente.

use super::var::Var;
use std::collections::HashMap;
use std::rc::Rc;

pub type Pullback = Box<dyn Fn(&Var)>;

pub struct Tape {
    pub nodes: Vec<Rc<Var>>,
    pub pullbacks: HashMap<usize, Pullback>,
}

impl Tape {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            pullbacks: HashMap::new(),
        }
    }

    pub fn record(&mut self, output: Rc<Var>, pb: Pullback) {
        self.nodes.push(output.clone());
        self.pullbacks.insert(output.id, pb);
    }

    /// Backpropagation: propaga gradientes do root para as folhas
    pub fn backward(&self, seed: f32) {
        if let Some(root) = self.nodes.last() {
            *root.grad.borrow_mut() = seed;
            // Reverse traversal: do último nó para o primeiro
            for node in self.nodes.iter().rev() {
                if let Some(pb) = self.pullbacks.get(&node.id) {
                    pb(node);
                }
            }
        }
    }

    /// Limpa gradientes acumulados (para novo passo de otimização)
    pub fn zero_grad(&self) {
        for node in &self.nodes {
            *node.grad.borrow_mut() = 0.0;
        }
    }
}

impl Default for Tape {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::autograd::primitives::{add, mul};

    #[test]
    fn test_tape_backward() {
        let mut tape = Tape::new();

        let a = Var::new(2.0);
        let b = Var::new(3.0);

        // c = a * b (6)
        let c = mul(&a, &b, &mut tape);

        // d = c + a (8)
        let _d = add(&c, &a, &mut tape);

        // backward pass
        tape.backward(1.0);

        // d(d)/d(a) = d(c+a)/d(a) = d(c)/d(a) + 1 = b + 1 = 3 + 1 = 4
        assert_eq!(*a.grad.borrow(), 4.0);

        // d(d)/d(b) = d(c+a)/d(b) = d(c)/d(b) = a = 2
        assert_eq!(*b.grad.borrow(), 2.0);
    }
}
