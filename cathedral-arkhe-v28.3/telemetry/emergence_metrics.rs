use prometheus::{IntGauge, Registry, TextEncoder};

pub struct EmergenceMetrics {
    pub avg_compression_ratio: IntGauge,
    pub active_agents: IntGauge,
    pub compression_improvement: IntGauge,
}

impl EmergenceMetrics {
    pub fn new(registry: &Registry) -> Self {
        let avg = IntGauge::new("arkhe_avg_compression_ratio", "Average compression ratio").unwrap();
        let agents = IntGauge::new("arkhe_active_specialist_agents", "Number of active compression agents").unwrap();
        let improvement = IntGauge::new("arkhe_compression_improvement", "Improvement in compression over time").unwrap();

        registry.register(Box::new(avg.clone())).unwrap();
        registry.register(Box::new(agents.clone())).unwrap();
        registry.register(Box::new(improvement.clone())).unwrap();

        Self {
            avg_compression_ratio: avg,
            active_agents: agents,
            compression_improvement: improvement,
        }
    }
}