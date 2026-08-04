use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, warn};

pub type NodeId = String;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionVector {
    pub clocks: BTreeMap<NodeId, u64>,
}

impl VersionVector {
    pub fn new() -> Self {
        Self {
            clocks: BTreeMap::new(),
        }
    }

    pub fn increment(&mut self, node_id: NodeId) {
        *self.clocks.entry(node_id).or_insert(0) += 1;
    }

    pub fn get(&self, node_id: &str) -> u64 {
        self.clocks.get(node_id).copied().unwrap_or(0)
    }

    pub fn is_descendant_of(&self, other: &VersionVector) -> bool {
        let mut has_less = false;
        for (node, &version) in &other.clocks {
            if let Some(&self_version) = self.clocks.get(node) {
                if self_version < version {
                    return false;
                }
                if self_version > version {
                    has_less = true;
                }
            } else {
                if version > 0 {
                    return false;
                }
            }
        }
        for (node, &version) in &self.clocks {
            if let Some(&other_version) = other.clocks.get(node) {
                if version > other_version {
                    has_less = true;
                }
            } else if version > 0 {
                has_less = true;
            }
        }
        has_less
    }

    pub fn merge(&self, other: &VersionVector) -> VersionVector {
        let mut merged = self.clocks.clone();
        for (node, &version) in &other.clocks {
            let entry = merged.entry(node.clone()).or_insert(0);
            *entry = (*entry).max(version);
        }
        VersionVector { clocks: merged }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionedEntry<T> {
    pub data: T,
    pub version: VersionVector,
    pub timestamp: i64,
    pub operation: OperationType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationType {
    Insert,
    Update,
    Delete,
}

impl<T> VersionedEntry<T> {
    pub fn new(data: T, node_id: NodeId, op: OperationType) -> Self {
        let mut version = VersionVector::new();
        version.increment(node_id);
        Self {
            data,
            version,
            timestamp: chrono::Utc::now().timestamp(),
            operation: op,
        }
    }

    pub fn with_version(data: T, version: VersionVector, op: OperationType) -> Self {
        Self {
            data,
            version,
            timestamp: chrono::Utc::now().timestamp(),
            operation: op,
        }
    }
}

pub struct ConflictResolver;

impl ConflictResolver {
    pub fn resolve<T: Clone>(
        a: &VersionedEntry<T>,
        b: &VersionedEntry<T>,
    ) -> (VersionedEntry<T>, bool) {
        if a.version.is_descendant_of(&b.version) {
            return (b.clone(), true);
        }
        if b.version.is_descendant_of(&a.version) {
            return (a.clone(), true);
        }

        let merged_version = a.version.merge(&b.version);
        let winner = if a.timestamp > b.timestamp { a } else { b };

        let resolved = VersionedEntry {
            data: winner.data.clone(),
            version: merged_version,
            timestamp: winner.timestamp,
            operation: winner.operation.clone(),
        };

        (resolved, false)
    }
}

pub struct QuorumStorage<T> {
    replicas: Vec<Arc<dyn ReplicaStorage<T>>>,
    read_quorum: usize,
    write_quorum: usize,
}

#[async_trait::async_trait]
pub trait ReplicaStorage<T>: Send + Sync {
    async fn read(&self, key: &str) -> Result<Option<VersionedEntry<T>>>;
    async fn write(&self, key: &str, entry: &VersionedEntry<T>) -> Result<()>;
    async fn read_all(&self) -> Result<HashMap<String, VersionedEntry<T>>>;
}

impl<T: Clone + Send + Sync + 'static> QuorumStorage<T> {
    pub fn new(replicas: Vec<Arc<dyn ReplicaStorage<T>>>) -> Self {
        let n = replicas.len();
        let read_quorum = (n / 2) + 1;
        let write_quorum = (n / 2) + 1;
        Self {
            replicas,
            read_quorum,
            write_quorum,
        }
    }

    pub async fn write_quorum(
        &self,
        key: &str,
        entry: &VersionedEntry<T>,
    ) -> Result<()> {
        let mut successes = 0;
        let mut errors = Vec::new();

        for replica in &self.replicas {
            match replica.write(key, entry).await {
                Ok(_) => successes += 1,
                Err(e) => errors.push(e),
            }
        }

        if successes >= self.write_quorum {
            debug!("Quorum de escrita atingido: {}/{}", successes, self.replicas.len());
            Ok(())
        } else {
            let err_msg = format!("Quorum de escrita falhou: {}/{}", successes, self.replicas.len());
            error!("{}", err_msg);
            Err(anyhow!(err_msg))
        }
    }

    pub async fn read_quorum(&self, key: &str) -> Result<Option<VersionedEntry<T>>> {
        let mut results = Vec::new();
        let mut errors = Vec::new();

        for replica in &self.replicas {
            match replica.read(key).await {
                Ok(Some(entry)) => results.push(entry),
                Ok(None) => {}
                Err(e) => errors.push(e),
            }
        }

        if results.len() < self.read_quorum {
            let err_msg = format!("Quorum de leitura falhou: {}/{}", results.len(), self.replicas.len());
            error!("{}", err_msg);
            return Err(anyhow!(err_msg));
        }

        if results.is_empty() {
            return Ok(None);
        }

        let mut winner = results[0].clone();
        let mut conflict_detected = false;

        for entry in &results[1..] {
            let (merged, resolved) = ConflictResolver::resolve(&winner, entry);
            winner = merged;
            if !resolved {
                conflict_detected = true;
                warn!("Conflito detectado para chave {}: resolvido com timestamp mais recente", key);
            }
        }

        for replica in &self.replicas {
            if let Ok(Some(current)) = replica.read(key).await {
                if current.version != winner.version {
                    let _ = replica.write(key, &winner).await;
                }
            } else {
                let _ = replica.write(key, &winner).await;
            }
        }

        if conflict_detected {
            warn!("Conflito resolvido para chave {} com vetor {:?}", key, winner.version);
        }

        Ok(Some(winner))
    }
}

pub struct MemoryReplicaStorage<T> {
    node_id: NodeId,
    data: Arc<RwLock<HashMap<String, VersionedEntry<T>>>>,
}

impl<T: Clone + Send + Sync + 'static> MemoryReplicaStorage<T> {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            node_id,
            data: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait::async_trait]
impl<T: Clone + Send + Sync + 'static> ReplicaStorage<T> for MemoryReplicaStorage<T> {
    async fn read(&self, key: &str) -> Result<Option<VersionedEntry<T>>> {
        let data = self.data.read().await;
        Ok(data.get(key).cloned())
    }

    async fn write(&self, key: &str, entry: &VersionedEntry<T>) -> Result<()> {
        let mut data = self.data.write().await;
        data.insert(key.to_string(), entry.clone());
        Ok(())
    }

    async fn read_all(&self) -> Result<HashMap<String, VersionedEntry<T>>> {
        let data = self.data.read().await;
        Ok(data.clone())
    }
}
