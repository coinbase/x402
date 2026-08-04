mod proto {
    tonic::include_proto!("cathedral.v1");
}

use anyhow::Result;
use arkhe_bridge::{CathedralGrpcService, TreeManager, WormGraphClient, HierarchicalEthicalGuardian, HierarchicalGovernanceConfig};
use arkhe_wormgraph::storage_file::{HardenedFileStorage, FileStorageConfig};
use cathedral_sdk::{CathedralSdk, CathedralSdkConfig};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tokio::time::sleep;
use tonic::transport::Server;
use tracing::info;

async fn spawn_bridge(port: u16) -> (tonic::transport::server::JoinedHandle, String) {
    let addr = format!("0.0.0.0:{}", port).parse().unwrap();
    let endpoint = format!("http://localhost:{}", port);

    let tree_manager = Arc::new(RwLock::new(TreeManager::new()));
    {
        let mut tm = tree_manager.write().await;
        tm.register_tree("test-tree", "coordinator-1", "coordinator").unwrap();
    }

    let storage = Arc::new(
        HardenedFileStorage::new(FileStorageConfig {
            base_path: std::path::PathBuf::from("/tmp/cathedral_test_integration"),
            enable_compaction: false,
            enable_retention: false,
            ..Default::default()
        }).await.unwrap()
    );
    let wormgraph = Arc::new(WormGraphClient::new_with_storage(storage));

    let (tx, _) = mpsc::channel(10);
    let guardian = Arc::new(HierarchicalEthicalGuardian::new(
        HierarchicalGovernanceConfig::default(),
        tree_manager.clone(),
        tx,
    ));

    let service = CathedralGrpcService::new(tree_manager, wormgraph, guardian);

    let handle = tokio::spawn(async move {
        Server::builder()
            .add_service(proto::cathedral_bridge_server::CathedralBridgeServer::new(service))
            .serve(addr)
            .await
            .unwrap();
    });

    sleep(Duration::from_secs(1)).await;
    (handle, endpoint)
}

#[tokio::test]
async fn test_integration_real_bridge() -> Result<()> {
    tracing_subscriber::fmt::try_init().ok();

    let port = 9003;
    let (bridge_handle, _endpoint) = spawn_bridge(port).await;

    let sdk_config = CathedralSdkConfig {
        bridge_endpoint: format!("http://localhost:{}", port),
        project_id: "test-project".to_string(),
        agent_id: "test-agent".to_string(),
        compression_enabled: false,
        max_retries: 2,
        local_logging_enabled: true,
        ..Default::default()
    };
    let sdk = CathedralSdk::new(sdk_config).await?;

    let event_id = "integration-test-event-001".to_string();
    sdk.emit_design_proposed(
        event_id.clone(),
        vec!["parent-xyz".to_string()],
        serde_json::json!({
            "design": "test",
            "safety_factor": 2.0,
        }),
        "Test integration".to_string(),
    ).await?;

    sleep(Duration::from_secs(2)).await;

    use proto::cathedral_bridge_client::CathedralBridgeClient;
    let mut client = CathedralBridgeClient::connect(format!("http://localhost:{}", port)).await?;
    let query_resp = client
        .query_provenance(proto::QueryProvenanceRequest {
            project_id: "test-project".to_string(),
            design_hash: Some(event_id.clone()),
            agent_id: None,
            tree_id: None,
            limit: 10,
        })
        .await?;

    let entries = query_resp.into_inner().entries;
    assert!(!entries.is_empty(), "Nenhum evento encontrado");
    assert_eq!(entries[0].id, event_id, "Evento não corresponde");

    info!("✅ Teste integrado com Bridge real passou!");

    bridge_handle.abort();
    Ok(())
}
