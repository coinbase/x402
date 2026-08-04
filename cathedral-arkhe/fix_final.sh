sed -i 's/tonic::include_proto/cathedral::v1/g' wormgraph/src/lib.rs

# wormgraph doesn't seem to have a build.rs, so tonic::include_proto won't work unless we have tonic-build in it.
# Let's remove the tonic::include_proto entirely from wormgraph if we don't need it. Or just comment it out.
sed -i 's/tonic::include_proto!("cathedral.v1");/\/\//g' wormgraph/src/lib.rs
sed -i 's/cathedral::v1::Event/serde_json::Value/g' wormgraph/src/lib.rs

sed -i 's/use crate::shard::ProvenanceEvent;/use crate::ProvenanceEvent;/g' wormgraph/src/storage.rs
sed -i 's/cathedral::v1::Event/serde_json::Value/g' wormgraph/src/client.rs

cat << 'EOF2' > wormgraph/src/client.rs
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
EOF2
