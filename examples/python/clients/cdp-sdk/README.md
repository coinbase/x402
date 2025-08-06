# x402 CDP SDK Wallet Example

This example demonstrates how to use a CDP SDK wallet as a signer with the x402 package and httpx client to make requests to 402-protected endpoints.

## Setup and Usage

1. Install dependencies:
```bash
uv sync
```

2. Configure environment variables in a `.env` file:
```bash
# CDP SDK credentials (required for wallet access)
CDP_API_KEY_ID=your_cdp_api_key_id_here
CDP_API_KEY_SECRET=your_cdp_api_key_secret_here
CDP_WALLET_SECRET=your_cdp_wallet_secret_here

# Target server configuration
RESOURCE_SERVER_URL=your_server_url_here
ENDPOINT_PATH=your_endpoint_path_here
```

> **Note**: CDP API keys can be obtained from the [CDP Portal](https://portal.cdp.coinbase.com/)

3. Run the example:
```bash
uv run python main.py
```

## How it Works

This example shows the integration between CDP SDK wallets and x402 payment handling:

1. **CDP Client Initialization**: Creates a `CdpClient` instance to manage the CDP connection
2. **Wallet Creation**: Uses `cdp.evm.get_or_create_account()` to create or retrieve a server wallet
3. **Account Wrapping**: Wraps the CDP account in an `EvmLocalAccount` for x402 compatibility
4. **x402 Integration**: Uses `x402HttpxClient` with the CDP wallet as the signer
5. **Automatic Payment Handling**: Makes requests to protected endpoints with automatic 402 payment processing

## Key Components

### CDP SDK Integration
```python
from cdp import CdpClient
from cdp.evm_local_account import EvmLocalAccount

async with CdpClient() as cdp:
    server_account = await cdp.evm.get_or_create_account("x402-example")
    account = EvmLocalAccount(server_account)
```

### x402 Payment Handling
```python
from x402.clients.httpx import x402HttpxClient

async with x402HttpxClient(account=account, base_url=base_url) as client:
    response = await client.get(endpoint_path)
```

