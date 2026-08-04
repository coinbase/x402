cat << 'EOF2' > cathedral-arkhe/sail-zk-pipeline/src/lib.rs
use anyhow::{anyhow, Result};
use arkhe_zk_circuits::{PhysicalConstraintProofGenerator, PhysicalConstraintType, ZkProof, ZkBackend};
use arkhe_zk_risc0::Risc0Backend;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{debug, error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZkProofJob {
    pub job_id: String,
    pub design_hash: String,
    pub constraint_type: PhysicalConstraintType,
    pub parameters: serde_json::Value,
    pub sail_query_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZkProofResult {
    pub job_id: String,
    pub proof: ZkProof,
    pub public_inputs: Vec<u64>,
    pub verified: bool,
    pub proving_time_ms: u64,
    pub error: Option<String>,
}

pub struct ZkPipeline {
    job_tx: mpsc::Sender<ZkProofJob>,
    pending: Arc<RwLock<HashMap<String, oneshot::Sender<ZkProofResult>>>>,
    backend: Arc<dyn ZkBackend + Send + Sync>,
    result_broadcast_tx: tokio::sync::broadcast::Sender<ZkProofResult>,
}

impl ZkPipeline {
    pub async fn new(num_workers: usize) -> Result<Self> {
        let backend = Arc::new(Risc0Backend::new()?);
        Self::new_internal(num_workers, backend).await
    }

    pub async fn new_with_mock(num_workers: usize) -> Result<Self> {
        struct MockBackend;
        impl ZkBackend for MockBackend {
            fn generate_proof(&self, _constraint_type: PhysicalConstraintType, _design_hash: &str, _parameters: &serde_json::Value) -> Result<ZkProof> {
                Ok(ZkProof {
                    proof_bytes: vec![],
                    public_inputs: vec![],
                    circuit_id: "mock".to_string(),
                    verification_key_hash: "".to_string(),
                })
            }
            fn verify_proof(&self, _proof: &ZkProof) -> Result<bool> {
                Ok(true)
            }
        }
        let backend = Arc::new(MockBackend);
        Self::new_internal(num_workers, backend).await
    }

    async fn new_internal(num_workers: usize, backend: Arc<dyn ZkBackend + Send + Sync>) -> Result<Self> {
        let (job_tx, job_rx) = async_channel::unbounded();
        let pending: Arc<RwLock<HashMap<String, oneshot::Sender<ZkProofResult>>>> = Arc::new(RwLock::new(HashMap::new()));
        let (result_broadcast_tx, _) = tokio::sync::broadcast::channel(1000);

        for worker_id in 0..num_workers {
            let backend_clone = backend.clone();
            let pending_clone = pending.clone();
            let broadcast_tx = result_broadcast_tx.clone();
            let rx = job_rx.clone();

            tokio::spawn(async move {
                info!("🧵 Worker ZK {} iniciado", worker_id);
                while let Ok(job) = rx.recv().await {
                    let start = std::time::Instant::now();
                    let result = Self::process_job(backend_clone.as_ref(), &job).await;
                    let elapsed = start.elapsed().as_millis() as u64;

                    let final_result = match result {
                        Ok(proof_result) => {
                            debug!("Job {} concluído em {}ms", job.job_id, elapsed);
                            ZkProofResult {
                                job_id: job.job_id.clone(),
                                proof: proof_result.clone(),
                                public_inputs: proof_result.public_inputs,
                                verified: true,
                                proving_time_ms: elapsed,
                                error: None,
                            }
                        }
                        Err(e) => {
                            error!("Job {} falhou: {}", job.job_id, e);
                            ZkProofResult {
                                job_id: job.job_id.clone(),
                                proof: ZkProof {
                                    proof_bytes: vec![],
                                    public_inputs: vec![],
                                    circuit_id: "error".to_string(),
                                    verification_key_hash: "".to_string(),
                                },
                                public_inputs: vec![],
                                verified: false,
                                proving_time_ms: elapsed,
                                error: Some(e.to_string()),
                            }
                        }
                    };

                    let _ = broadcast_tx.send(final_result.clone());

                    if let Some(tx) = pending_clone.write().await.remove(&job.job_id) {
                        let _ = tx.send(final_result);
                    }
                }
            });
        }

        let (job_tx_mpsc, mut job_rx_mpsc) = mpsc::channel(1000);
        let job_tx_ac = job_tx.clone();
        tokio::spawn(async move {
            while let Some(job) = job_rx_mpsc.recv().await {
                let _ = job_tx_ac.send(job).await;
            }
        });

        Ok(Self {
            job_tx: job_tx_mpsc,
            pending,
            backend,
            result_broadcast_tx,
        })
    }

    async fn process_job(
        backend: &dyn ZkBackend,
        job: &ZkProofJob,
    ) -> Result<ZkProof> {
        let generator = PhysicalConstraintProofGenerator::new(Box::new(backend));
        generator.generate_proof(job.constraint_type, &job.design_hash, &job.parameters)
    }

    pub async fn submit_job(&self, job: ZkProofJob) -> Result<ZkProofResult> {
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.write().await;
            pending.insert(job.job_id.clone(), tx);
        }

        self.job_tx.send(job).await?;

        rx.await
            .map_err(|e| anyhow!("Job cancelado ou worker falhou: {}", e))
    }

    pub async fn submit_batch(&self, jobs: Vec<ZkProofJob>) -> Result<Vec<ZkProofResult>> {
        if jobs.is_empty() {
            return Ok(Vec::new());
        }

        info!("📦 Submetendo batch de {} jobs ZK", jobs.len());

        let mut receivers = Vec::with_capacity(jobs.len());
        let mut job_ids = Vec::with_capacity(jobs.len());

        for job in jobs {
            let (tx, rx) = oneshot::channel();
            let job_id = job.job_id.clone();
            {
                let mut pending = self.pending.write().await;
                pending.insert(job_id.clone(), tx);
            }
            self.job_tx.send(job).await?;
            receivers.push(rx);
            job_ids.push(job_id);
        }

        let mut results = Vec::with_capacity(receivers.len());
        for (rx, job_id) in receivers.into_iter().zip(job_ids) {
            match rx.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    error!("Falha ao aguardar job {}: {}", job_id, e);
                    results.push(ZkProofResult {
                        job_id,
                        proof: ZkProof {
                            proof_bytes: vec![],
                            public_inputs: vec![],
                            circuit_id: "error".to_string(),
                            verification_key_hash: "".to_string(),
                        },
                        public_inputs: vec![],
                        verified: false,
                        proving_time_ms: 0,
                        error: Some(format!("Oneshot cancelado: {}", e)),
                    });
                }
            }
        }

        info!("✅ Batch concluído: {} resultados", results.len());
        Ok(results)
    }

    pub async fn process_sail_dataframe(
        &self,
        rows: Vec<serde_json::Value>,
        constraint_type: PhysicalConstraintType,
    ) -> Result<Vec<ZkProofResult>> {
        let mut jobs = Vec::new();
        for row in rows {
            let design_hash = row
                .get("design_hash")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let job = ZkProofJob {
                job_id: uuid::Uuid::new_v4().to_string(),
                design_hash,
                constraint_type,
                parameters: row,
                sail_query_id: Some(format!("sail-query-{}", uuid::Uuid::new_v4())),
            };
            jobs.push(job);
        }

        self.submit_batch(jobs).await
    }

    pub fn subscribe_results(&self) -> tokio::sync::broadcast::Receiver<ZkProofResult> {
        self.result_broadcast_tx.subscribe()
    }
}
EOF2
echo 'async-channel = "1.9.0"' >> cathedral-arkhe/sail-zk-pipeline/Cargo.toml
