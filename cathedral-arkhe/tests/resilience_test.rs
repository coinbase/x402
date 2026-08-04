use anyhow::Result;
use arkhe_wormgraph::{
    replication::{QuorumStorage, MemoryReplicaStorage, VersionedEntry, OperationType},
    client::WormGraphClient,
};
use observer_5d::{Observer5D, Observer5DConfig};
use arkhe_test_utils::fault_injection::{FaultyReplicaStorage, FaultType};
use arkhe_test_utils::mock_council::{ConfigurableMockAgent, CouncilTestFactory, AgentBehavior};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::sleep;
use tracing::{info, warn, error};
use tracing_subscriber;

async fn setup_resilience_test(
    fault_rate: f64,
    fault_type: FaultType,
) -> Result<(
    Arc<QuorumStorage<String>>,
    Arc<FaultyReplicaStorage<String>>,
    Arc<FaultyReplicaStorage<String>>,
    Arc<FaultyReplicaStorage<String>>,
)> {
    let inner1 = Arc::new(MemoryReplicaStorage::new("node1".to_string()));
    let inner2 = Arc::new(MemoryReplicaStorage::new("node2".to_string()));
    let inner3 = Arc::new(MemoryReplicaStorage::new("node3".to_string()));

    let faulty1 = Arc::new(FaultyReplicaStorage::new(inner1, "node1", fault_rate, fault_type));
    let faulty2 = Arc::new(FaultyReplicaStorage::new(inner2, "node2", fault_rate, fault_type));
    let faulty3 = Arc::new(FaultyReplicaStorage::new(inner3, "node3", fault_rate, fault_type));

    let quorum = Arc::new(QuorumStorage::new(vec![
        faulty1.clone(),
        faulty2.clone(),
        faulty3.clone(),
    ]));

    Ok((quorum, faulty1, faulty2, faulty3))
}

#[tokio::test]
async fn test_network_fault_injection() -> Result<()> {
    tracing_subscriber::fmt::try_init().ok();
    info!("🔌 Teste: Injeção de falhas de rede");

    let (quorum, f1, f2, f3) = setup_resilience_test(0.3, FaultType::NetworkError).await?;

    let entry = VersionedEntry::new(
        "test_data".to_string(),
        "node1".to_string(),
        OperationType::Insert,
    );

    let start = Instant::now();
    let mut successes = 0;
    let mut failures = 0;

    for i in 0..20 {
        let key = format!("key-{}", i);
        match quorum.write_quorum(&key, &entry).await {
            Ok(_) => successes += 1,
            Err(e) => {
                failures += 1;
                info!("Falha {}: {}", i, e);
            }
        }
    }

    let elapsed = start.elapsed();
    info!(
        "✅ Falhas de rede: {} sucessos, {} falhas em {:.2?}",
        successes, failures, elapsed
    );

    assert!(successes > 10, "Muitas falhas: {}", successes);
    assert!(failures < 10, "Poucas falhas: {}", failures);

    Ok(())
}
