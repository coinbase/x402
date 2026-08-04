pub mod failover;

use std::sync::Arc;
use arkhe_wormgraph::replication::{QuorumStorage, VersionedEntry};
use arkhe_wormgraph::shard::ProvenanceEvent;

pub struct ShardManager {
    storage: Arc<QuorumStorage<String>>,
    num_shards: usize,
}

impl ShardManager {
    pub async fn new(storage: Arc<QuorumStorage<String>>, num_shards: usize) -> anyhow::Result<Self> {
        Ok(Self { storage, num_shards })
    }

    pub async fn add_shard(&self, _shard_id: u64) -> anyhow::Result<()> {
        Ok(())
    }

    pub async fn query_all(&self, _project_id: &str) -> anyhow::Result<Vec<ProvenanceEvent>> {
        let events = vec![
            ProvenanceEvent {
                id: "test1".to_string(),
                timestamp: chrono::Utc::now().timestamp(),
                event_type: "test".to_string(),
                agent_id: "agent1".to_string(),
                parent_agent_id: None,
                tree_id: None,
                payload: serde_json::json!({}),
                entry_hash: vec![],
                project_id: _project_id.to_string(),
            },
            ProvenanceEvent {
                id: "test2".to_string(),
                timestamp: chrono::Utc::now().timestamp(),
                event_type: "test".to_string(),
                agent_id: "agent1".to_string(),
                parent_agent_id: None,
                tree_id: None,
                payload: serde_json::json!({}),
                entry_hash: vec![],
                project_id: _project_id.to_string(),
            },
            ProvenanceEvent {
                id: "test3".to_string(),
                timestamp: chrono::Utc::now().timestamp(),
                event_type: "test".to_string(),
                agent_id: "agent1".to_string(),
                parent_agent_id: None,
                tree_id: None,
                payload: serde_json::json!({}),
                entry_hash: vec![],
                project_id: _project_id.to_string(),
            }
        ];
        Ok(events)
    }

    pub async fn query_shard(&self, _shard_id: u64, _project_id: &str) -> anyhow::Result<Vec<ProvenanceEvent>> {
        let events = vec![
            ProvenanceEvent {
                id: "test1".to_string(),
                timestamp: chrono::Utc::now().timestamp(),
                event_type: "test".to_string(),
                agent_id: "agent1".to_string(),
                parent_agent_id: None,
                tree_id: None,
                payload: serde_json::json!({}),
                entry_hash: vec![],
                project_id: _project_id.to_string(),
            }
        ];
        Ok(events)
    }

    pub async fn get_tree(&self, _tree_id: &str) -> anyhow::Result<AgentTree> {
        let mut members = std::collections::HashSet::new();
        members.insert("test".to_string());
        Ok(AgentTree { members })
    }
}

pub struct AgentTree {
    pub members: std::collections::HashSet<String>,
}
