use anyhow::{anyhow, Result};
use arkhe_wormgraph::replication::{ReplicaStorage, VersionedEntry};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

pub type NodeId = String;
pub type PartitionTable = HashMap<NodeId, Vec<NodeId>>;

pub struct GranularPartitionQuorumStorage<T> {
    replicas: Vec<Arc<dyn ReplicaStorage<T>>>,
    node_ids: Vec<String>,
    current_node: String,
    partition_table: Arc<RwLock<PartitionTable>>,
    read_quorum: usize,
    write_quorum: usize,
    pub permissive_mode: bool,
}

impl<T: Clone + Send + Sync + 'static> GranularPartitionQuorumStorage<T> {
    pub fn new(
        replicas: Vec<Arc<dyn ReplicaStorage<T>>>,
        node_ids: Vec<String>,
        current_node: &str,
        partition_table: Arc<RwLock<PartitionTable>>,
        permissive_mode: bool,
    ) -> Self {
        let n = replicas.len();
        let read_quorum = (n / 2) + 1;
        let write_quorum = (n / 2) + 1;

        Self {
            replicas,
            node_ids,
            current_node: current_node.to_string(),
            partition_table,
            read_quorum,
            write_quorum,
            permissive_mode,
        }
    }

    async fn visible_replicas(&self) -> Result<Vec<(usize, Arc<dyn ReplicaStorage<T>>)>> {
        let table = self.partition_table.read().await;
        let visible_peers = table.get(&self.current_node);

        let visible_peers = if let Some(peers) = visible_peers {
            peers.clone()
        } else if self.permissive_mode {
            self.node_ids.clone()
        } else {
            return Err(anyhow!(
                "Nó {} não encontrado na tabela de partição e permissive_mode=false",
                self.current_node
            ));
        };

        let mut visible = Vec::new();
        for (idx, node_id) in self.node_ids.iter().enumerate() {
            if node_id == &self.current_node || visible_peers.contains(node_id) {
                visible.push((idx, self.replicas[idx].clone()));
            }
        }

        Ok(visible)
    }

    pub async fn write_quorum(&self, key: &str, entry: &VersionedEntry<T>) -> Result<()> {
        let visible = self.visible_replicas().await?;

        if visible.len() < self.write_quorum {
            return Err(anyhow!(
                "Quorum de escrita não atingido: visíveis {}/{} (necessário {})",
                visible.len(),
                self.replicas.len(),
                self.write_quorum
            ));
        }

        let mut successes = 0;
        let mut errors = Vec::new();

        for (idx, replica) in visible {
            match replica.write(key, entry).await {
                Ok(_) => successes += 1,
                Err(e) => {
                    errors.push((self.node_ids[idx].clone(), e));
                }
            }
        }

        if successes >= self.write_quorum {
            Ok(())
        } else {
            let err_msg = format!(
                "Quorum de escrita falhou: {}/{} (visíveis {})",
                successes,
                self.replicas.len(),
                self.visible_replicas().await?.len()
            );
            warn!("{}", err_msg);
            Err(anyhow!(err_msg))
        }
    }

    pub async fn read_quorum(&self, key: &str) -> Result<Option<VersionedEntry<T>>> {
        let visible = self.visible_replicas().await?;

        if visible.len() < self.read_quorum {
            return Err(anyhow!(
                "Quorum de leitura não atingido: visíveis {}/{} (necessário {})",
                visible.len(),
                self.replicas.len(),
                self.read_quorum
            ));
        }

        let mut results = Vec::new();
        let mut errors = Vec::new();

        for (idx, replica) in visible {
            match replica.read(key).await {
                Ok(Some(entry)) => results.push((self.node_ids[idx].clone(), entry)),
                Ok(None) => {}
                Err(e) => {
                    errors.push((self.node_ids[idx].clone(), e));
                }
            }
        }

        if results.is_empty() {
            return Ok(None);
        }

        use arkhe_wormgraph::replication::ConflictResolver;
        let mut winner = results[0].1.clone();
        let mut conflict_detected = false;

        for (_, entry) in &results[1..] {
            let (merged, resolved) = ConflictResolver::resolve(&winner, entry);
            winner = merged;
            if !resolved {
                conflict_detected = true;
            }
        }

        let visible_again = self.visible_replicas().await?;
        for (idx, replica) in visible_again {
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

pub fn create_ring_partition(num_nodes: usize) -> PartitionTable {
    let mut table = HashMap::new();
    for i in 0..num_nodes {
        let node_id = format!("node{}", i + 1);
        let mut visible = Vec::new();
        visible.push(node_id.clone());
        visible.push(format!("node{}", ((i + 1) % num_nodes) + 1));
        visible.push(format!("node{}", ((i + num_nodes - 1) % num_nodes) + 1));
        table.insert(node_id, visible);
    }
    table
}

pub fn create_split_brain_partition(num_nodes: usize, isolated_node: usize) -> PartitionTable {
    let mut table = HashMap::new();
    for i in 0..num_nodes {
        let node_id = format!("node{}", i + 1);
        let mut visible = Vec::new();
        if i + 1 == isolated_node {
            visible.push(node_id.clone());
        } else {
            for j in 0..num_nodes {
                if j != isolated_node - 1 {
                    visible.push(format!("node{}", j + 1));
                }
            }
        }
        table.insert(node_id, visible);
    }
    table
}
