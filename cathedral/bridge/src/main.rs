mod grpc_service;

use tonic::transport::Server;
use grpc_service::pb::cathedral_bridge_server::CathedralBridgeServer;
use grpc_service::MyCathedralBridge;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "[::1]:50051".parse()?;
    let bridge = MyCathedralBridge::default();

    println!("CathedralBridge listening on {}", addr);

    Server::builder()
        .add_service(CathedralBridgeServer::new(bridge))
        .serve(addr)
        .await?;

    Ok(())
}
