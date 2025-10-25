# 402Gate Solana Integration of x402 Protocol

This document describes how [402Gate](https://www.402gate.com) integrates with
the [Coinbase x402 protocol](https://github.com/coinbase/x402).

## Overview
402Gate extends the official x402 Payment Required protocol to support:
- On-chain micropayments via Solana
- Multi-token support ($402G, USDC, SOL)
- Autonomous agent payment (AI-to-AI transactions)
- Pay-per-use APIs and content paywalls

## Technical Mapping

| x402 Spec Element | 402Gate Implementation |
|--------------------|-------------------------|
| 402 Response Schema | Solana JSON-RPC + verified recipient |
| Payment Proof | Solana TX Signature |
| Settlement Engine | Solana Program ID (Devnet) |
| Verification Layer | @402gate/core verifier |
| SDK | @402gate/sdk (JS/TS) |

## Reference
- Docs: [docs.402gate.com](https://docs.402gate.com)
- SDK: [@402gate/sdk](https://github.com/402gate/402gate-sdk)
- DApp: [dapps.402gate.com](https://dapps.402gate.com)
