use anyhow::Result;
use tonic::transport::Channel;

pub struct GrpcClient {
    _channel: Channel,
}

impl GrpcClient {
    pub async fn connect(endpoint: &str) -> Result<Self> {
        let endpoint = endpoint.strip_prefix("grpc://").unwrap_or(endpoint);
        let channel = Channel::from_shared(format!("http://{}", endpoint))?
            .connect()
            .await?;
        Ok(Self { _channel: channel })
    }
}
