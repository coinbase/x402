# Default Assets for Solana Networks

This document explains how to add a default stablecoin asset for a new Solana network.

## Overview

When a server uses `price: "$0.10"` syntax (USD string pricing), x402 needs to know which stablecoin to use for that network. The default asset is configured in `constants.go` within the `NetworkConfigs` map.

## Adding a New Network

To add support for a new Solana network, add an entry to the `NetworkConfigs` map in `constants.go`:

```go
NetworkConfigs = map[string]NetworkConfig{
    // ... existing networks ...
    
    // Your New Network
    "solana:YOUR_GENESIS_HASH": {
        Name:   "Your Network Name",
        CAIP2:  "solana:YOUR_GENESIS_HASH",
        RPCURL: "https://your-rpc-endpoint.com",
        DefaultAsset: AssetInfo{
            Address:  "YOUR_USDC_MINT_ADDRESS",
            Symbol:   "USDC",
            Decimals: 6,
        },
    },
}
```

### Required Fields

| Field | Description |
|-------|-------------|
| `Name` | Human-readable network name |
| `CAIP2` | CAIP-2 identifier (solana:{genesis_hash_first_32_chars}) |
| `RPCURL` | Default RPC endpoint URL |
| `Address` | Mint address of the stablecoin |
| `Symbol` | Token symbol (e.g., "USDC") |
| `Decimals` | Token decimal places (typically 6 for USDC) |

## Current Limitation

> ⚠️ **SPL Token Required**: Currently, only SPL tokens that support the standard `TransferChecked` instruction are supported.

## Asset Selection Policy

The default asset is chosen **per network** based on the following guidelines:

1. **Network-endorsed stablecoin**: If the network has officially selected or endorsed a stablecoin, that asset should be used.

2. **No official stance**: If the network team has not taken a public position on a preferred stablecoin, we encourage them to make the selection and submit a PR.

3. **Community PRs welcome**: Network teams and community members may submit PRs to add their network's default asset, provided:
   - The stablecoin is a valid SPL token
   - The selection aligns with the network's ecosystem preferences

## Contributing

To add a new network's default asset:

1. Verify the stablecoin is a valid SPL token
2. Obtain the correct mint address and decimals
3. Add the entry to `NetworkConfigs` in `constants.go`
4. Submit a PR with the network name and rationale for the asset selection

