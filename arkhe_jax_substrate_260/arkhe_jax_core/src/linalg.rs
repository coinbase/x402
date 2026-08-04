//! Álgebra Linear — BLAS via faer-rs / matrixmultiply
//!
//! Placeholder para integração com backends otimizados.

/// Operação MatMul — será lowered para WGSL (GPU) ou BLAS (CPU)
pub fn matmul_shape(lhs: &[usize], rhs: &[usize]) -> Option<Vec<usize>> {
    if lhs.len() < 2 || rhs.len() < 2 {
        return None;
    }
    let m = lhs[lhs.len() - 2];
    let k_lhs = lhs[lhs.len() - 1];
    let k_rhs = rhs[rhs.len() - 2];
    let n = rhs[rhs.len() - 1];
    if k_lhs != k_rhs {
        return None;
    }
    let mut out = lhs[..lhs.len() - 2].to_vec();
    out.push(m);
    out.push(n);
    Some(out)
}
