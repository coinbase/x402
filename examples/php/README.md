# X402 PHP Examples

This directory contains a collection of PHP examples demonstrating how to use the X402 protocol in various contexts. These examples use the PHP `x402` and `x402-laravel` packages.

## Setup

Before running any examples, ensure you have:

- PHP 8.5+
- Composer package manager
- Docker (recommended for running examples)

## Example Structure

The examples are organized into several categories:

### Servers

Examples of different server implementations:

- `servers/laravel/` - Laravel application with x402 middleware protecting routes. Includes paywall UI for browser requests.

## Running Examples

Each example directory contains its own setup. For the Laravel example:

```bash
cd servers/laravel

# Using Docker (recommended)
docker compose up -d

# The server will be available at http://localhost:8080
```

### Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /free` | Free endpoint (no payment required) |
| `GET /discovery/resources` | Discovery endpoint listing all paid resources |
| `GET /weather` | Paid endpoint ($0.001) - returns weather data |
| `GET /premium` | Paid endpoint ($0.01) - returns premium content |
| `GET /solana-weather` | Paid endpoint on Solana devnet |

### Testing Endpoints

```bash
# Free endpoint
curl http://localhost:8080/free

# Discovery (list all paid resources)
curl http://localhost:8080/discovery/resources

# Paid endpoint (returns 402 with payment requirements)
curl http://localhost:8080/weather

# Paid endpoint in browser (returns HTML paywall)
curl -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" http://localhost:8080/weather
```

## Development

This workspace uses:

- Composer for PHP dependency management
- Docker for running the development server
- Laravel 12.x framework
- PHP 8.5+ with pipe operator support

The examples use path repositories to reference local `x402` and `x402-laravel` packages during development.

## A note on private keys

The examples in this folder commonly use private keys to sign messages. **Never put a private key with mainnet funds in a `.env` file**. This can result in keys getting checked into codebases and being drained.

Use a development wallet funded on testnets (e.g., Base Sepolia USDC/ETH). You can fund a dev wallet via the testnet [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet).
