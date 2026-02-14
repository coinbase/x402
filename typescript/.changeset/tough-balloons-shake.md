---
"@x402/extensions": minor
"@x402/evm": minor
---

Added support for ERC-8004 Trustless Agents reputation extension in `@x402/extensions`. This enables AI agents to advertise their on-chain identity and reputation registry, supporting both EVM and Solana (SATI) standards. Includes server-side declaration helpers, client-side bidirectional reputation support, and an automated feedback tool for generating CAIP-220 compliant reputation signals from payment settlements.

Enhanced `@x402/evm` with automatic EIP-712 domain discovery for EIP-3009 tokens. This improves verification robustness for tokens with misconfigured domain parameters (like USDC on Base Sepolia) and provides better support for contract-based wallets.
