pub mod fault_injection {
    use crate::replication::{ReplicaStorage, VersionedEntry};
    use anyhow::Result;
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::time::Duration;

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum FaultType {
        Timeout,
        NetworkError,
        DataCorruption,
        Latency(Duration),
        Partition { peers_visible: () },
    }

    pub struct FaultyReplicaStorage<T> {
        inner: Arc<dyn ReplicaStorage<T>>,
        node_id: String,
        fault_rate: f64,
        fault_type: FaultType,
    }

    impl<T: Clone + Send + Sync + 'static> FaultyReplicaStorage<T> {
        pub fn new(
            inner: Arc<dyn ReplicaStorage<T>>,
            node_id: &str,
            fault_rate: f64,
            fault_type: FaultType,
        ) -> Self {
            Self {
                inner,
                node_id: node_id.to_string(),
                fault_rate,
                fault_type,
            }
        }
    }

    #[async_trait]
    impl<T: Clone + Send + Sync + 'static> ReplicaStorage<T> for FaultyReplicaStorage<T> {
        async fn read(&self, key: &str) -> Result<Option<VersionedEntry<T>>> {
            self.inner.read(key).await
        }

        async fn write(&self, key: &str, entry: &VersionedEntry<T>) -> Result<()> {
            self.inner.write(key, entry).await
        }

        async fn read_all(&self) -> Result<HashMap<String, VersionedEntry<T>>> {
            self.inner.read_all().await
        }
    }
}
