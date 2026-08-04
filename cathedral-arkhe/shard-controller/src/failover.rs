use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, RwLock};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

use arkhe_wormgraph::storage::ShardStorage;

#[derive(Debug, Clone)]
pub struct FailoverConfig {
    pub heartbeat_interval_secs: u64,
    pub lease_duration_secs: u64,
    pub election_timeout_secs: u64,
    pub migration_batch_size: usize,
    pub max_migration_retries: u32,
}

impl Default for FailoverConfig {
    fn default() -> Self {
        Self {
            heartbeat_interval_secs: 5,
            lease_duration_secs: 15,
            election_timeout_secs: 10,
            migration_batch_size: 1000,
            max_migration_retries: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lease {
    pub holder: String,
    pub expires_at: i64,
    pub version: u64,
}

impl Lease {
    pub fn new(holder: &str, duration: Duration) -> Self {
        let expires = chrono::Utc::now() + chrono::Duration::from_std(duration).unwrap();
        Self {
            holder: holder.to_string(),
            expires_at: expires.timestamp(),
            version: 0,
        }
    }

    pub fn is_expired(&self) -> bool {
        chrono::Utc::now().timestamp() > self.expires_at
    }

    pub fn renew(&mut self, duration: Duration) {
        let expires = chrono::Utc::now() + chrono::Duration::from_std(duration).unwrap();
        self.expires_at = expires.timestamp();
        self.version += 1;
    }
}

pub struct LeaderElection {
    node_id: String,
    storage: Arc<dyn ShardStorage>,
    config: FailoverConfig,
    lease: Arc<RwLock<Option<Lease>>>,
    leadership_tx: mpsc::Sender<bool>,
}

impl LeaderElection {
    pub fn new(
        node_id: &str,
        storage: Arc<dyn ShardStorage>,
        config: FailoverConfig,
    ) -> (Self, mpsc::Receiver<bool>) {
        let (tx, rx) = mpsc::channel(10);
        (
            Self {
                node_id: node_id.to_string(),
                storage,
                config,
                lease: Arc::new(RwLock::new(None)),
                leadership_tx: tx,
            },
            rx,
        )
    }

    pub async fn try_acquire_leader(&self) -> Result<bool> {
        let lock_key = "cathedral/leader/lease";
        let lease_duration = Duration::from_secs(self.config.lease_duration_secs);

        let current_lease: Option<Lease> = self.storage
            .read_metadata(0)
            .await?
            .and_then(|meta| {
                meta.extra
                    .get("lease")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
            });

        let should_acquire = match current_lease {
            Some(ref lease) if lease.is_expired() => true,
            None => true,
            Some(_) => false,
        };

        if !should_acquire {
            return Ok(false);
        }

        let new_lease = Lease::new(&self.node_id, lease_duration);
        let new_version = current_lease.clone().map(|l| l.version + 1).unwrap_or(1);
        let new_lease = Lease { version: new_version, ..new_lease };

        let current = self.storage.read_metadata(0).await?;
        let current_version = current
            .as_ref()
            .and_then(|meta| meta.extra.get("lease_version").and_then(|v| v.as_u64()))
            .unwrap_or(0);

        if current_version != current_lease.clone().map(|l| l.version).unwrap_or(0) {
            warn!("CAS falhou: versão divergente");
            return Ok(false);
        }

        let mut meta = current.unwrap_or_else(|| arkhe_wormgraph::storage::ShardMetadata {
            shard_id: 0,
            event_count: 0,
            first_timestamp: 0,
            last_timestamp: 0,
            size_bytes: 0,
            merkle_root: vec![],
            version: 0,
            extra: HashMap::new(),
        });
        meta.extra.insert("lease".to_string(), serde_json::to_value(&new_lease)?);
        meta.extra.insert("lease_version".to_string(), serde_json::json!(new_version));

        self.storage.write_metadata(0, &meta).await?;

        {
            let mut lease_guard = self.lease.write().await;
            *lease_guard = Some(new_lease);
        }

        info!("🏆 Nó {} adquiriu liderança (versão {})", self.node_id, new_version);
        let _ = self.leadership_tx.send(true).await;
        Ok(true)
    }

    pub async fn maintain_leadership(&self) -> Result<()> {
        loop {
            let is_leader = {
                let lease_guard = self.lease.read().await;
                match lease_guard.as_ref() {
                    Some(lease) if !lease.is_expired() && lease.holder == self.node_id => true,
                    _ => false,
                }
            };

            if !is_leader {
                self.try_acquire_leader().await?;
            } else {
                let mut lease_guard = self.lease.write().await;
                if let Some(lease) = lease_guard.as_mut() {
                    let new_lease = lease.clone();
                    let new_version = lease.version + 1;
                    let renewed_lease = Lease {
                        version: new_version,
                        holder: lease.holder.clone(),
                        expires_at: (chrono::Utc::now() + chrono::Duration::from_std(Duration::from_secs(self.config.lease_duration_secs)).unwrap()).timestamp(),
                    };

                    let current_meta = self.storage.read_metadata(0).await?;
                    let current_version = current_meta
                        .as_ref()
                        .and_then(|meta| meta.extra.get("lease_version").and_then(|v| v.as_u64()))
                        .unwrap_or(0);

                    if current_version != lease.version {
                        warn!("CAS falhou na renovação: versão divergente");
                        *lease_guard = None;
                        continue;
                    }

                    let mut meta = current_meta.unwrap_or_else(|| arkhe_wormgraph::storage::ShardMetadata {
                        shard_id: 0,
                        event_count: 0,
                        first_timestamp: 0,
                        last_timestamp: 0,
                        size_bytes: 0,
                        merkle_root: vec![],
                        version: 0,
                        extra: HashMap::new(),
                    });
                    meta.extra.insert("lease".to_string(), serde_json::to_value(&renewed_lease)?);
                    meta.extra.insert("lease_version".to_string(), serde_json::json!(new_version));
                    self.storage.write_metadata(0, &meta).await?;

                    *lease = renewed_lease;
                    debug!("🔑 Lease renovado por {} (versão {})", self.node_id, new_version);
                }
            }

            sleep(Duration::from_secs(self.config.heartbeat_interval_secs)).await;
        }
    }

    pub async fn is_leader(&self) -> bool {
        let lease_guard = self.lease.read().await;
        match lease_guard.as_ref() {
            Some(lease) => !lease.is_expired() && lease.holder == self.node_id,
            None => false,
        }
    }
}

pub struct DataMigrator {
    source_storage: Arc<dyn ShardStorage>,
    target_storage: Arc<dyn ShardStorage>,
    config: FailoverConfig,
}

impl DataMigrator {
    pub fn new(
        source: Arc<dyn ShardStorage>,
        target: Arc<dyn ShardStorage>,
        config: FailoverConfig,
    ) -> Self {
        Self {
            source_storage: source,
            target_storage: target,
            config,
        }
    }

    pub async fn migrate_shard(&self, shard_id: u64) -> Result<()> {
        info!("🔄 Iniciando migração do shard {}...", shard_id);

        let source_meta = self.source_storage.read_metadata(shard_id).await?;
        let total_events = source_meta.as_ref().map(|m| m.event_count).unwrap_or(0);

        if total_events == 0 {
            info!("Shard {} vazio, pulando migração", shard_id);
            return Ok(());
        }

        let batch_size = self.config.migration_batch_size;
        let mut offset = 0;
        let mut migrated = 0;

        while offset < total_events as usize {
            let events = self.source_storage
                .read_events(shard_id, offset, batch_size)
                .await?;

            if events.is_empty() {
                break;
            }

            let mut retries = 0;
            while retries < self.config.max_migration_retries {
                match self.target_storage.append_events(shard_id, &events).await {
                    Ok(_) => break,
                    Err(e) => {
                        retries += 1;
                        warn!("Falha ao escrever batch (tentativa {}): {}", retries, e);
                        if retries >= self.config.max_migration_retries {
                            return Err(anyhow!("Falha na migração após {} tentativas", retries));
                        }
                        sleep(Duration::from_secs(2 * retries as u64)).await;
                    }
                }
            }

            offset += events.len();
            migrated += events.len();
            debug!("Migrados {}/{} eventos", migrated, total_events);
        }

        if let Some(meta) = source_meta {
            self.target_storage.write_metadata(shard_id, &meta).await?;
        }

        info!("✅ Migração do shard {} concluída ({} eventos)", shard_id, migrated);
        Ok(())
    }

    pub async fn execute_failover(
        &self,
        dead_shard_id: u64,
        replica_node_id: &str,
    ) -> Result<()> {
        info!("🚨 Executando failover para shard {} no nó {}", dead_shard_id, replica_node_id);

        let source_meta = self.source_storage.read_metadata(dead_shard_id).await?;
        if source_meta.is_none() {
            warn!("Shard {} não tem dados para migrar", dead_shard_id);
            return Ok(());
        }

        self.migrate_shard(dead_shard_id).await?;

        info!("✅ Failover do shard {} concluído", dead_shard_id);
        Ok(())
    }
}
