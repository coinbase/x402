use crate::proxy::SageMakerProxy;
use crate::attestation::verify_attestation_document;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub async fn handle_connection<S>(mut stream: S, proxy: Arc<SageMakerProxy>) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let mut buffer = [0; 4096];
    let n = stream.read(&mut buffer).await?;

    if n == 0 {
        return Ok(());
    }

    let input_data = buffer[..n].to_vec();

    // 1. Attestation Check
    // In a real protocol, the client would send its attestation document as part of the handshake or request headers.
    // Here we'll simulate extracting it from the start of the request or assume it's pre-verified during TLS handshake.
    // For this example, we'll verify a dummy document.
    let dummy_doc = crate::attestation::generate_attestation_document().unwrap();
    if !verify_attestation_document(&dummy_doc) {
         let response = "HTTP/1.1 401 Unauthorized\r\n\r\nAttestation Verification Failed";
         stream.write_all(response.as_bytes()).await?;
         return Err("Attestation verification failed".into());
    }

    // 2. Delegate to proxy
    let hyperparameters = serde_json::json!({});

    match proxy.train(input_data, hyperparameters).await {
        Ok(arn) => {
            let response = format!("HTTP/1.1 200 OK\r\n\r\nJob ARN: {}", arn);
            stream.write_all(response.as_bytes()).await?;
        }
        Err(e) => {
            let response = format!("HTTP/1.1 500 Internal Server Error\r\n\r\nError: {}", e);
            stream.write_all(response.as_bytes()).await?;
        }
    }

    Ok(())
}

pub async fn handle_connection_insecure<S>(stream: S, proxy: Arc<SageMakerProxy>) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    handle_connection(stream, proxy).await
}
