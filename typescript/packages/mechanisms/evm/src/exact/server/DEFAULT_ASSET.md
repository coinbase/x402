# Default Assets for EVM Chains

This document explains how to add a default stablecoin asset for a new EVM chain.

## Overview

When a server uses `price: "$0.10"` syntax (USD string pricing), x402 needs to know which stablecoin to use for that chain. The default asset is configured in `scheme.ts` within the `getDefaultAsset()` method.

## Adding a New Chain

To add support for a new EVM chain, add an entry to the `stablecoins` map in `getDefaultAsset()`:
```typescript
const stablecoins: Record<string, { address: string; name: string; version: string; decimals: number }> = {
  "eip155:8453": {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    name: "USD Coin",
    version: "2",
    decimals: 6
  }, // Base mainnet USDC
  // Add your chain here:
  "eip155:YOUR_CHAIN_ID": {
    address: "0xYOUR_STABLECOIN_ADDRESS",
    name: "Token Name",      // Must match EIP-712 domain name
    version: "1",            // Must match EIP-712 domain version
    decimals: 6,             // Token decimals (typically 6 for USDC)
  },
};
```

### Required Fields

| Field | Description |
|-------|-------------|
| `address` | Contract address of the stablecoin |
| `name` | EIP-712 domain name (must match the token's domain separator) |
| `version` | EIP-712 domain version (must match the token's domain separator) |
| `decimals` | Token decimal places (typically 6 for USDC) |

## Asset Transfer Methods

x402 supports two methods for transferring assets:

| Method | Use Case | Recommendation |
|--------|----------|----------------|
| **EIP-3009** | Tokens with native `transferWithAuthorization` (e.g., USDC) | **Recommended** (Simplest, truly gasless) |
| **Permit2** | Any ERC-20 token | **Universal Fallback** (Requires one-time approval) |

### Default Behavior

If no `assetTransferMethod` is specified, the client defaults to **EIP-3009**. This maintains backward compatibility with existing deployments.

### Using Permit2 for Custom Tokens

For tokens that don't support EIP-3009, use the `registerMoneyParser` method to specify Permit2:

```typescript
import { ExactEvmScheme } from "@x402/evm/exact/server";

const server = new ExactEvmScheme();

// Register a custom token that requires Permit2
server.registerMoneyParser(async (amount, network) => {
  if (network === "eip155:8453") {
    return {
      amount: (amount * 1e18).toString(),  // Adjust decimals for your token
      asset: "0xYourTokenAddress",
      extra: {
        assetTransferMethod: "permit2",  // Required for non-EIP-3009 tokens
      },
    };
  }
  return null;  // Fall through to next parser or default
});
```

### Using Permit2 with Pre-Parsed Prices

You can also specify Permit2 directly when using pre-parsed `AssetAmount`:

```typescript
// In route configuration
{
  "GET /api/resource": {
    accepts: {
      payTo: "0x...",
      scheme: "exact",
      network: "eip155:8453",
      price: {
        amount: "1000000",
        asset: "0xYourTokenAddress",
        extra: {
          assetTransferMethod: "permit2",
        },
      },
    },
  },
}
```

### Client Requirements for Permit2

When a server specifies `assetTransferMethod: "permit2"`, clients must:

1. **One-time approval**: Approve the Permit2 contract to spend their tokens
   ```typescript
   // Using @x402/evm helpers
   import { createPermit2ApprovalTx, PERMIT2_ADDRESS } from "@x402/evm";
   
   const tx = createPermit2ApprovalTx(tokenAddress);
   await walletClient.sendTransaction(tx);
   ```

2. **Sign the payment**: The client SDK handles this automatically once approval exists

If the client hasn't approved Permit2, they'll receive a `412 Precondition Failed` response with error code `PERMIT2_ALLOWANCE_REQUIRED`.

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

1. Check if the stablecoin implements EIP-3009 (recommended for default assets)
2. Obtain the correct EIP-712 domain `name` and `version` from the token contract
3. Add the entry to `getDefaultAsset()` in `scheme.ts`
4. Submit a PR with the chain name and rationale for the asset selection

> **Note**: Default assets should support EIP-3009 for the best user experience (no approval required). Tokens requiring Permit2 can be added via `registerMoneyParser` as shown above.

