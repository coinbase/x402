use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceEvent {
    pub id: String,
    pub timestamp: i64,
    pub event_type: String,
    pub agent_id: String,
    pub parent_agent_id: Option<String>,
    pub tree_id: Option<String>,
    pub payload: serde_json::Value,
    pub entry_hash: Vec<u8>,
    pub project_id: String,
}

pub enum EventType {}
pub struct Filter {}
pub struct WormGraphShard {}
