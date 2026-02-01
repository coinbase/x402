# x402 Roadmap

This document outlines the planned development roadmap for the x402 protocol. Items are subject to change based on community feedback and priorities.

## Current Status ✅

### Supported Networks
| Network | Status | Asset Support |
|---------|--------|---------------|
| Base (eip155:8453) | ✅ Mainnet | EIP-3009 tokens |
| Base Sepolia (eip155:84532) | ✅ Testnet | EIP-3009 tokens |
| Solana | ✅ Mainnet | SPL tokens, Token-2022 (v2) |
| Solana Devnet | ✅ Testnet | SPL tokens, Token-2022 (v2) |

### Available SDKs
- ✅ TypeScript (pnpm monorepo)
- ✅ Python
- ✅ Go
- 🚧 Java (in progress)

---

## Short-Term (Q1-Q2 2025)

### Protocol Enhancements
- [ ] **`upto` Scheme** - Pay-as-you-go pricing for variable resource consumption (e.g., LLM tokens)
- [ ] **`stream` Scheme** - Continuous payment streaming for real-time services
- [ ] **`permit2` Scheme** - Enhanced token approval mechanism

### SDK Improvements
- [ ] Enhanced error messages and debugging tools
- [ ] Improved TypeScript type definitions
- [ ] Better test coverage across all SDKs
- [ ] Performance optimizations for high-throughput scenarios

### Documentation
- [ ] Expanded getting started guides
- [ ] Video tutorials and walkthroughs
- [ ] Interactive examples and playgrounds

---

## Mid-Term (Q3-Q4 2025)

### New Chain Support
- [ ] Ethereum Mainnet
- [ ] Polygon
- [ ] Arbitrum
- [ ] Optimism
- [ ] Additional L2 networks

### Advanced Features
- [ ] Multi-asset support in single transactions
- [ ] Batch payment capabilities
- [ ] Escrow and conditional transfers (HTLCs)
- [ ] Discovery layer for service search & reputation

### Enterprise Features
- [ ] Custom KYT/KYC integration points
- [ ] Usage metering integration (Metronome, etc.)
- [ ] Advanced analytics and monitoring

---

## Long-Term (2026+)

### Protocol Evolution
- [ ] Cross-chain payment settlements
- [ ] Fiat on/off-ramp integrations
- [ ] Zero-knowledge proof enhancements for privacy
- [ ] Formal protocol governance structure

### Ecosystem Growth
- [ ] x402 registries and marketplaces
- [ ] Third-party auditing framework
- [ ] Plugin ecosystem for custom extensions

---

## Community Wishlist

Have a feature request? [Open an issue](https://github.com/coinbase/x402/issues) or check out [PROJECT-IDEAS.md](./PROJECT-IDEAS.md) for ways to contribute.

---

*Last updated: February 2025*
