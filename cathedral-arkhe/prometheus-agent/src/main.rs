use anyhow::Result;
use clap::Parser;
use cathedral_sdk::{CathedralSdk, CathedralSdkConfig};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;
use tracing::{info, error, debug};
use tracing_subscriber;

#[derive(Parser)]
#[command(name = "prometheus-agent", about = "Prometheus Agent for Cathedral ARKHE")]
struct Args {
    #[arg(short, long, default_value = "http://localhost:9002")]
    bridge_endpoint: String,
    #[arg(short, long, default_value = "prometheus-agent")]
    agent_id: String,
    #[arg(short, long, default_value = "default")]
    project_id: String,
    #[arg(short, long, default_value = "30")]
    interval_secs: u64,
    #[arg(short, long, default_value = "false")]
    compression: bool,
    #[arg(short, long, default_value = "false")]
    once: bool,
}

struct PrometheusAgent {
    sdk: Arc<CathedralSdk>,
    agent_id: String,
    project_id: String,
    interval: Duration,
    counter: u64,
}

impl PrometheusAgent {
    pub async fn new(args: &Args) -> Result<Self> {
        let config = CathedralSdkConfig {
            bridge_endpoint: args.bridge_endpoint.clone(),
            project_id: args.project_id.clone(),
            agent_id: args.agent_id.clone(),
            compression_enabled: args.compression,
            max_retries: 3,
            local_logging_enabled: true,
            ..Default::default()
        };
        let sdk = Arc::new(CathedralSdk::new(config).await?);
        Ok(Self {
            sdk,
            agent_id: args.agent_id.clone(),
            project_id: args.project_id.clone(),
            interval: Duration::from_secs(args.interval_secs),
            counter: 0,
        })
    }

    pub async fn run_once(&mut self) -> Result<()> { self.emit_metrics().await }

    pub async fn run_loop(&mut self) -> Result<()> {
        let mut ticker = interval(self.interval);
        loop {
            ticker.tick().await;
            if let Err(e) = self.emit_metrics().await {
                error!("Erro ao emitir métricas: {}", e);
            }
        }
    }

    async fn emit_metrics(&mut self) -> Result<()> {
        self.counter += 1;
        let timestamp = chrono::Utc::now().timestamp();

        let cpu_usage = 20.0 + (rand::random::<f64>() * 60.0);
        let memory_usage = 100.0 + (rand::random::<f64>() * 900.0);
        let request_rate = 10.0 + (rand::random::<f64>() * 90.0);
        let error_rate = rand::random::<f64>() * 0.05;

        let metric_payload = json!({
            "agent_id": self.agent_id,
            "project_id": self.project_id,
            "timestamp": timestamp,
            "counter": self.counter,
            "metrics": {
                "cpu_usage_percent": cpu_usage,
                "memory_usage_mb": memory_usage,
                "request_rate_per_sec": request_rate,
                "error_rate_percent": error_rate,
                "uptime_seconds": self.counter * self.interval.as_secs(),
            },
            "tags": {
                "environment": "production",
                "region": "us-east-1",
                "agent_version": env!("CARGO_PKG_VERSION"),
            }
        });

        debug!("📊 Emitindo métricas (evento #{})", self.counter);
        self.sdk.emit_parameter_change(
            format!("prometheus-metrics-{}", self.counter),
            metric_payload,
            self.agent_id.clone(),
        ).await?;

        info!("📊 Métricas enviadas (evento #{})", self.counter);
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let args = Args::parse();
    info!("🏛️ Prometheus Agent iniciado (Bridge: {})", args.bridge_endpoint);
    let mut agent = PrometheusAgent::new(&args).await?;
    if args.once {
        agent.run_once().await?;
    } else {
        agent.run_loop().await?;
    }
    Ok(())
}
