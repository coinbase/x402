use std::sync::Arc;
use clap::Parser;
use tokio::sync::{mpsc, RwLock};
use tokio_util::sync::CancellationToken;
use tracing_subscriber;
use tracing::{info, error};
use std::net::SocketAddr;
use tokio::select;

pub mod cathedral {
    pub mod v1 {
        tonic::include_proto!("cathedral.v1");
        pub const FILE_DESCRIPTOR_SET: &[u8] = tonic::include_file_descriptor_set!("cathedral_descriptor");
    }
}

pub mod grpc_service;
pub mod tree_validator;
pub mod wormgraph_client;
pub mod governance_hook;
pub mod ethical_filter;
pub mod health;
pub mod metrics;

pub use grpc_service::CathedralGrpcService;
pub use tree_validator::TreeManager;
pub use wormgraph_client::WormGraphClient;
pub use governance_hook::{HierarchicalEthicalGuardian, HierarchicalGovernanceConfig};
use cathedral_atlassian::jira_client::JiraClient;

#[derive(Parser)]
#[command(name = "cathedral-bridge", about = "Cathedral ARKHE Bridge Server")]
struct Args {
    #[arg(short, long, default_value = "0.0.0.0:9002")]
    addr: String,

    #[arg(long, default_value = "./wormgraph_data")]
    data_dir: String,

    #[arg(long, default_value = "default-tree")]
    default_tree: String,

    #[arg(long, default_value = "coordinator-1")]
    root_agent: String,

    #[arg(long, default_value = "coordinator")]
    root_role: String,

    #[arg(long)]
    jira_endpoint: Option<String>,

    #[arg(long)]
    jira_token: Option<String>,

    #[arg(long)]
    cem_project_key: Option<String>,

    #[arg(short, long, default_value = "info")]
    log_level: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    tracing_subscriber::fmt()
        .with_env_filter(&args.log_level)
        .init();

    info!("🏛️ Cathedral Bridge v{}", env!("CARGO_PKG_VERSION"));
    info!("   Listening on: {}", args.addr);
    info!("   Data dir: {}", args.data_dir);
    info!("   Tree: {}", args.default_tree);

    let tree_manager = Arc::new(RwLock::new(TreeManager::new()));
    {
        let mut tm = tree_manager.write().await;
        tm.register_tree(&args.default_tree, &args.root_agent, &args.root_role)?;
        info!("🌳 Árvore '{}' registrada", args.default_tree);
    }

    use arkhe_wormgraph::storage_file::{HardenedFileStorage, FileStorageConfig};
    let storage = Arc::new(
        HardenedFileStorage::new(FileStorageConfig {
            base_path: std::path::PathBuf::from(&args.data_dir),
            enable_compaction: true,
            enable_retention: true,
            ..Default::default()
        }).await?
    );
    let wormgraph = Arc::new(WormGraphClient::new_with_storage(storage));
    info!("🗄️ WormGraph storage inicializado");

    let (tx, _) = mpsc::channel(100);

    let guardian = Arc::new(HierarchicalEthicalGuardian::new(
        HierarchicalGovernanceConfig::default(),
        tree_manager.clone(),
        tx,
    ));

    let service = CathedralGrpcService::new(
        tree_manager.clone(),
        wormgraph.clone(),
        guardian,
    );

    let cancellation_token = CancellationToken::new();
    let ctrl_c_token = cancellation_token.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        info!("🛑 Recebido Ctrl+C, iniciando graceful shutdown...");
        ctrl_c_token.cancel();
    });

    let grpc_addr: SocketAddr = args.addr.parse()?;

    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(crate::cathedral::v1::FILE_DESCRIPTOR_SET)
        .build()?;

    let grpc_server = tonic::transport::Server::builder()
        .layer(tower_http::compression::CompressionLayer::new())
        .add_service(cathedral::v1::cathedral_bridge_server::CathedralBridgeServer::new(service))
        .add_service(reflection_service)
        .serve_with_shutdown(grpc_addr, async {
            cancellation_token.cancelled().await;
            info!("🛑 Servidor encerrando...");
        });

    let http_addr: SocketAddr = "0.0.0.0:8080".parse()?;
    let health_app = health::health_router().merge(metrics::metrics_router());
    let http_listener = tokio::net::TcpListener::bind(&http_addr).await?;
    let http_server = axum::serve(http_listener, health_app.into_make_service());

    info!("🚀 gRPC em {} e HTTP healthcheck/metrics em {}", grpc_addr, http_addr);

    select! {
        res = grpc_server => {
            if let Err(e) = res {
                error!("gRPC server error: {}", e);
            } else {
                info!("gRPC servidor encerrado");
            }
        },
        res = http_server => {
             if let Err(e) = res {
                error!("HTTP server error: {}", e);
            } else {
                info!("HTTP healthcheck encerrado");
            }
        },
    }

    info!("👋 Servidor encerrado");
    Ok(())
}
