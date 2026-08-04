use serde::{Deserialize, Serialize};
use crate::mhd::EvoField;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObserverState {
    pub attachment: f64,
    pub relaxation_rate: f64,
    pub target_attachment: f64,
    pub external_demand: f64,
    pub use_full_rank: bool,
    pub shadow_integration_rate: f64,
}

impl ObserverState {
    pub fn new() -> Self {
        Self {
            attachment: 0.5,
            relaxation_rate: 0.1,
            target_attachment: 0.5,
            external_demand: 0.1,
            use_full_rank: false,
            shadow_integration_rate: 0.1,
        }
    }
    pub fn release(&mut self) {
        self.target_attachment = 0.0;
        self.relaxation_rate = 10.0;
        self.external_demand = 0.0;
        self.use_full_rank = true;
        self.shadow_integration_rate = 1.0;
    }
    pub fn update(&mut self, dt: f64) {
        let factor = (-self.relaxation_rate * dt).exp();
        self.attachment = self.target_attachment + (self.attachment - self.target_attachment) * factor;
        if self.attachment.abs() < 1e-12 {
            self.attachment = 0.0;
        }
        if self.relaxation_rate > 1.0 {
            self.relaxation_rate *= 0.99;
        }
        self.attachment += self.external_demand * dt * 0.1;
        self.attachment = self.attachment.clamp(0.0, 1.0);
    }
    pub fn apply_to_field(&self, field: &mut EvoField) {
        field.nu_eff = field.config.nu_base * (1.0 + 0.5 * self.attachment);
    }
}

impl Default for ObserverState {
    fn default() -> Self {
        Self::new()
    }
}
