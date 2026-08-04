use ndarray::prelude::*;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PlasmaConfig {
    pub nu_base: f64,
    pub mu_phi: f64,
    pub rho_phi: f64,
    pub length: f64,
    pub nx: usize,
    pub ny: usize,
}

impl PlasmaConfig {
    pub fn new(nx: usize, ny: usize, length: f64, nu: f64) -> Self {
        Self {
            nu_base: nu,
            mu_phi: 1.0,
            rho_phi: 1.0,
            length,
            nx,
            ny,
        }
    }
    pub fn dx(&self) -> f64 {
        self.length / (self.nx.saturating_sub(1).max(1)) as f64
    }
    pub fn dy(&self) -> f64 {
        self.length / (self.ny.saturating_sub(1).max(1)) as f64
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvoField {
    pub omega_x: Array2<f64>,
    pub omega_y: Array2<f64>,
    pub omega_z: Array2<f64>,
    pub config: PlasmaConfig,
    #[serde(skip)]
    pub nu_eff: f64,
}

impl EvoField {
    pub fn new(config: PlasmaConfig) -> Self {
        let shape = (config.nx, config.ny);
        Self {
            omega_x: Array2::zeros(shape),
            omega_y: Array2::zeros(shape),
            omega_z: Array2::zeros(shape),
            config,
            nu_eff: config.nu_base,
        }
    }

    pub fn harris_sheet(config: PlasmaConfig) -> Self {
        let mut field = Self::new(config);
        let (nx, ny) = (config.nx, config.ny);
        let lx = config.length;
        let ly = config.length;
        for i in 0..nx {
            let y = (i as f64 / (nx - 1) as f64) * ly - ly / 2.0;
            for j in 0..ny {
                let x = (j as f64 / (ny - 1) as f64) * lx - lx / 2.0;
                let sech2 = 1.0 / (y.cosh() * y.cosh());
                field.omega_x[(i, j)] = y.tanh();
                field.omega_y[(i, j)] = 0.0;
                field.omega_z[(i, j)] = 0.1 * (PI * x / lx).sin() * sech2;
            }
        }
        field.nu_eff = config.nu_base;
        field
    }

    pub fn random_harris(config: PlasmaConfig) -> Self {
        Self::harris_sheet(config)
    }

    pub fn current_density(&self) -> (Array2<f64>, Array2<f64>, Array2<f64>) {
        let (nx, ny) = (self.config.nx, self.config.ny);
        let dx = self.config.dx();
        let dy = self.config.dy();
        let mut jx = Array2::zeros((nx, ny));
        let mut jy = Array2::zeros((nx, ny));
        let mut jz = Array2::zeros((nx, ny));
        for i in 1..nx - 1 {
            for j in 1..ny - 1 {
                let doz_dy = (self.omega_z[(i, j + 1)] - self.omega_z[(i, j - 1)]) / (2.0 * dy);
                let doz_dx = (self.omega_z[(i + 1, j)] - self.omega_z[(i - 1, j)]) / (2.0 * dx);
                let doy_dx = (self.omega_y[(i + 1, j)] - self.omega_y[(i - 1, j)]) / (2.0 * dx);
                let dox_dy = (self.omega_x[(i, j + 1)] - self.omega_x[(i, j - 1)]) / (2.0 * dy);
                jx[(i, j)] = doz_dy;
                jy[(i, j)] = -doz_dx;
                jz[(i, j)] = doy_dx - dox_dy;
            }
        }
        (jx, jy, jz)
    }

    pub fn compute_vector_potential(&self) -> (Array2<f64>, Array2<f64>, Array2<f64>) {
        let (nx, ny) = (self.config.nx, self.config.ny);
        let (jx, jy, jz) = self.current_density();
        let dx = self.config.dx();
        let dy = self.config.dy();
        let mut ax = Array2::zeros((nx, ny));
        let mut ay = Array2::zeros((nx, ny));
        let mut az = Array2::zeros((nx, ny));
        for _ in 0..100 {
            let (ax_old, ay_old, az_old) = (ax.clone(), ay.clone(), az.clone());
            for i in 1..nx - 1 {
                for j in 1..ny - 1 {
                    let src_x = -jx[(i, j)] * dx * dy;
                    let src_y = -jy[(i, j)] * dx * dy;
                    let src_z = -jz[(i, j)] * dx * dy;
                    ax[(i, j)] = 0.25
                        * (ax_old[(i + 1, j)]
                            + ax_old[(i - 1, j)]
                            + ax_old[(i, j + 1)]
                            + ax_old[(i, j - 1)]
                            + src_x);
                    ay[(i, j)] = 0.25
                        * (ay_old[(i + 1, j)]
                            + ay_old[(i - 1, j)]
                            + ay_old[(i, j + 1)]
                            + ay_old[(i, j - 1)]
                            + src_y);
                    az[(i, j)] = 0.25
                        * (az_old[(i + 1, j)]
                            + az_old[(i - 1, j)]
                            + az_old[(i, j + 1)]
                            + az_old[(i, j - 1)]
                            + src_z);
                }
            }
        }
        (ax, ay, az)
    }

    pub fn helicity(&self) -> f64 {
        let (ax, ay, az) = self.compute_vector_potential();
        let mut h = 0.0;
        for i in 0..self.config.nx {
            for j in 0..self.config.ny {
                h += ax[(i, j)] * self.omega_x[(i, j)]
                    + ay[(i, j)] * self.omega_y[(i, j)]
                    + az[(i, j)] * self.omega_z[(i, j)];
            }
        }
        h / (self.config.nx * self.config.ny) as f64
    }

    pub fn energy(&self) -> f64 {
        let mut e = 0.0;
        for i in 0..self.config.nx {
            for j in 0..self.config.ny {
                e += self.omega_x[(i, j)].powi(2)
                    + self.omega_y[(i, j)].powi(2)
                    + self.omega_z[(i, j)].powi(2);
            }
        }
        0.5 * e / (self.config.nx * self.config.ny) as f64
    }

    pub fn advance(&mut self, dt: f64, ux: &Array2<f64>, uy: &Array2<f64>) {
        let (nx, ny) = (self.config.nx, self.config.ny);
        if nx < 3 || ny < 3 {
            return;
        }
        let dx = self.config.dx();
        let dy = self.config.dy();
        let nu = self.nu_eff;

        let mut cross_x = Array2::zeros((nx, ny));
        let mut cross_y = Array2::zeros((nx, ny));
        let mut cross_z = Array2::zeros((nx, ny));
        for i in 0..nx {
            for j in 0..ny {
                cross_x[(i, j)] = uy[(i, j)] * self.omega_z[(i, j)];
                cross_y[(i, j)] = -ux[(i, j)] * self.omega_z[(i, j)];
                cross_z[(i, j)] = ux[(i, j)] * self.omega_y[(i, j)] - uy[(i, j)] * self.omega_x[(i, j)];
            }
        }

        let mut adv_x = Array2::zeros((nx, ny));
        let mut adv_y = Array2::zeros((nx, ny));
        let mut adv_z = Array2::zeros((nx, ny));
        for i in 1..nx - 1 {
            for j in 1..ny - 1 {
                adv_x[(i, j)] = (cross_z[(i, j + 1)] - cross_z[(i, j - 1)]) / (2.0 * dy);
                adv_y[(i, j)] = -(cross_z[(i + 1, j)] - cross_z[(i - 1, j)]) / (2.0 * dx);
                adv_z[(i, j)] = (cross_y[(i + 1, j)] - cross_y[(i - 1, j)]) / (2.0 * dx)
                    - (cross_x[(i, j + 1)] - cross_x[(i, j - 1)]) / (2.0 * dy);
            }
        }

        let mut diff_x = Array2::zeros((nx, ny));
        let mut diff_y = Array2::zeros((nx, ny));
        let mut diff_z = Array2::zeros((nx, ny));
        for i in 1..nx - 1 {
            for j in 1..ny - 1 {
                let lap_x = (self.omega_x[(i + 1, j)] - 2.0 * self.omega_x[(i, j)]
                    + self.omega_x[(i - 1, j)])
                    / (dx * dx)
                    + (self.omega_x[(i, j + 1)] - 2.0 * self.omega_x[(i, j)]
                        + self.omega_x[(i, j - 1)])
                        / (dy * dy);
                let lap_y = (self.omega_y[(i + 1, j)] - 2.0 * self.omega_y[(i, j)]
                    + self.omega_y[(i - 1, j)])
                    / (dx * dx)
                    + (self.omega_y[(i, j + 1)] - 2.0 * self.omega_y[(i, j)]
                        + self.omega_y[(i, j - 1)])
                        / (dy * dy);
                let lap_z = (self.omega_z[(i + 1, j)] - 2.0 * self.omega_z[(i, j)]
                    + self.omega_z[(i - 1, j)])
                    / (dx * dx)
                    + (self.omega_z[(i, j + 1)] - 2.0 * self.omega_z[(i, j)]
                        + self.omega_z[(i, j - 1)])
                        / (dy * dy);
                diff_x[(i, j)] = lap_x;
                diff_y[(i, j)] = lap_y;
                diff_z[(i, j)] = lap_z;
            }
        }

        for i in 0..nx {
            for j in 0..ny {
                self.omega_x[(i, j)] += dt * (adv_x[(i, j)] + nu * diff_x[(i, j)]);
                self.omega_y[(i, j)] += dt * (adv_y[(i, j)] + nu * diff_y[(i, j)]);
                self.omega_z[(i, j)] += dt * (adv_z[(i, j)] + nu * diff_z[(i, j)]);
            }
        }
    }

    pub fn check_cfl(&self, dt: f64, u_max: f64) -> Result<(), String> {
        let dx = self.config.dx();
        let dy = self.config.dy();
        let nu = self.nu_eff;
        let dt_diff = (dx * dx).min(dy * dy) / (4.0 * nu + 1e-12);
        let dt_adv = dx / (u_max + 1e-12);
        let dt_max = dt_diff.min(dt_adv);
        if dt > dt_max {
            Err("CFL violado".to_string())
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Clone)]
pub struct ReconnectionDetector {
    pub prev_helicity: f64,
    pub threshold: f64,
    pub handover_count: u32,
}

impl ReconnectionDetector {
    pub fn new(threshold: f64) -> Self {
        Self {
            prev_helicity: 0.0,
            threshold,
            handover_count: 0,
        }
    }
    pub fn detect(&mut self, field: &EvoField) -> bool {
        let h = field.helicity();
        let delta = (h - self.prev_helicity).abs();
        self.prev_helicity = h;
        if delta > self.threshold {
            self.handover_count += 1;
            true
        } else {
            false
        }
    }
}
