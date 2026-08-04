pub mod cathedral {
    pub mod v1 {
        tonic::include_proto!("cathedral.v1");
    }
}

use cathedral::v1::{Event, EventType};

mod agent_tree;
mod grpc_client;

pub use agent_tree::{AgentTree, AgentTreeNode};
pub use grpc_client::GrpcClient;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use tracing::{debug, error, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub agent_id: String,
    pub parent_agent_id: Option<String>,
    pub tree_id: Option<String>,
    pub subagent_ids: Vec<String>,
    pub role: String,
    pub depth: u32,
    pub reputation_hash: Option<String>,
    pub metadata: HashMap<String, String>,
}

impl AgentIdentity {
    pub fn new(agent_id: &str, role: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            parent_agent_id: None,
            tree_id: None,
            subagent_ids: Vec::new(),
            role: role.to_string(),
            depth: 0,
            reputation_hash: None,
            metadata: HashMap::new(),
        }
    }
    pub fn with_parent(mut self, parent: &str) -> Self { self.parent_agent_id = Some(parent.to_string()); self.depth = 1; self }
    pub fn with_tree(mut self, tree: &str) -> Self { self.tree_id = Some(tree.to_string()); self }
}

#[derive(Debug, Clone)]
pub enum SdkMode {
    Async,
    Realtime,
}

impl Default for SdkMode {
    fn default() -> Self {
        SdkMode::Async
    }
}

#[derive(Debug, Clone)]
pub struct CathedralSdkConfig {
    pub bridge_endpoint: String,
    pub project_id: String,
    pub agent_id: String,
    pub initial_tree: Option<AgentTree>,
    pub compression_enabled: bool,
    pub max_retries: usize,
    pub local_logging_enabled: bool,
    pub mode: SdkMode,
}

impl Default for CathedralSdkConfig {
    fn default() -> Self {
        Self {
            bridge_endpoint: "http://localhost:9002".to_string(),
            project_id: "default".to_string(),
            agent_id: "default-agent".to_string(),
            initial_tree: None,
            compression_enabled: true,
            max_retries: 3,
            local_logging_enabled: false,
            mode: SdkMode::Async,
        }
    }
}

#[derive(Debug, Default)]
pub struct SdkMetrics {
    pub avg_latency_ms: f64,
    pub bytes_sent: u64,
    pub events_emitted: u64,
    pub events_failed: u64,
    pub events_retried: u64,
}

pub struct CathedralSdk {
    pub config: CathedralSdkConfig,
    _agent_tree: Option<AgentTree>,
    _grpc_client: GrpcClient,
    pub metrics: std::sync::Arc<tokio::sync::RwLock<SdkMetrics>>,
    client: reqwest::Client,
}

impl CathedralSdk {
    pub async fn new(config: CathedralSdkConfig) -> Result<Self> {
        let grpc_client = GrpcClient::connect(&config.bridge_endpoint).await?;
        let agent_tree = config.initial_tree.clone();
        let client = reqwest::Client::new();
        Ok(Self { config, _agent_tree: agent_tree, _grpc_client: grpc_client, metrics: std::sync::Arc::new(tokio::sync::RwLock::new(SdkMetrics::default())), client })
    }

    pub async fn emit_design_proposed(&self, event_id: String, parent_hashes: Vec<String>, payload: serde_json::Value, _description: String) -> Result<()> {
         let event = Event {
            event_id,
            timestamp: None,
            event_type: EventType::DesignProposed as i32,
            design_hash: "".to_string(),
            parent_hashes,
            payload_json: payload.to_string(),
            metadata: None,
            zk_proof: None,
            agent_identity: Some(cathedral::v1::AgentIdentity {
                agent_id: self.config.agent_id.clone(),
                parent_agent_id: None,
                tree_id: None,
                subagent_ids: vec![],
                role: "agent".to_string(),
                depth: 0,
                reputation_hash: None,
                metadata: std::collections::HashMap::new(),
            }),
            agent_signature: None,
         };
         self.send_immediately(event).await
    }

