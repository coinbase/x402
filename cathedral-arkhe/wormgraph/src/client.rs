use std::sync::Arc;
use crate::shard::ProvenanceEvent;
use crate::storage::ShardStorage;

pub struct WormGraphClient {
    storage: Arc<dyn ShardStorage>,
}

impl WormGraphClient {
    pub fn new_with_storage(storage: Arc<dyn ShardStorage>) -> Self {
        Self { storage }
    }

    pub async fn append_event(&self, _event: serde_json::Value) -> anyhow::Result<ProvenanceEvent> {
        unimplemented!()
    }

    pub async fn query(
        &self,
        _project_id: Option<&str>,
        _design_hash: Option<&str>,
        _agent_id: Option<&str>,
        _tree_id: Option<&str>,
        _limit: usize,
    ) -> anyhow::Result<Vec<ProvenanceEvent>> {
        unimplemented!()
    }
}
