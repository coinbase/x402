# AgentShare × x402 (Meteora brief)

Pay for live Solana DeFi intelligence from [AgentShare](https://agentshare.dev)
using the official x402 Python buyer SDK.

- Endpoint: `POST /api/v1/agent/defi/meteora/brief`
- Settlement today: **Base mainnet** (`eip155:8453`) USDC via Circle Gateway
- Pricing: **dynamic** ~$0.01–$0.30 USDC (read live quote from HTTP 402)

## Setup

```bash
cp .env-local .env
# Set EVM_PRIVATE_KEY to a Base wallet funded with USDC
uv sync
uv run python main.py
```

Or with pip:

```bash
pip install "x402[httpx]" eth-account python-dotenv
export EVM_PRIVATE_KEY=0x...
python main.py
```

## Environment

| Variable | Description |
|----------|-------------|
| `EVM_PRIVATE_KEY` | EVM private key (Base / mainnet USDC) |
| `RESOURCE_SERVER_URL` | Default `https://agentshare.dev` |
| `ENDPOINT_PATH` | Default `/api/v1/agent/defi/meteora/brief` |

## Links

- Discovery: https://agentshare.dev/.well-known/x402
- OpenAPI: https://agentshare.dev/openapi.json
- x402scan listing: https://www.x402scan.com/server/65b3e822-068a-4e51-a8bb-2ade6d5f0b32
- Standalone copy: https://github.com/anhmtk/agentshare-mcp/blob/main/examples/buy_meteora_x402.py
