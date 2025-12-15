# Default Assets for EVM Chains

This document explains how to add a default stablecoin asset for a new EVM chain.

## Overview

When a server uses `price: "$0.10"` syntax (USD string pricing), x402 needs to know which stablecoin to use for that chain. The default asset is configured in `constants.go` within the `NetworkConfigs` map.

## Adding a New Chain

To add support for a new EVM chain, add an entry to the `NetworkConfigs` map in `constants.go`:

```go
NetworkConfigs = map[string]NetworkConfig{
    // ... existing chains ...
    
    // Your New Chain
    "eip155:YOUR_CHAIN_ID": {
        ChainID: big.NewInt(YOUR_CHAIN_ID),
        DefaultAsset: AssetInfo{
            Address:  "0xYOUR_STABLECOIN_ADDRESS",
            Name:     "Token Name",  // Must match EIP-712 domain name
            Version:  "1",           // Must match EIP-712 domain version
            Decimals: 6,             // Token decimals (typically 6 for USDC)
        },
    },
}
```

### Required Fields

| Field | Description |
|-------|-------------|
| `ChainID` | The chain's numeric ID as `*big.Int` |
| `Address` | Contract address of the stablecoin |
| `Name` | EIP-712 domain name (must match the token's domain separator) |
| `Version` | EIP-712 domain version (must match the token's domain separator) |
| `Decimals` | Token decimal places (typically 6 for USDC) |

## Current Limitation

> ⚠️ **EIP-3009 Required**: Currently, only stablecoins implementing [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) (`transferWithAuthorization`) are supported.
>
> Generic ERC-20 support via EIP-2612/Permit2 is planned but not yet implemented.

## Asset Selection Policy

The default asset is chosen **per chain** based on the following guidelines:

1. **Chain-endorsed stablecoin**: If the chain has officially selected or endorsed a stablecoin (e.g., XDAI on Gnosis), that asset should be used.

2. **No official stance**: If the chain team has not taken a public position on a preferred stablecoin, we encourage the team behind that chain to make the selection and submit a PR.

3. **Community PRs welcome**: Chain teams and community members may submit PRs to add their chain's default asset, provided:
   - The stablecoin implements EIP-3009
   - The selection aligns with the chain's ecosystem preferences
   - The EIP-712 domain parameters are correctly specified

## Contributing

To add a new chain's default asset:

1. Verify the stablecoin implements EIP-3009
2. Obtain the correct EIP-712 domain `name` and `version` from the token contract
3. Add the entry to `NetworkConfigs` in `constants.go`
4. Submit a PR with the chain name and rationale for the asset selection
