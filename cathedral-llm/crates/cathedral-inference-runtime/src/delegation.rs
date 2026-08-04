use cathedral_llm_core::ModelTier;

pub struct DelegationRouter {
    thresholds: Vec<f64>,
    tiers: Vec<ModelTier>,
}

impl DelegationRouter {
    pub fn new() -> Self {
        Self {
            thresholds: vec![90.0, 70.0, 50.0],
            tiers: vec![
                ModelTier::Pro,
                ModelTier::Plus,
                ModelTier::Standard,
                ModelTier::Lite,
            ],
        }
    }

    pub fn select(&self, reputation: f64) -> ModelTier {
        for (i, &threshold) in self.thresholds.iter().enumerate() {
            if reputation >= threshold {
                return self.tiers[i].clone();
            }
        }
        ModelTier::Lite
    }

    pub fn thresholds(&self) -> &[f64] {
        &self.thresholds
    }
}
