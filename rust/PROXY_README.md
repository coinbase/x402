# x402 Proxy Server

This document explains how to use the x402 proxy server functionality, which allows you to add payment protection to any existing HTTP service.

## Features

- **Reverse Proxy**: Forward requests to any HTTP service
- **Payment Protection**: Add x402 payment requirements to all requests
- **Configuration**: JSON file or environment variable configuration
- **CDP Integration**: Support for Coinbase CDP authentication
- **Mainnet Support**: Production-ready mainnet configuration

## Quick Start

### 1. Using Configuration File

Create a `config.json` file:

```json
{
  "target_url": "https://api.example.com",
  "amount": 0.01,
  "pay_to": "0x1234567890123456789012345678901234567890",
  "description": "API access fee",
  "facilitator_url": "https://x402.org/facilitator",
  "testnet": true
}
```

Run the proxy server:

```bash
cargo run --example proxy_server config.json
```

### 2. Using Environment Variables

Set environment variables:

```bash
export TARGET_URL="https://api.example.com"
export AMOUNT="0.01"
export PAY_TO="0x1234567890123456789012345678901234567890"
export DESCRIPTION="API access fee"
export TESTNET="true"
```

Run the proxy server:

```bash
cargo run --example proxy_server --env
```

### 3. Mainnet Production Server

For mainnet production use:

```bash
export CDP_API_KEY_ID="your_key_id"
export CDP_API_KEY_SECRET="your_key_secret"
export ADDRESS="your_wallet_address"

cargo run --example mainnet_server
```

## Configuration Options

### ProxyConfig Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target_url` | String | Yes | Target URL to proxy requests to |
| `amount` | f64 | Yes | Payment amount in decimal units |
| `pay_to` | String | Yes | Recipient wallet address |
| `description` | String | No | Payment description |
| `mime_type` | String | No | Expected response MIME type |
| `max_timeout_seconds` | u32 | No | Payment timeout (default: 60) |
| `facilitator_url` | String | No | Facilitator service URL |
| `testnet` | bool | No | Use testnet (default: true) |
| `headers` | Object | No | Additional headers to forward |
| `cdp_api_key_id` | String | No | Coinbase CDP API key ID |
| `cdp_api_key_secret` | String | No | Coinbase CDP API key secret |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TARGET_URL` | Target URL to proxy to |
| `AMOUNT` | Payment amount in decimal units |
| `PAY_TO` | Recipient wallet address |
| `DESCRIPTION` | Payment description |
| `FACILITATOR_URL` | Facilitator service URL |
| `TESTNET` | Use testnet (true/false) |
| `CDP_API_KEY_ID` | Coinbase CDP API key ID |
| `CDP_API_KEY_SECRET` | Coinbase CDP API key secret |

## Examples

### Basic Proxy Server

```rust
use x402::proxy::{ProxyConfig, run_proxy_server};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ProxyConfig {
        target_url: "https://api.example.com".to_string(),
        amount: 0.01,
        pay_to: "0x1234567890123456789012345678901234567890".to_string(),
        description: Some("API access fee".to_string()),
        testnet: true,
        ..Default::default()
    };
    
    run_proxy_server(config, 4021).await?;
    Ok(())
}
```

### CDP-Authenticated Proxy

```rust
use x402::proxy::{ProxyConfig, run_proxy_server};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ProxyConfig {
        target_url: "https://api.example.com".to_string(),
        amount: 0.01,
        pay_to: "0x1234567890123456789012345678901234567890".to_string(),
        description: Some("API access fee".to_string()),
        testnet: false, // Mainnet
        cdp_api_key_id: Some("your_key_id".to_string()),
        cdp_api_key_secret: Some("your_key_secret".to_string()),
        ..Default::default()
    };
    
    run_proxy_server(config, 4021).await?;
    Ok(())
}
```

## API Usage

### Programmatic Usage

```rust
use x402::proxy::{ProxyConfig, create_proxy_server};

// Create configuration
let config = ProxyConfig::from_file("config.json")?;

// Create proxy server
let app = create_proxy_server(config)?;

// Use with Axum
let listener = tokio::net::TcpListener::bind("0.0.0.0:4021").await?;
axum::serve(listener, app).await?;
```

### Integration with Existing Axum Apps

```rust
use x402::proxy::{ProxyConfig, create_proxy_server};

let proxy_config = ProxyConfig::from_env()?;
let proxy_app = create_proxy_server(proxy_config)?;

// Mount proxy at specific path
let app = Router::new()
    .nest("/api", proxy_app)
    .route("/health", get(health_handler));
```

## Security Considerations

1. **CDP Credentials**: Store CDP API credentials securely (environment variables, not in config files)
2. **Mainnet Testing**: Always test with small amounts on mainnet first
3. **Rate Limiting**: Consider adding rate limiting for production use
4. **HTTPS**: Use HTTPS in production for all communications
5. **Validation**: Validate all configuration inputs

## Troubleshooting

### Common Issues

1. **Configuration Validation Errors**
   - Ensure all required fields are provided
   - Check URL formats are valid
   - Verify wallet addresses are properly formatted

2. **CDP Authentication Errors**
   - Verify API key credentials are correct
   - Check that keys have proper permissions
   - Ensure network connectivity to CDP services

3. **Proxy Connection Errors**
   - Verify target URL is accessible
   - Check network connectivity
   - Ensure target service is running

### Debug Mode

Enable debug logging:

```rust
use tracing_subscriber;

tracing_subscriber::fmt()
    .with_max_level(tracing::Level::DEBUG)
    .init();
```

## Migration from Go

The Rust proxy server provides equivalent functionality to the Go version:

| Go Feature | Rust Equivalent |
|------------|-----------------|
| `ProxyConfig` | `ProxyConfig` |
| `proxyHandler` | `proxy_handler` |
| `loadConfig` | `ProxyConfig::from_file` |
| Environment variables | `ProxyConfig::from_env` |
| CDP authentication | `coinbase::create_auth_headers` |

## Performance

The Rust proxy server is designed for high performance:

- **Async/Await**: Non-blocking I/O operations
- **Connection Pooling**: Reuses HTTP connections
- **Minimal Overhead**: Efficient request forwarding
- **Memory Efficient**: Streams large responses

## License

This code is part of the x402 project and is licensed under the Apache 2.0 License.
