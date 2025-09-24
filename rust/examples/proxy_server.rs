//! Example proxy server with x402 payment protection
//!
//! This example demonstrates how to create a reverse proxy server that adds
//! x402 payment protection to any existing HTTP service.

use std::env;
use tracing_subscriber;
use x402::proxy::{run_proxy_server, ProxyConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Parse command line arguments
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: {} <config_file> [port]", args[0]);
        eprintln!(
            "   or: {} --env [port] (load from environment variables)",
            args[0]
        );
        eprintln!();
        eprintln!("Example config.json:");
        eprintln!(
            r#"{{
    "target_url": "https://api.example.com",
    "amount": 0.01,
    "pay_to": "0x1234567890123456789012345678901234567890",
    "description": "API access fee",
    "facilitator_url": "https://x402.org/facilitator",
    "testnet": true
}}"#
        );
        eprintln!();
        eprintln!("Environment variables:");
        eprintln!("  TARGET_URL - Target URL to proxy to");
        eprintln!("  AMOUNT - Payment amount in decimal units");
        eprintln!("  PAY_TO - Recipient wallet address");
        eprintln!("  DESCRIPTION - Payment description");
        eprintln!("  FACILITATOR_URL - Facilitator service URL");
        eprintln!("  TESTNET - Use testnet (true/false)");
        eprintln!("  CDP_API_KEY_ID - Coinbase CDP API key ID");
        eprintln!("  CDP_API_KEY_SECRET - Coinbase CDP API key secret");
        std::process::exit(1);
    }

    let config_path = &args[1];

    // Check for help flag
    if config_path == "--help" || config_path == "-h" {
        eprintln!("Usage: {} <config_file> [port]", args[0]);
        eprintln!(
            "   or: {} --env [port] (load from environment variables)",
            args[0]
        );
        eprintln!();
        eprintln!("Example config.json:");
        eprintln!(
            r#"{{
    "target_url": "https://api.example.com",
    "amount": 0.01,
    "pay_to": "0x1234567890123456789012345678901234567890",
    "description": "API access fee",
    "facilitator_url": "https://x402.org/facilitator",
    "testnet": true
}}"#
        );
        eprintln!();
        eprintln!("Environment variables:");
        eprintln!("  TARGET_URL - Target URL to proxy to");
        eprintln!("  AMOUNT - Payment amount in decimal units");
        eprintln!("  PAY_TO - Recipient wallet address");
        eprintln!("  DESCRIPTION - Payment description");
        eprintln!("  FACILITATOR_URL - Facilitator service URL");
        eprintln!("  TESTNET - Use testnet (true/false)");
        eprintln!("  CDP_API_KEY_ID - Coinbase CDP API key ID");
        eprintln!("  CDP_API_KEY_SECRET - Coinbase CDP API key secret");
        std::process::exit(0);
    }

    let port = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(4021);

    // Load configuration
    let config = if config_path == "--env" {
        println!("🔧 Loading configuration from environment variables...");
        ProxyConfig::from_env()?
    } else {
        println!("📄 Loading configuration from file: {}", config_path);
        ProxyConfig::from_file(config_path)?
    };

    // Validate configuration
    config.validate()?;

    println!("✅ Configuration loaded successfully:");
    println!("   Target URL: {}", config.target_url);
    println!("   Amount: ${:.4}", config.amount);
    println!("   Pay To: {}", config.pay_to);
    println!(
        "   Network: {}",
        if config.testnet { "testnet" } else { "mainnet" }
    );
    println!("   Facilitator: {}", config.facilitator_url);

    if let Some(description) = &config.description {
        println!("   Description: {}", description);
    }

    // Start the proxy server
    println!("\n🚀 Starting proxy server...");
    run_proxy_server(config, port).await?;

    Ok(())
}
