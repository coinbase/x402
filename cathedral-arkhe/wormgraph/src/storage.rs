use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::ProvenanceEvent;
use async_trait::async_trait;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShardMetadata {
    pub shard_id: u64,
    pub event_count: u64,
    pub first_timestamp: i64,
    pub last_timestamp: i64,
    pub size_bytes: u64,
    pub merkle_root: Vec<u8>,
    pub version: u64,
    #[serde(default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[async_trait]
pub trait ShardStorage: Send + Sync {
    async fn append_events(&self, shard_id: u64, events: &[ProvenanceEvent]) -> Result<()>;
    async fn read_events(&self, shard_id: u64, offset: usize, limit: usize) -> Result<Vec<ProvenanceEvent>>;
    async fn read_all_events(&self, shard_id: u64) -> Result<Vec<ProvenanceEvent>>;
    async fn read_metadata(&self, shard_id: u64) -> Result<Option<ShardMetadata>>;
    async fn write_metadata(&self, shard_id: u64, metadata: &ShardMetadata) -> Result<()>;
    async fn delete_shard(&self, shard_id: u64) -> Result<()>;
    async fn list_shards(&self) -> Result<Vec<u64>>;
}
