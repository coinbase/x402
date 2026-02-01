---
title: SDK Features
description: Feature parity across TypeScript, Go, and Python SDKs
---

# SDK Features

This page tracks which features are implemented in each SDK (TypeScript, Go, Python v2).

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented and tested |
| ❌ | Not yet implemented |
| 🚧 | Work in progress |

## Quick Links

- [TypeScript SDK](https://www.npmjs.com/search?q=%40x402)
- [Python SDK](https://pypi.org/project/x402/)
- [Go SDK](https://pkg.go.dev/github.com/coinbase/x402/go)

## Core

| Component | TypeScript | Go | Python |
|-----------|------------|-----|--------|
| Server | ✅ | ✅ | ✅ |
| Client | ✅ | ✅ | ✅ |
| Facilitator | ✅ | ✅ | ✅ |

### HTTP Framework Integrations

| Role | TypeScript | Go | Python |
|------|------------|-----|--------|
| Server | Express, Hono, Next.js | Gin | FastAPI, Flask |
| Client | Fetch, Axios | net/http | httpx, requests |

## Networks

| Network | TypeScript | Go | Python |
|---------|------------|-----|--------|
| evm (EIP-155) | ✅ | ✅ | ✅ |
| svm (Solana) | ✅ | ✅ | ✅ |

## Mechanisms

| Mechanism | TypeScript | Go | Python |
|-----------|------------|-----|--------|
| exact/evm (EIP-3009) | ✅ | ✅ | ✅ |
| exact/svm (SPL) | ✅ | ✅ | ✅ |

## Extensions

| Extension | TypeScript | Go | Python |
|-----------|------------|-----|--------|
| bazaar | ✅ | ✅ | ✅ |

## Client Hooks

| Hook | TypeScript | Go | Python |
|------|------------|-----|--------|
| onBeforePaymentCreation | ✅ | ✅ | ✅ |
| onAfterPaymentCreation | ✅ | ✅ | ✅ |
| onPaymentCreationFailure | ✅ | ✅ | ✅ |
| onPaymentRequired (HTTP) | ✅ | ❌ | ❌ |

## Server Hooks

| Hook | TypeScript | Go | Python |
|------|------------|-----|--------|
| onBeforeVerify | ✅ | ✅ | ✅ |
| onAfterVerify | ✅ | ✅ | ✅ |
| onVerifyFailure | ✅ | ✅ | ✅ |
| onBeforeSettle | ✅ | ✅ | ✅ |
| onAfterSettle | ✅ | ✅ | ✅ |
| onSettleFailure | ✅ | ✅ | ✅ |
| onProtectedRequest (HTTP) | ✅ | ❌ | ❌ |

## Facilitator Hooks

| Hook | TypeScript | Go | Python |
|------|------------|-----|--------|
| onBeforeVerify | ✅ | ✅ | ✅ |
| onAfterVerify | ✅ | ✅ | ✅ |
| onVerifyFailure | ✅ | ✅ | ✅ |
| onBeforeSettle | ✅ | ✅ | ✅ |
| onAfterSettle | ✅ | ✅ | ✅ |
| onSettleFailure | ✅ | ✅ | ✅ |

## Extension Hooks

| Hook | TypeScript | Go | Python |
|------|------------|-----|--------|
| enrichDeclaration | ✅ | ✅ | ✅ |
| enrichPaymentRequiredResponse | ✅ | ❌ | ❌ |
| enrichSettlementResponse | ✅ | ❌ | ❌ |

## HTTP Server Features

| Feature | TypeScript | Go | Python |
|---------|------------|-----|--------|
| dynamicPayTo | ✅ | ✅ | ✅ |
| dynamicPrice | ✅ | ✅ | ✅ |
| paywall (browser UI) | ✅ | ✅ | ✅ |
