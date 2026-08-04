#[cfg(feature = "production")]
pub use cathedral_atlassian::jira_client::JiraClient;

#[cfg(not(feature = "production"))]
pub struct JiraClientMock;

use anyhow::Result;
use arkhe_wormgraph::WormGraphClient;
use observer_5d::MetaGovernanceRequest;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{error, info};
use chrono::Utc;

#[derive(Debug, Clone, Default)]
pub struct CemConfig {
    pub cem_agent_id: String,
    pub review_timeout_secs: u64,
    pub project_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetaGovernanceVerdict {
    Approved,
    Rejected,
    RequiresCemReview,
    Conditional,
    Deferred,
}

#[derive(Debug, Clone)]
pub struct CemMetrics {
    pub alert_id: String,
    pub received_at: chrono::DateTime<chrono::Utc>,
    pub verdict_at: chrono::DateTime<chrono::Utc>,
    pub verdict: MetaGovernanceVerdict,
    pub convergence_time_ms: u64,
    pub alerts_processed: u64,
    pub escalated: u64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct CemAdapter {
    pub config: CemConfig,
    #[cfg(feature = "production")]
    pub jira: Option<Arc<JiraClient>>,
    #[cfg(not(feature = "production"))]
    pub jira: Option<Arc<JiraClientMock>>,
    pub wormgraph: Arc<WormGraphClient>,
    pub active_requests: Arc<RwLock<HashMap<String, String>>>,
    pub alert_rx: mpsc::Receiver<MetaGovernanceRequest>,
    pub metrics_tx: mpsc::Sender<CemMetrics>,
    pub cancellation_token: CancellationToken,
}

impl CemAdapter {
    #[cfg(feature = "production")]
    pub fn new(
        config: CemConfig,
        jira: Arc<JiraClient>,
        wormgraph: Arc<WormGraphClient>,
        alert_rx: mpsc::Receiver<MetaGovernanceRequest>,
        metrics_tx: mpsc::Sender<CemMetrics>,
    ) -> Self {
        Self {
            config,
            jira: Some(jira),
            wormgraph,
            active_requests: Arc::new(RwLock::new(HashMap::new())),
            alert_rx,
            metrics_tx,
            cancellation_token: CancellationToken::new(),
        }
    }

    pub fn new_mock(
        config: CemConfig,
        wormgraph: Arc<WormGraphClient>,
        alert_rx: mpsc::Receiver<MetaGovernanceRequest>,
        metrics_tx: mpsc::Sender<CemMetrics>,
    ) -> Self {
        Self {
            config,
            jira: None,
            wormgraph,
            active_requests: Arc::new(RwLock::new(HashMap::new())),
            alert_rx,
            metrics_tx,
            cancellation_token: CancellationToken::new(),
        }
    }

    pub fn new_with_mock(
        config: CemConfig,
        alert_rx: mpsc::Receiver<MetaGovernanceRequest>,
    ) -> Self {
        let (metrics_tx, _) = mpsc::channel(10);

        let client = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                WormGraphClient::new_with_storage(Arc::new(arkhe_wormgraph::storage_file::HardenedFileStorage::new(arkhe_wormgraph::storage_file::FileStorageConfig::default()).await.unwrap()))
            })
        });

        let wormgraph = Arc::new(client);
        Self::new_mock(config, wormgraph, alert_rx, metrics_tx)
    }

    pub async fn start(mut self) -> Result<()> {
        info!("⚖️ CEM Adapter iniciado.");
        loop {
            tokio::select! {
                Some(alert) = self.alert_rx.recv() => {
                    if let Err(e) = self.process_alert(alert).await {
                        error!("Erro no processamento do alerta: {}", e);
                    }
                }
                _ = self.cancellation_token.cancelled() => {
                    info!("⚖️ CEM Adapter encerrado gracefully.");
                    break;
                }
            }
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        self.cancellation_token.cancel();
    }

    pub async fn process_alert(&self, alert: MetaGovernanceRequest) -> Result<()> {
        let received_at = Utc::now();

        if self.jira.is_some() {
            info!("CEM real: processando alerta {}", alert.request_id);
        } else {
            info!("CEM mock: processando alerta {}", alert.request_id);
        }

        let verdict = MetaGovernanceVerdict::Approved;
        let verdict_at = Utc::now();
        let convergence_time_ms = (verdict_at - received_at).num_milliseconds() as u64;

        let _ = self.metrics_tx.send(CemMetrics {
            alert_id: alert.request_id.clone(),
            received_at,
            verdict_at,
            verdict,
            convergence_time_ms,
            alerts_processed: 1,
            escalated: 1,
            timestamp: Utc::now(),
        }).await;

        Ok(())
    }
}
