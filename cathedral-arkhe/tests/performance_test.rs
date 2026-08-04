use anyhow::Result;
use arkhe_wormgraph::replication::{QuorumStorage, MemoryReplicaStorage, VersionedEntry, OperationType};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;
use tracing::{info, warn};
use tracing_subscriber;

#[tokio::test]
async fn test_quorum_latency_under_load() -> Result<()> {
    tracing_subscriber::fmt::try_init().ok();
    info!("📊 Teste: Latência de quorum sob carga");

    let n_replicas = 5;
    let mut replicas = Vec::new();
    for i in 0..n_replicas {
        let r = Arc::new(MemoryReplicaStorage::new(format!("node{}", i)));
        replicas.push(r);
    }
    let quorum = Arc::new(QuorumStorage::new(replicas));

    let entry = VersionedEntry::new(
        "load_test_data".to_string(),
        "node1".to_string(),
        OperationType::Insert,
    );

    let concurrency_levels = vec![1, 5, 10, 25, 50, 100];
    let mut results = Vec::new();

    for &concurrency in &concurrency_levels {
        info!("🚀 Testando com {} workers concorrentes", concurrency);
        let semaphore = Arc::new(Semaphore::new(concurrency));
        let mut handles = Vec::new();

        let start = Instant::now();

        for i in 0..concurrency * 10 {
            let sem = semaphore.clone();
            let q = quorum.clone();
            let key = format!("key-{}-{}", concurrency, i);
            let entry_clone = entry.clone();

            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                let start_op = Instant::now();
                let result = q.write_quorum(&key, &entry_clone).await;
                let elapsed = start_op.elapsed();
                (result.is_ok(), elapsed)
            }));
        }

        let mut successes = 0;
        let mut total_latency = Duration::ZERO;
        let mut latencies = Vec::new();

        for handle in handles {
            if let Ok((ok, latency)) = handle.await {
                if ok { successes += 1; }
                total_latency += latency;
                latencies.push(latency);
            }
        }

        let elapsed_total = start.elapsed();
        let avg_latency = if !latencies.is_empty() {
            total_latency / latencies.len() as u32
        } else {
            Duration::ZERO
        };

        latencies.sort();
        let p50 = latencies.get(latencies.len() / 2).unwrap_or(&Duration::ZERO);
        let p95 = latencies.get((latencies.len() * 95) / 100).unwrap_or(&Duration::ZERO);
        let p99 = latencies.get((latencies.len() * 99) / 100).unwrap_or(&Duration::ZERO);

        results.push((
            concurrency,
            elapsed_total,
            avg_latency,
            *p50,
            *p95,
            *p99,
            successes,
        ));

        info!(
            "✅ Concorrência {}: {} sucessos, duração {:.2?}, média {:.2?}, p50 {:.2?}, p95 {:.2?}, p99 {:.2?}",
            concurrency,
            successes,
            elapsed_total,
            avg_latency,
            p50,
            p95,
            p99
        );
    }

    let baseline = results[0].2;
    let high_load = results.last().unwrap().2;
    info!(
        "Baseline: {:.2?}, Alta carga: {:.2?}, Fator: {:.2}x",
        baseline,
        high_load,
        if baseline.as_secs_f64() > 0.0 { high_load.as_secs_f64() / baseline.as_secs_f64() } else { 0.0 }
    );

    Ok(())
}
