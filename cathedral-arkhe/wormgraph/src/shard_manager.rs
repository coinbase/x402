use crate::replication::QuorumStorage;
use std::sync::Arc;

pub struct ShardManager {
    storage: Arc<QuorumStorage<String>>,
}

impl ShardManager {
    pub async fn new(storage: Arc<QuorumStorage<String>>, _shards: usize) -> anyhow::Result<Self> {
        Ok(Self { storage })
    }
}
