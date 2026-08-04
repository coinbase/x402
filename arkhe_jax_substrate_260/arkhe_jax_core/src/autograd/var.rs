//! Var — Valor traçável com gradiente (base do autograd)
//!
//! Cada Var é um nó no grafo computacional com valor, gradiente e pais.

use std::cell::RefCell;
use std::rc::Rc;

pub struct Var {
    pub id: usize,
    pub value: f32,
    pub grad: RefCell<f32>,
    pub parents: Vec<Rc<Var>>,
}

impl Var {
    pub fn new(value: f32) -> Rc<Self> {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        Rc::new(Self {
            id: COUNTER.fetch_add(1, Ordering::SeqCst),
            value,
            grad: RefCell::new(0.0),
            parents: Vec::new(),
        })
    }

    pub fn with_parents(value: f32, parents: Vec<Rc<Var>>) -> Rc<Self> {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        Rc::new(Self {
            id: COUNTER.fetch_add(1, Ordering::SeqCst),
            value,
            grad: RefCell::new(0.0),
            parents,
        })
    }
}
