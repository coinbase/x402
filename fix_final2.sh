cd cathedral-arkhe

cat << 'EOF2' > wormgraph/src/lib.rs
pub mod shard;
pub mod consistent_hasher;
pub mod shard_manager;
pub mod storage;
pub mod storage_file;
pub mod replication;
pub mod reputation;
pub mod test_utils;

pub use shard::{WormGraphShard, ProvenanceEvent, EventType, Filter};
pub use storage_file::{HardenedFileStorage, FileStorageConfig};
pub use shard_manager::ShardManager;
pub use storage::{ShardStorage, ShardMetadata};

pub mod client {
    use super::*;
    use std::sync::Arc;
    use crate::shard::ProvenanceEvent;

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
}
pub use client::WormGraphClient;

EOF2

sed -i 's/zk_pipeline: std::sync::Arc<arkhe_zk_circuits::ZkPipeline>,//g' wormgraph/src/reputation.rs
sed -i 's/wormgraph: std::sync::Arc<crate::WormGraphClient>,/wormgraph: std::sync::Arc<crate::WormGraphClient>,/g' wormgraph/src/reputation.rs
