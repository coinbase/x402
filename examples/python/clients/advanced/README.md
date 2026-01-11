# Advanced Python Client Examples

This directory contains advanced x402 client examples demonstrating hooks, custom selectors, builder patterns, error recovery, and custom HTTP transports.

## Prerequisites

- Python 3.11+
- An EVM private key with testnet funds (e.g., Base Sepolia)
- A running x402 resource server (e.g., the FastAPI example server)

## Setup

1. **Install dependencies:**

   ```bash
   cd examples/python/clients/advanced
   uv sync
   ```

2. **Configure environment:**

   ```bash
   cp .env-local .env
   # Edit .env and add your private key
   ```

3. **Start a test server** (in another terminal):

   ```bash
   cd examples/python/servers/fastapi
   uv sync && uv run uvicorn main:app --port 4021
   ```

## Running Examples

Use the CLI to run specific examples:

```bash
# Run a specific example
uv run python index.py hooks
uv run python index.py preferred_network
uv run python index.py builder_pattern
uv run python index.py error_recovery
uv run python index.py custom_transport

# Run all examples
uv run python index.py all

# List available examples
uv run python index.py --list
```

Or run individual files directly:

```bash
uv run python hooks.py
uv run python preferred_network.py
uv run python builder_pattern.py
uv run python error_recovery.py
uv run python custom_transport.py
```

## Examples Overview

### 1. Hooks (`hooks.py`)

Demonstrates payment lifecycle hooks for logging, validation, and error recovery:

- `on_before_payment_creation` - Called before payment creation, can abort
- `on_after_payment_creation` - Called after successful payment
- `on_payment_creation_failure` - Called on failure, can recover

**Use cases:**
- Logging payment events for debugging
- Custom validation before allowing payments
- Metrics and analytics collection
- Error recovery with fallback payloads

### 2. Preferred Network (`preferred_network.py`)

Shows how to implement a custom payment requirements selector:

- Define network preference order (e.g., prefer L2 over L1)
- Automatic fallback to supported alternatives
- Useful for cost optimization or user preferences

**Use cases:**
- Prefer cheaper networks (Base > Ethereum)
- User-configurable network preferences
- Wallet UI with network selection

### 3. Builder Pattern (`builder_pattern.py`)

Demonstrates network-specific scheme registration:

- Different signers for different networks
- Wildcard patterns (`eip155:*`) with specific overrides (`eip155:1`)
- Separate keys for mainnet vs testnet

**Use cases:**
- Production vs development key separation
- Multi-network wallet support
- Network-specific signer configurations

### 4. Error Recovery (`error_recovery.py`)

Advanced error handling with classification and recovery:

- Error type classification (network, balance, signing, validation)
- Recovery strategies based on error type
- Error statistics and metrics tracking

**Use cases:**
- Robust production deployments
- Automatic retry for transient errors
- Detailed error reporting

### 5. Custom Transport (`custom_transport.py`)

Custom httpx transport with advanced features:

- Automatic retry with exponential backoff
- Request timing and tracing
- Connection pool configuration

**Use cases:**
- Production-grade HTTP handling
- Request performance monitoring
- Custom timeout and retry policies

## Testing

Run the test suite:

```bash
# Unit tests (with mocks)
uv run pytest tests/ -v

# E2E tests (requires running server + funded account)
RUN_E2E_TESTS=1 uv run pytest tests/test_e2e_integration.py -v
```

## Project Structure

```
advanced/
├── .env-local              # Environment template
├── README.md               # This file
├── pyproject.toml          # Dependencies
├── index.py                # CLI entry point
├── hooks.py                # Lifecycle hooks example
├── preferred_network.py    # Custom selector example
├── builder_pattern.py      # Network registration example
├── error_recovery.py       # Error handling example
├── custom_transport.py     # Custom transport example
└── tests/
    ├── conftest.py         # Shared fixtures
    ├── test_hooks.py
    ├── test_preferred_network.py
    ├── test_builder_pattern.py
    ├── test_error_recovery.py
    ├── test_custom_transport.py
    └── test_e2e_integration.py
```

## Best Practices

1. **Use hooks for observability** - Log payment events for debugging and metrics
2. **Implement error classification** - Different errors need different handling
3. **Configure network preferences** - Users may prefer specific networks
4. **Use custom transports** - Production needs retry logic and timeouts
5. **Separate keys per environment** - Don't use production keys for testing
