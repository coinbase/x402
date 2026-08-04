//! Primitivas com regras de pullback
//!
//! Cada operação registra a sua pullback na tape para backward-mode autodiff.

use super::var::Var;
use super::tape::Tape;
use std::rc::Rc;

/// Add: out = a + b
/// Pullback: dL/da = dL/dout, dL/db = dL/dout
pub fn add(a: &Rc<Var>, b: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out = Var::with_parents(a.value + b.value, vec![a.clone(), b.clone()]);
    let a_clone = a.clone();
    let b_clone = b.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        *a_clone.grad.borrow_mut() += g;
        *b_clone.grad.borrow_mut() += g;
    });
    tape.record(out.clone(), pb);
    out
}

/// Mul: out = a * b
/// Pullback: dL/da = dL/dout * b, dL/db = dL/dout * a
pub fn mul(a: &Rc<Var>, b: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out = Var::with_parents(a.value * b.value, vec![a.clone(), b.clone()]);
    let a_val = a.value;
    let b_val = b.value;
    let a_clone = a.clone();
    let b_clone = b.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        *a_clone.grad.borrow_mut() += g * b_val;
        *b_clone.grad.borrow_mut() += g * a_val;
    });
    tape.record(out.clone(), pb);
    out
}

/// ReLU: out = max(a, 0)
/// Pullback: dL/da = dL/dout if a > 0 else 0
pub fn relu(a: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out_val = if a.value > 0.0 { a.value } else { 0.0 };
    let out = Var::with_parents(out_val, vec![a.clone()]);
    let a_val = a.value;
    let a_clone = a.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        if a_val > 0.0 {
            *a_clone.grad.borrow_mut() += g;
        }
    });
    tape.record(out.clone(), pb);
    out
}

/// MatMul simplificado (escalar): out = a * b
/// Pullback: dA = dout * B^T, dB = A^T * dout
pub fn matmul_scalar(a: &Rc<Var>, b: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out = Var::with_parents(a.value * b.value, vec![a.clone(), b.clone()]);
    let a_val = a.value;
    let b_val = b.value;
    let a_clone = a.clone();
    let b_clone = b.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        *a_clone.grad.borrow_mut() += g * b_val;
        *b_clone.grad.borrow_mut() += g * a_val;
    });
    tape.record(out.clone(), pb);
    out
}

/// Neg: out = -a
/// Pullback: dL/da = -dL/dout
pub fn neg(a: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out = Var::with_parents(-a.value, vec![a.clone()]);
    let a_clone = a.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        *a_clone.grad.borrow_mut() += -g;
    });
    tape.record(out.clone(), pb);
    out
}

/// Sin: out = sin(a)
/// Pullback: dL/da = dL/dout * cos(a)
pub fn sin(a: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out = Var::with_parents(a.value.sin(), vec![a.clone()]);
    let a_val = a.value;
    let a_clone = a.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        *a_clone.grad.borrow_mut() += g * a_val.cos();
    });
    tape.record(out.clone(), pb);
    out
}

/// Cos: out = cos(a)
/// Pullback: dL/da = -dL/dout * sin(a)
pub fn cos(a: &Rc<Var>, tape: &mut Tape) -> Rc<Var> {
    let out = Var::with_parents(a.value.cos(), vec![a.clone()]);
    let a_val = a.value;
    let a_clone = a.clone();
    let pb = Box::new(move |dout: &Var| {
        let g = *dout.grad.borrow();
        *a_clone.grad.borrow_mut() += -g * a_val.sin();
    });
    tape.record(out.clone(), pb);
    out
}
