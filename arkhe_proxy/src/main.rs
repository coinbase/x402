mod proxy;
mod server;
mod attestation;

use proxy::SageMakerProxy;
use std::sync::Arc;
use tokio::net::TcpListener;
use rustls::ServerConfig;
use rustls::server::WebPkiClientVerifier;
use rustls_pemfile::{certs, rsa_private_keys};
use std::fs::File;
use std::io::BufReader;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Starting Arkhe SageMaker Proxy...");

    // 1. Load AWS Config
    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let sagemaker_client = aws_sdk_sagemaker::Client::new(&config);
    let s3_client = aws_sdk_s3::Client::new(&config);

    let proxy = SageMakerProxy::new(
        sagemaker_client,
        s3_client,
        "dummy-kms-key".to_string(),
        "arkhe-training-bucket".to_string(),
    );

    let proxy_arc = Arc::new(proxy);

    // 2. Setup mTLS
    if std::path::Path::new("cert.pem").exists() && std::path::Path::new("key.pem").exists() && std::path::Path::new("ca.pem").exists() {
        println!("Certificates found, setting up mTLS...");

        // Load server certs
        let cert_file = &mut BufReader::new(File::open("cert.pem")?);
        let key_file = &mut BufReader::new(File::open("key.pem")?);

        let cert_chain: Vec<_> = certs(cert_file).map(|res| res.unwrap()).collect();
        let mut keys: Vec<_> = rsa_private_keys(key_file).map(|res| res.unwrap()).collect();

        if keys.is_empty() {
            return Err("No RSA private key found".into());
        }

        // Load Client CA
        let ca_file = &mut BufReader::new(File::open("ca.pem")?);
        let mut client_auth_roots = rustls::RootCertStore::empty();
        for cert in certs(ca_file) {
             client_auth_roots.add(cert?)?;
        }

        let client_verifier = WebPkiClientVerifier::builder(client_auth_roots.into())
             .build()?;

        let tls_config = ServerConfig::builder()
            .with_client_cert_verifier(client_verifier)
            .with_single_cert(cert_chain, rustls::pki_types::PrivateKeyDer::Pkcs1(keys.remove(0)))?;

        let tls_acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(tls_config));
        let listener = TcpListener::bind("0.0.0.0:8443").await?;

        println!("Listening on 0.0.0.0:8443 with mTLS");

        loop {
            let (stream, _) = listener.accept().await?;
            let acceptor = tls_acceptor.clone();
            let proxy_clone = proxy_arc.clone();

            tokio::spawn(async move {
                match acceptor.accept(stream).await {
                    Ok(tls_stream) => {
                        if let Err(e) = server::handle_connection(tls_stream, proxy_clone).await {
                            eprintln!("Error handling connection: {}", e);
                        }
                    }
                    Err(e) => eprintln!("TLS error: {}", e),
                }
            });
        }
    } else {
        println!("WARNING: Certificates not found! Running in insecure mode on port 8080");
        let listener = TcpListener::bind("0.0.0.0:8080").await?;

        loop {
            let (stream, _) = listener.accept().await?;
            let proxy_clone = proxy_arc.clone();

            tokio::spawn(async move {
                if let Err(e) = server::handle_connection_insecure(stream, proxy_clone).await {
                    eprintln!("Error handling connection: {}", e);
                }
            });
        }
    }
}
