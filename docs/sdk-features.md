---
title: SDK Features
description: Feature parity across TypeScript, Go, and Python SDKs
---

# SDK Features

This page tracks which features are implemented in each SDK (TypeScript, Go, Python v2).

## Networks

| Network | TypeScript | Go | Python |
|---------|------------|-----|--------|
| evm (EIP-155 chains) | ✅ | ✅ | ✅ |
| svm (Solana) | ✅ | ✅ | ✅ |

## Mechanisms

| Mechanism | TypeScript | Go | Python |
|-----------|------------|-----|--------|
| exact/evm (EIP-3009) | ✅ | ✅ | ✅ |
| exact/svm (SPL) | ✅ | ✅ | ✅ |

## Extensions

| Extension | TypeScript | Go | Python |
|-----------|------------|-----|--------|
| bazaar (API Discovery) | ✅ | ✅ | ✅ |

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
