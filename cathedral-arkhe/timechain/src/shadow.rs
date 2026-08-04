use ndarray::prelude::*;
use ndarray_linalg::*;
use serde::{Deserialize, Serialize};
use crate::mhd::EvoField;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shadow {
    pub tail_singular: Array1<f64>,
    pub tail_u: Array2<f64>,
    pub tail_vt: Array2<f64>,
    pub energy_ratio: f64,
    pub cut_rank: usize,
    pub total_rank: usize,
}

impl Shadow {
    pub fn from_svd(u: &Array2<f64>, s: &Array1<f64>, vt: &Array2<f64>, cut_rank: usize) -> Self {
        let total_rank = s.len();
        let k = cut_rank.min(total_rank);
        let total_energy: f64 = s.iter().map(|&x| x * x).sum();
        let tail_energy: f64 = s.iter().skip(k).map(|&x| x * x).sum();
        Self {
            tail_singular: s.slice(s![k..]).to_owned(),
            tail_u: u.slice(s![.., k..]).to_owned(),
            tail_vt: vt.slice(s![k.., ..]).to_owned(),
            energy_ratio: if total_energy > 0.0 {
                tail_energy / total_energy
            } else {
                0.0
            },
            cut_rank: k,
            total_rank,
        }
    }

    pub fn reconstruct(&self) -> Array2<f64> {
        let m = self.tail_singular.len();
        let mut diag = Array2::zeros((m, m));
        for i in 0..m {
            diag[(i, i)] = self.tail_singular[i];
        }
        self.tail_u.dot(&diag).dot(&self.tail_vt)
    }

    pub fn strength(&self) -> f64 {
        self.energy_ratio.sqrt()
    }
}

pub struct ShadowHealer {
    pub integration_rate: f64,
}

impl ShadowHealer {
    pub fn new(integration_rate: f64) -> Self {
        Self { integration_rate }
    }
    pub fn heal(&self, field: &mut EvoField, shadow: &Shadow) {
        let shadow_matrix = shadow.reconstruct();
        let (nx, ny) = (field.config.nx, field.config.ny);
        for i in 0..nx.min(shadow_matrix.nrows()) {
            for j in 0..ny.min(shadow_matrix.ncols()) {
                field.omega_x[(i, j)] += self.integration_rate * shadow_matrix[(i, j)];
            }
        }
    }
}
