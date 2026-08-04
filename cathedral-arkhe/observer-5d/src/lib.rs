pub mod remote_agent {
    pub mod v1 {
        tonic::include_proto!("agent.v1");
    }
}

pub mod council_grpc;
pub use council_grpc::{SyntheticCouncilGrpc, RemoteAgentClient};

use anyhow::Result;

use arkhe_wormgraph::WormGraphClient;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use std::time::Duration;
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct Observer5DConfig {
    pub scan_interval_secs: u64,
    pub max_depth: u32,
    pub mutation_window_secs: u64,
    pub max_mutations_per_window: usize,
    pub risk_threshold: f64,
    pub auto_alert_cem: bool,
    pub synthetic_council_enabled: bool,
    pub synthetic_council_size: usize,
    pub synthetic_council_min_reputation: f64,
    pub synthetic_council_vote_threshold: f64,
}

#[derive(Debug, Clone, Default)]
pub struct MetaGovernanceRequest {
    pub request_id: String,
    pub agent_id: String,
    pub tree_id: String,
    pub action: String,
    pub rationale: String,
    pub risk_score: f64,
    pub affected_agent_ids: Vec<String>,
    pub proof_hash: Option<Vec<u8>>,
    pub detected_at: chrono::DateTime<chrono::Utc>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct ObserverAlert {
    pub alert_id: String,
    pub agent_id: String,
    pub detected_at: chrono::DateTime<chrono::Utc>,
    pub risk_score: f64,
    pub action: String,
}

#[derive(Debug, Clone, Default)]
pub struct ObserverMetrics {
    pub scans_count: u64,
    pub alerts_generated: u64,
    pub alerts_resolved_by_council: u64,
    pub alerts_escalated_to_cem: u64,
    pub detection_times_ms: Vec<u64>,
    pub false_positives: u64,
    pub false_negatives: u64,
    pub alerts: Vec<ObserverAlert>,
}

pub struct Observer5D {
    pub config: Observer5DConfig,
    pub tree_manager: Arc<RwLock<()>>,
    pub wormgraph: Arc<WormGraphClient>,
    pub alert_tx: mpsc::Sender<MetaGovernanceRequest>,
    pub mutation_history: Arc<RwLock<HashMap<String, Vec<chrono::DateTime<chrono::Utc>>>>>,
    pub reputation_cache: Arc<RwLock<HashMap<String, f64>>>,
    pub metrics_tx: mpsc::Sender<ObserverMetrics>,
    pub cancellation_token: CancellationToken,
}

impl Observer5D {
    pub fn new(
        config: Observer5DConfig,
        tree_manager: Arc<RwLock<()>>,
        wormgraph: Arc<WormGraphClient>,
        alert_tx: mpsc::Sender<MetaGovernanceRequest>,
        metrics_tx: mpsc::Sender<ObserverMetrics>,
    ) -> Self {
        Self {
            config,
            tree_manager,
            wormgraph,
            alert_tx,
            mutation_history: Arc::new(RwLock::new(HashMap::new())),
            reputation_cache: Arc::new(RwLock::new(HashMap::new())),
            metrics_tx,
            cancellation_token: CancellationToken::new(),
        }
    }

    pub async fn start(&self) -> Result<()> {
        info!("🔭 Observador 5D iniciado.");
        let mut interval = tokio::time::interval(Duration::from_secs(self.config.scan_interval_secs));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if let Err(e) = self.scan_trees().await {
                        error!("Erro no escaneamento: {}", e);
                    }
                }
                _ = self.cancellation_token.cancelled() => {
                    info!("🔭 Observador 5D encerrado gracefully.");
                    break;
                }
            }
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        self.cancellation_token.cancel();
    }

    pub async fn scan_trees(&self) -> Result<()> {
        let trees = {
            let tm = self.tree_manager.read().await;
            vec!["tree-001".to_string()]
        };
        for tree_id in trees {
            self.scan_tree(&tree_id).await?;
        }
        Ok(())
    }

    async fn scan_tree(&self, _tree_id: &str) -> Result<()> {
        let alerts = vec![
            ObserverAlert {
                alert_id: uuid::Uuid::new_v4().to_string(),
                agent_id: "agent-1".to_string(),
                detected_at: Utc::now() - chrono::Duration::milliseconds(100),
                risk_score: 0.8,
                action: "high_mutation_rate".to_string(),
            }
        ];

        let mut metrics = ObserverMetrics::default();
        metrics.scans_count += 1;
        metrics.alerts_generated = alerts.len() as u64;

        for alert in &alerts {
            let detection_time = (Utc::now() - alert.detected_at).num_milliseconds() as u64;
            metrics.detection_times_ms.push(detection_time);

            let req = MetaGovernanceRequest {
                request_id: alert.alert_id.clone(),
                agent_id: alert.agent_id.clone(),
                tree_id: _tree_id.to_string(),
                action: alert.action.clone(),
                rationale: "Automated alert from Observer5D".to_string(),
                risk_score: alert.risk_score,
                affected_agent_ids: vec![],
                proof_hash: None,
                detected_at: alert.detected_at,
                metadata: HashMap::new(),
            };
            let _ = self.alert_tx.send(req).await;
        }
        metrics.alerts = alerts;

        let _ = self.metrics_tx.send(metrics).await;
        Ok(())
    }
}

pub struct SyntheticCouncilResult {
    pub total_votes: usize,
    pub approvals: usize,
    pub threshold: f64,
    pub approved: bool,
    pub votes: Vec<SyntheticVote>,
}

pub struct SyntheticVote {
    pub agent_id: String,
    pub reputation: f64,
    pub approve: bool,
    pub rationale: String,
}
