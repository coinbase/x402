# X402 Client Examples - Multiple Authorization Types

This directory contains client examples demonstrating different ERC20 token authorization methods with the x402 protocol.

## 📚 Available Examples

### 1. **EIP-3009** - `chainlink-vrf-nft/`
Original x402 implementation using USDC's `transferWithAuthorization`

**Best for:**
- USDC/EURC payments
- Lowest gas costs
- Single transaction settlement

**Supported Tokens:**
- USDC
- EURC (and other EIP-3009 tokens)

[→ View Example](./chainlink-vrf-nft/README.md)

---

### 2. **EIP-2612 Permit** - `permit-erc20/`
Standard ERC20 permit for gas-efficient approvals

**Best for:**
- Modern ERC20 tokens
- Tokens with built-in permit support
- Wide token compatibility

**Supported Tokens:**
- DAI
- UNI (Uniswap)
- COMP (Compound)
- AAVE
- Most tokens deployed with OpenZeppelin's ERC20Permit

[→ View Example](./permit-erc20/README.md)

---

### 3. **Permit2** - `permit2-universal/`
Universal token approvals working with **ANY ERC20**

**Best for:**
- Maximum flexibility
- Legacy token support
- Future-proof implementations
- Batch operations

**Supported Tokens:**
- **ANY ERC20 token** (including those without native permit)
- USDT, WBTC, custom tokens, etc.

[→ View Example](./permit2-universal/README.md)

---

## 🔄 Comparison Matrix

| Feature | EIP-3009 | EIP-2612 | Permit2 |
|---------|----------|----------|---------|
| **Token Support** | USDC only | Modern ERC20 | **ANY ERC20** |
| **Setup** | None | None | One-time approval |
| **Transactions** | 1 | 2 | 1 (after setup) |
| **Gas Cost** | ✅ Lowest | Medium | Medium |
| **Nonce Type** | Custom (bytes32) | Sequential | Tracked by Permit2 |
| **Security** | ✅ High | ✅ High | ✅✅ **Highest** |
| **Future-proof** | ⚠️ Limited | ✅ Good | ✅✅ **Best** |
| **Complexity** | Simple | Simple | Medium |

## 🚀 Quick Start

### Prerequisites

1. **Install Dependencies**
   ```bash
   cd examples/typescript
   pnpm install
   pnpm build
   ```

2. **Start Facilitator**
   ```bash
   cd facilitator
   cp .env-local .env
   # Edit .env and add your EVM_PRIVATE_KEY
   pnpm dev
   ```

### Run Examples

**EIP-3009 (USDC):**
```bash
cd clients/chainlink-vrf-nft
cp .env-local .env
# Edit .env and configure wallets
pnpm run client
```

**EIP-2612 (Permit):**
```bash
cd clients/permit-erc20
cp .env-local .env
# Edit .env and add CLIENT_PRIVATE_KEY
pnpm run client
```

**Permit2 (Universal):**
```bash
cd clients/permit2-universal
cp .env-local .env
# Edit .env and add CLIENT_PRIVATE_KEY
# Note: Requires one-time approval of Permit2 contract
pnpm run client
```

## 📖 How to Choose

### Choose **EIP-3009** if:
- ✅ You only need USDC/EURC
- ✅ Gas optimization is critical
- ✅ You want the simplest implementation

### Choose **EIP-2612** if:
- ✅ You need to support multiple modern tokens
- ✅ Tokens have native permit support
- ✅ You want good compatibility

### Choose **Permit2** if:
- ✅ You need to support ANY ERC20 token
- ✅ You want the most future-proof solution
- ✅ Batch operations might be useful
- ✅ Maximum security is important

## 🏗️ Architecture

All examples follow the same x402 flow:

```
┌─────────┐                    ┌──────────────┐
│ Client  │  1. Sign Payment   │ Facilitator  │
│         │ ──────────────────>│              │
│         │                    │              │
│         │  2. X-PAYMENT      │              │
│         │     Header         │              │
│         │ ──────────────────>│              │
│         │                    │              │
│         │                    │ 3. Verify    │
│         │                    │    Signature │
│         │                    │              │
│Resource │                    │ 4. Settle    │
│Server   │<───────────────────│    Payment   │
│         │  5. Access Granted │              │
└─────────┘                    └──────────────┘
```

The only difference is **how the payment is authorized**:

- **EIP-3009**: `transferWithAuthorization` signature
- **EIP-2612**: `permit` signature + `transferFrom`
- **Permit2**: `permitTransferFrom` via Permit2 contract

## 🔐 Security Best Practices

1. **Never commit private keys**
2. **Use test wallets** for examples
3. **Set reasonable deadlines** (1-24 hours)
4. **Verify amounts** before signing
5. **Check token approvals** regularly

## 📝 Payment Header Format

All examples create a payment header in this format:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base",
  "payload": {
    "authorizationType": "eip3009" | "permit" | "permit2",
    "signature": "0x...",
    "authorization": {
      // Type-specific fields
    }
  }
}
```

The header is base64-encoded and sent in the `X-PAYMENT` HTTP header.

## 🌐 Supported Networks

Currently configured for **Base** mainnet, but can be adapted for:

- Ethereum
- Polygon
- Avalanche
- Arbitrum
- Optimism
- Any EVM chain

## 🛠️ Development

### Adding a New Example

1. Create a new directory in `clients/`
2. Copy the structure from an existing example
3. Implement client logic with your authorization type
4. Add README with specific instructions
5. Test with the facilitator

### Testing

Each example can be tested independently:

```bash
# Terminal 1: Facilitator
cd facilitator && pnpm dev

# Terminal 2: Resource Server (if needed)
cd clients/<example> && pnpm run resource

# Terminal 3: Client
cd clients/<example> && pnpm run client
```

## 📚 Additional Resources

- [X402 Specification](../../../specs/x402-specification.md)
- [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)
- [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612)
- [Permit2](https://github.com/Uniswap/permit2)
- [Facilitator Guide](../facilitator/README.md)

## 🤝 Contributing

To add support for additional authorization types:

1. Extend type definitions in `packages/x402/src/types/`
2. Implement verify/settle logic in `packages/x402/src/schemes/exact/evm/`
3. Update facilitator routing
4. Create example in `examples/typescript/clients/`
5. Document in README

## ❓ Troubleshooting

**Payment verification fails:**
- Check that facilitator is running
- Verify network matches (mainnet vs testnet)
- Ensure sufficient token balance

**Permit2 not working:**
- Check if Permit2 is approved for the token
- Run one-time approval first

**Signature invalid:**
- Verify chainId matches network
- Check token address is correct
- Ensure deadline hasn't passed

## 💡 Next Steps

- Explore [fullstack examples](../fullstack/) for complete applications
- Check [server examples](../servers/) for protected endpoints
- Review [MCP examples](../mcp/) for AI agent integration

