# x402 MCP Service Marketplace — Agent Client

Companion client to `examples/python/servers/mcp-service-marketplace`.

Demonstrates an AI agent that:
1. Discovers available services via the x402 Bazaar (`/discovery/resources`)
2. Pays per-call in USDC on Base — no API key, no signup
3. Calls all 3 LogicNodes workers and prints verified results

## Quick Start

```bash
cp .env-local .env
# Fill in CDP credentials or EVM_PRIVATE_KEY

uv sync

# Against live LogicNodes (Base mainnet — real USDC)
uv run client.py

# Against local server (Base Sepolia testnet — free)
uv run client.py --testnet
```

## What the Agent Does

```
[Bazaar] Discovered 242 services at https://logicnodes.io
  - json_sanitizer    | 0.05 USDC | basic
  - pii_scrubber      | 0.05 USDC | basic
  - rug_pull_detector | 0.50 USDC | premium
  ...

[Agent] Calling JSON Sanitizer ($0.05 USDC)...
[✓] JSON Sanitizer — status: success
    valid: True
    clean_json: {"name": "Alice", "age": 30, "city": "Phoenix"}
    trust_hash: 8f038c820f3d...

[Agent] Calling PII Scrubber ($0.05 USDC)...
[✓] PII Scrubber — status: success
    scrubbed: Please contact [NAME] at [EMAIL] or call [PHONE]
    redacted_count: 3

[Agent] Calling Rug Pull Detector ($0.50 USDC)...
[✓] Rug Pull Detector — status: success
    risk_score: 0.0
    risk_label: LOW
    signals: ["no_static_signals_detected"]
```

## Live Server

The client points to `https://logicnodes.io` by default. Set `LOGICNODES_URL=http://localhost:8089` to run against the local example server.
