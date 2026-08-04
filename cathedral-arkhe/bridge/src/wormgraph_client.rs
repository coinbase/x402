use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use arkhe_wormgraph::storage::{ShardStorage, ShardMetadata};
use arkhe_wormgraph::shard::{ProvenanceEvent as WormProvenanceEvent};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceEvent {
    pub event_id: String,
    pub timestamp: i64,
    pub event_type: String,
    pub agent_id: String,
    pub parent_agent_id: Option<String>,
    pub tree_id: Option<String>,
    pub payload: serde_json::Value,
    pub entry_hash: Vec<u8>,
    pub project_id: String,
}

pub struct WormGraphClient {
    storage: Arc<dyn ShardStorage>,
    shard_id: u64,
    cache: Arc<tokio::sync::RwLock<HashMap<String, ProvenanceEvent>>>,
}

impl WormGraphClient {
    pub fn new_with_storage(storage: Arc<dyn ShardStorage>) -> Self {
        Self {
            storage,
            shard_id: 0,
            cache: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    pub fn new() -> Self {
        use arkhe_wormgraph::storage_file::{HardenedFileStorage, FileStorageConfig};
        let storage = Arc::new(
            tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current().block_on(async {
                    HardenedFileStorage::new(FileStorageConfig {
                        base_path: std::path::PathBuf::from("./wormgraph_data"),
                        ..Default::default()
                    }).await.unwrap()
                })
            })
        );
        Self::new_with_storage(storage)
    }

    pub async fn append_event(&self, event: crate::cathedral::v1::Event) -> Result<ProvenanceEvent> {
        let timestamp = event.timestamp
            .map(|ts| ts.seconds)
            .unwrap_or_else(|| chrono::Utc::now().timestamp());

        let entry = ProvenanceEvent {
            event_id: event.event_id.clone(),
            timestamp,
            event_type: format!("{:?}", event.event_type),
            agent_id: event.agent_identity.as_ref().map(|id| id.agent_id.clone()).unwrap_or_default(),
            parent_agent_id: event.agent_identity.as_ref().and_then(|id| id.parent_agent_id.clone()),
            tree_id: event.agent_identity.as_ref().and_then(|id| id.tree_id.clone()),
            payload: serde_json::from_str(&event.payload_json).unwrap_or(serde_json::Value::Null),
            entry_hash: self.compute_hash(&event),
            project_id: "default".to_string(),
        };

        let worm_entry = WormProvenanceEvent {
            id: entry.event_id.clone(),
            timestamp: entry.timestamp,
            event_type: entry.event_type.clone(),
            agent_id: entry.agent_id.clone(),
            parent_agent_id: entry.parent_agent_id.clone(),
            tree_id: entry.tree_id.clone(),
            payload: entry.payload.clone(),
            entry_hash: entry.entry_hash.clone(),
            project_id: entry.project_id.clone(),
        };

        self.storage.append_events(self.shard_id, &[worm_entry]).await?;

        {
            let mut cache = self.cache.write().await;
            cache.insert(entry.event_id.clone(), entry.clone());
        }

        Ok(entry)
    }

    pub async fn query(
        &self,
        project_id: Option<&str>,
        design_hash: Option<&str>,
        agent_id: Option<&str>,
        tree_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<ProvenanceEvent>> {
        let all = self.storage.read_all_events(self.shard_id).await?;

        let mut filtered: Vec<ProvenanceEvent> = all
            .into_iter()
            .filter(|e| {
                if let Some(pid) = project_id {
                    if e.project_id != pid { return false; }
                }
                if let Some(agent) = agent_id {
                    if e.agent_id != agent { return false; }
                }
                if let Some(tree) = tree_id {
                    if e.tree_id.as_deref() != Some(tree) { return false; }
                }
                true
            })
            .map(|e| ProvenanceEvent {
                event_id: e.id,
                timestamp: e.timestamp,
                event_type: e.event_type,
                agent_id: e.agent_id,
                parent_agent_id: e.parent_agent_id,
                tree_id: e.tree_id,
                payload: e.payload,
                entry_hash: e.entry_hash,
                project_id: e.project_id,
            })
            .take(limit)
            .collect();

        filtered.sort_by_key(|e| e.timestamp);
        Ok(filtered)
    }

    fn compute_hash(&self, event: &crate::cathedral::v1::Event) -> Vec<u8> {
        let mut hasher = blake3::Hasher::new();
        hasher.update(event.event_id.as_bytes());
        hasher.update(event.payload_json.as_bytes());
        hasher.finalize().as_bytes().to_vec()
    }
}
