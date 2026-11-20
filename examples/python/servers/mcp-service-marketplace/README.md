# x402 MCP Service Marketplace

A complete, production-ready example of an **x402-gated MCP service marketplace** — a FastAPI server exposing multiple AI agent workers as payable HTTP endpoints, fully discoverable via the Coinbase x402 Bazaar.

This example is based on [LogicNodes](https://logicnodes.io), a live marketplace of 242 deterministic A2A workers running on Base mainnet today.

## What This Shows

- **3 real AI services** gated by x402 payments (no mocks, no stubs)
- **Bazaar discovery metadata** — each route is auto-indexed in the CDP Bazaar after the first payment
- **Per-tier pricing** — basic ($0.05) and premium ($0.50) services in the same server
- **Trust hashes** — SHA-256 signed on every response for deterministic verification
- **MCP bridge** — pair with `npx logicnodes-mcp-bridge` to expose all services to Claude Desktop

## Services

| Endpoint | Description | Price |
|----------|-------------|-------|
| `POST /call/json_sanitizer` | Cleans and validates malformed JSON | $0.05 USDC |
| `POST /call/pii_scrubber` | Redacts emails, phones, SSNs from text | $0.05 USDC |
| `POST /call/rug_pull_detector` | Analyzes a contract address for rug risk | $0.50 USDC |

## Quick Start

```bash
cp .env-local .env
# Fill in EVM_ADDRESS with your Base wallet

uv sync
uv run main.py
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EVM_ADDRESS` | Your wallet address to receive USDC on Base |
| `FACILITATOR_URL` | `https://api.cdp.coinbase.com/platform/v2/x402` (mainnet) or `https://x402.org/facilitator` (testnet) |
| `EVM_NETWORK` | `eip155:8453` (Base mainnet) or `eip155:84532` (Base Sepolia) |
| `PORT` | Server port (default: `8089`) |

## How the Payment Flow Works

```
Agent                          LogicNodes Server          CDP Facilitator
  |                                  |                          |
  |-- POST /call/json_sanitizer ---> |                          |
  |                                  |-- 402 Payment Required ->|
  |<-- HTTP 402 + payment details ---|                          |
  |                                                             |
  |-- Pay 0.05 USDC on Base ---------------------------------> |
  |<-- Payment proof (X-PAYMENT header) ---------------------- |
  |                                  |                          |
  |-- POST /call/json_sanitizer ---> |                          |
  |   (with X-PAYMENT header)        |-- verify proof -------> |
  |                                  |<-- verified ------------ |
  |<-- 200 OK + result + trust_hash--|                          |
```

## Bazaar Discovery

Once you receive your first payment through the CDP facilitator, all your routes are automatically indexed at:

```
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=YOUR_ADDRESS
```

Any AI agent querying the Bazaar — including through AWS AgentCore — will find your services without any manual registration.

You can also expose your own discovery endpoint:

```python
@app.get("/discovery/resources")
async def discovery_resources():
    # Returns all routes with pricing and schemas
    ...
```

## Pairing with MCP (Claude Desktop)

Install the npm bridge to expose all your services as Claude tools:

```bash
npx logicnodes-mcp-bridge
```

Or add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "logicnodes": {
      "command": "npx",
      "args": ["-y", "logicnodes-mcp-bridge"],
      "env": { "LOGICNODES_URL": "http://localhost:8089" }
    }
  }
}
```

## Running the Client Agent

See the companion client in `examples/python/clients/mcp-service-marketplace/`:

```bash
cd ../../clients/mcp-service-marketplace
cp .env-local .env
uv sync
uv run client.py
```

The client autonomously discovers services via the Bazaar, pays per-call in USDC, and prints verified results.

## Live Instance

- **URL:** https://logicnodes.io
- **Bazaar:** https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0xc174A7C8088BF271399CD3E9f88c20D37CAb967D
- **MCP config:** https://logicnodes.io/.well-known/mcp-config
- **npm:** `npx logicnodes-mcp-bridge`
