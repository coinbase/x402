use crate::architect::CathedralArchitect;
use cathedral_wormgraph::{ImprovementProposal, WormGraphClient};
use cathedral_api::Notifier;
use std::sync::Arc;

pub struct SelfImprovementOrchestrator {
    architect: CathedralArchitect,
    wormgraph: Arc<WormGraphClient>,
    notifier: Arc<Notifier>,
    sandbox: Sandbox,
    metrics: Metrics,
}

impl SelfImprovementOrchestrator {
    pub async fn run_cycle(&self) -> Result<Vec<ImprovementProposal>, String> {
        // 1. Coleta métricas
        let _metrics = self.metrics.collect().await?;

        // 2. CathedralArchitect analisa o monorepo
        let analysis = self.architect.analyze_monorepo().await?;

        // 3. Gera propostas com base na análise
        let proposals = self.architect.generate_proposals(&analysis).await?;

        // 4. Valida e persiste
        let mut approved = Vec::new();
        for mut proposal in proposals {
            if self.sandbox.validate(&proposal).await? {
                proposal.validation_status = cathedral_wormgraph::ValidationStatus::Approved;
                self.wormgraph.save_proposal(&proposal).await.unwrap();
                // broadcast para WebSocket
                self.notifier.broadcast(proposal.clone()).await;
                approved.push(proposal);
            }
        }

        Ok(approved)
    }
}

pub struct Sandbox;
impl Sandbox {
    pub async fn validate(&self, p: &ImprovementProposal) -> Result<bool, String> { Ok(true) }
}
pub struct Metrics;
impl Metrics {
    pub async fn collect(&self) -> Result<(), String> { Ok(()) }
}