    pub async fn emit_simulation_completed(&self, event_id: String, _simulator: String, _metrics: std::collections::HashMap<String, f64>, _success: bool, _cost: f64) -> Result<()> {
         let event = Event {
            event_id,
            timestamp: None,
            event_type: EventType::SimulationCompleted as i32,
            design_hash: "".to_string(),
            parent_hashes: vec![],
            payload_json: "{}".to_string(),
            metadata: None,
            zk_proof: None,
            agent_identity: Some(cathedral::v1::AgentIdentity {
                agent_id: self.config.agent_id.clone(),
                parent_agent_id: None,
                tree_id: None,
                subagent_ids: vec![],
                role: "agent".to_string(),
                depth: 0,
                reputation_hash: None,
                metadata: std::collections::HashMap::new(),
            }),
            agent_signature: None,
         };
         self.send_immediately(event).await
    }

    pub async fn emit_agent_mutation(&self, event_id: String, _agent_id: String, mutation_type: String) -> Result<()> {
         let event = Event {
            event_id,
            timestamp: None,
            event_type: EventType::AgentMutation as i32,
            design_hash: "".to_string(),
            parent_hashes: vec![],
            payload_json: serde_json::json!({"mutation_type": mutation_type}).to_string(),
            metadata: None,
            zk_proof: None,
            agent_identity: Some(cathedral::v1::AgentIdentity {
                agent_id: self.config.agent_id.clone(),
                parent_agent_id: None,
                tree_id: None,
                subagent_ids: vec![],
                role: "agent".to_string(),
                depth: 0,
                reputation_hash: None,
                metadata: std::collections::HashMap::new(),
            }),
            agent_signature: None,
         };
         self.send_immediately(event).await
    }

    pub async fn emit_parameter_change(&self, event_id: String, payload: serde_json::Value, _agent_id: String) -> Result<()> {
         let event = Event {
            event_id,
            timestamp: None,
            event_type: EventType::ParameterChange as i32,
            design_hash: "".to_string(),
            parent_hashes: vec![],
            payload_json: payload.to_string(),
            metadata: None,
            zk_proof: None,
            agent_identity: Some(cathedral::v1::AgentIdentity {
                agent_id: self.config.agent_id.clone(),
                parent_agent_id: None,
                tree_id: None,
                subagent_ids: vec![],
                role: "agent".to_string(),
                depth: 0,
                reputation_hash: None,
                metadata: std::collections::HashMap::new(),
            }),
            agent_signature: None,
         };
         self.send_immediately(event).await
    }

    async fn send_immediately(&self, event: Event) -> Result<()> {
        let start = tokio::time::Instant::now();
        let payload = if self.config.compression_enabled {
            let json = prost::Message::encode_to_vec(&event);
            let compressed = zstd::encode_all(Cursor::new(json), 3)?;
            compressed
        } else {
            prost::Message::encode_to_vec(&event)
        };

        let result = self.send_with_retry(&payload).await;
        let latency = start.elapsed().as_millis() as f64;

        let mut metrics = self.metrics.write().await;
        metrics.avg_latency_ms = (metrics.avg_latency_ms + latency) / 2.0;
        metrics.bytes_sent += payload.len() as u64;

        match result {
            Ok(_) => {
                metrics.events_emitted += 1;
                debug!("Event {} sent successfully (compressed: {})", event.event_id, self.config.compression_enabled);
                Ok(())
            }
            Err(e) => {
                metrics.events_failed += 1;
                error!("Failed to send event {}: {}", event.event_id, e);
                if self.config.local_logging_enabled {
                    self.log_locally(&event).await?;
                }
                Err(e)
            }
        }
    }

    async fn send_with_retry(&self, payload: &[u8]) -> Result<()> {
        let url = format!("{}/ingest", self.config.bridge_endpoint);
        let content_type = if self.config.compression_enabled {
            "application/zstd"
        } else {
            "application/json"
        };

        for attempt in 0..=self.config.max_retries {
            match self.client.post(&url)
                .header("Content-Type", content_type)
                .header("Content-Encoding", if self.config.compression_enabled { "zstd" } else { "identity" })
                .body(payload.to_vec())
                .send()
                .await
            {
                Ok(response) if response.status().is_success() => return Ok(()),
                Ok(response) => {
                    warn!("HTTP {} on attempt {}", response.status(), attempt);
                }
                Err(e) => {
                    warn!("Request failed on attempt {}: {}", attempt, e);
                }
            }

            if attempt < self.config.max_retries {
                tokio::time::sleep(std::time::Duration::from_millis(100 * (attempt + 1) as u64)).await;
                self.metrics.write().await.events_retried += 1;
            }
        }

        bail!("Max retries exceeded")
    }

    async fn log_locally(&self, _event: &Event) -> Result<()> {
        Ok(())
    }
}
