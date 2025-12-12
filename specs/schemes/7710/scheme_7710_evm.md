# x402 Wire Protocol Extension: ERC-7710 Delegation Scheme

## Specification Document

**Version:** 1.0  
**Status:** Draft  
**Scheme Identifier:** `7710`  
**Extends:** x402 Protocol v1

---

## Table of Contents

1. [Summary](#summary)
2. [Motivation](#motivation)
3. [Scheme Overview](#scheme-overview)
4. [Payment Requirements Format](#payment-requirements-format)
5. [X-Payment Header Payload](#x-payment-header-payload)
6. [Verification Process](#verification-process)
7. [Settlement Process](#settlement-process)
8. [Facilitator Integration](#facilitator-integration)
9. [Security Considerations](#security-considerations)
10. [Implementation Guide](#implementation-guide)
11. [Appendix](#appendix)

---

## Summary

The `7710` scheme extends the x402 protocol to support ERC-7710 smart contract delegations. Unlike the `exact` scheme which uses EIP-3009's `transferWithAuthorization`, this scheme leverages delegated capabilities through a Delegation Manager contract. This enables payments from smart contract accounts (including ERC-4337 accounts, smart wallets, and multi-sig wallets) that may not support EIP-3009 but do support ERC-7710 delegations.

**Key Differences from `exact` Scheme:**

| Aspect | `exact` (EIP-3009) | `7710` (ERC-7710) |
|--------|-------------------|-------------------|
| Payer Type | EOA or EIP-3009 compatible | Any ERC-7710 compatible account |
| Authorization | `transferWithAuthorization` signature | Delegation + permission context |
| Execution | Direct token transfer | Delegation Manager executes via delegator |
| Smart Account Support | Limited | Native |
| Flexibility | Single transfer only | Extensible via caveats/policies |

---

## Motivation

### Limitations of EIP-3009

The `exact` scheme relies on EIP-3009's `transferWithAuthorization`, which has the following limitations:

1. **EOA-Centric**: Requires the payer to sign with a private key, limiting compatibility with smart contract wallets
2. **Token-Specific**: Only works with tokens implementing EIP-3009 (primarily USDC)
3. **No Policy Support**: Cannot express complex conditions or constraints on the payment

### Benefits of ERC-7710 Delegations

1. **Smart Account Native**: Works seamlessly with ERC-4337 accounts, multi-sig wallets, and any ERC-7710 compatible delegator
2. **Flexible Authorization**: Supports complex delegation policies and caveats
3. **Reusable Sessions**: Enables long-lived payment sessions with bounded permissions
4. **AI Agent Friendly**: Designed for scenarios where automated systems need bounded payment authority

---

## Scheme Overview

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌────────────────────┐     ┌───────────────┐
│   Client    │     │   Server    │     │    Facilitator     │     │  Delegation   │
│  (Delegate) │     │  (Payee)    │     │   (Redeemer)       │     │    Manager    │
└──────┬──────┘     └──────┬──────┘     └─────────┬──────────┘     └───────┬───────┘
       │                   │                      │                        │
       │ 1. GET /resource  │                      │                        │
       │──────────────────>│                      │                        │
       │                   │                      │                        │
       │ 2. 402 + accepts  │                      │                        │
       │   [exact, 7710]   │                      │                        │
       │<──────────────────│                      │                        │
       │                   │                      │                        │
       │ 3. Client creates delegation via its signer                       │
       │   (EOA, smart wallet, multi-sig, etc.)                           │
       │                   │                      │                        │
       │ 4. GET /resource  │                      │                        │
       │   + X-PAYMENT     │                      │                        │
       │   (7710 payload)  │                      │                        │
       │──────────────────>│                      │                        │
       │                   │                      │                        │
       │                   │ 5. Verify delegation │                        │
       │                   │─────────────────────>│                        │
       │                   │                      │                        │
       │                   │                      │ 6. Simulate            │
       │                   │                      │    redeemDelegations   │
       │                   │                      │───────────────────────>│
       │                   │                      │                        │
       │                   │                      │ 7. Simulation result   │
       │                   │                      │<───────────────────────│
       │                   │                      │                        │
       │                   │ 8. Valid/Invalid     │                        │
       │                   │<─────────────────────│                        │
       │                   │                      │                        │
       │ 9. 200 OK         │                      │                        │
       │<──────────────────│                      │                        │
       │                   │                      │                        │
       │                   │ 10. Settlement       │                        │
       │                   │   (async or sync)    │                        │
       │                   │─────────────────────>│                        │
       │                   │                      │                        │
       │                   │                      │ 11. redeemDelegations  │
       │                   │                      │───────────────────────>│
       │                   │                      │                        │
       │                   │                      │        12. Execute     │
       │                   │                      │        transfer on     │
       │                   │                      │        delegator       │
       │                   │                      │<───────────────────────│
       │                   │                      │                        │
```

### Key Components

1. **Delegator**: The smart contract account that holds funds and authorizes the delegation
2. **Delegate/Client**: The entity that creates the delegation (via its signer) and submits it for payment
3. **Delegation Manager**: Contract implementing `ERC7710Manager` that validates and executes delegations
4. **Facilitator**: x402 facilitator that acts as the redeemer, calling `redeemDelegations`
5. **Permission Context**: Encoded proof of delegation authority

---

## Payment Requirements Format

### 402 Response with 7710 Scheme

The server MAY offer the `7710` scheme alongside other schemes (like `exact`) to provide maximum client compatibility.

```http
HTTP/1.1 402 Payment Required
X-PAYMENT-REQUIRED: <base64-encoded-json>
Content-Type: application/json
```

**Decoded `X-PAYMENT-REQUIRED` Header:**

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base",
      "maxAmountRequired": "1000000",
      "resource": "https://api.example.com/resource",
      "description": "Access to premium API endpoint",
      "mimeType": "application/json",
      "payTo": "0x1234567890abcdef1234567890abcdef12345678",
      "maxTimeoutSeconds": 300,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "extra": {}
    },
    {
      "scheme": "7710",
      "network": "base",
      "maxAmountRequired": "1000000",
      "resource": "https://api.example.com/resource",
      "description": "Access to premium API endpoint",
      "mimeType": "application/json",
      "payTo": "0x1234567890abcdef1234567890abcdef12345678",
      "maxTimeoutSeconds": 300,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "extra": {
        "name": "Premium API Access"
      }
    }
  ],
  "error": null
}
```

### PaymentDetails Fields for 7710 Scheme

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scheme` | string | Yes | Must be `"7710"` |
| `network` | string | Yes | Blockchain network identifier |
| `maxAmountRequired` | string | Yes | Maximum payment amount in base units |
| `resource` | string | Yes | URL of the resource being paid for |
| `description` | string | No | Human-readable description |
| `mimeType` | string | No | MIME type of the resource |
| `payTo` | string | Yes | Recipient address for the payment |
| `maxTimeoutSeconds` | integer | Yes | Payment validity window in seconds |
| `asset` | string | Yes | Token contract address |
| `extra.name` | string | No | Human-readable name for the payment |

---

## X-Payment Header Payload

### Structure

```json
{
  "x402Version": 1,
  "scheme": "7710",
  "network": "base",
  "payload": {
    "delegationManager": "0xDelegationManagerAddress...",
    "permissionContext": "0x...",
    "authorization": {
      "from": "0xDelegatorAddress...",
      "to": "0xRecipientAddress...",
      "value": "1000000",
      "validAfter": "1699900000",
      "validBefore": "1699900300"
    }
  }
}
```

### Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `delegationManager` | string | Yes | Address of the ERC-7710 Delegation Manager contract |
| `permissionContext` | string | Yes | Encoded delegation authority (hex-encoded bytes) |
| `authorization.from` | string | Yes | Address of the delegator (payer's smart account) |
| `authorization.to` | string | Yes | Address of the recipient (must match `payTo`) |
| `authorization.value` | string | Yes | Payment amount in base units |
| `authorization.validAfter` | string | No | Unix timestamp after which the payment is valid |
| `authorization.validBefore` | string | No | Unix timestamp before which the payment is valid |

### Optional Time Bounds

The `validAfter` and `validBefore` fields are optional. When omitted:

- **`validAfter` omitted**: Payment is valid immediately (equivalent to `0`)
- **`validBefore` omitted**: Payment has no explicit expiration (validity determined by delegation caveats or `maxTimeoutSeconds`)

When provided, these fields allow the client to further constrain the payment window within the bounds allowed by the delegation.

### Full X-PAYMENT Header Example

**With time bounds:**

```json
{
  "x402Version": 1,
  "scheme": "7710",
  "network": "base",
  "payload": {
    "delegationManager": "0x74Cb5e4eE81b86e70f9045036a1C5477de69eE87",
    "permissionContext": "0x000000000000000000000000857b06519e91e3a54538791bdbb0e22373e36b6600000000000000000000000023456789abcdef0123456789abcdef0123456789...",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "1000000",
      "validAfter": "1740672089",
      "validBefore": "1740672389"
    }
  }
}
```

**Without time bounds (minimal):**

```json
{
  "x402Version": 1,
  "scheme": "7710",
  "network": "base",
  "payload": {
    "delegationManager": "0x74Cb5e4eE81b86e70f9045036a1C5477de69eE87",
    "permissionContext": "0x000000000000000000000000857b06519e91e3a54538791bdbb0e22373e36b66...",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "1000000"
    }
  }
}
```

---

## Verification Process

The facilitator MUST perform the following verification steps for a `7710` scheme payment:

### Step 1: Basic Validation

```
1.1. Verify x402Version matches expected version (1)
1.2. Verify scheme is "7710"
1.3. Verify network matches the payment requirements
1.4. Verify delegationManager is a valid address
```

### Step 2: Authorization Validation

```
2.1. Verify authorization.to matches paymentRequirements.payTo
2.2. Verify authorization.value >= paymentRequirements.maxAmountRequired
2.3. If validAfter is provided: verify current time >= validAfter
2.4. If validBefore is provided: verify current time < validBefore
2.5. If both time bounds provided: verify validBefore - validAfter <= paymentRequirements.maxTimeoutSeconds
```

### Step 3: Simulation

The facilitator MUST simulate the `redeemDelegations` call to ensure it would successfully transfer the required funds. This simulation-based approach validates the entire execution context without requiring the facilitator to understand the internal structure of the `permissionContext`.

```solidity
// Construct the execution calldata for ERC-20 transfer
bytes memory transferCalldata = abi.encodeWithSelector(
    IERC20.transfer.selector,
    authorization.to,
    authorization.value
);

// Encode as single call (mode = 0x00)
bytes32 mode = bytes32(0);
bytes memory executionCallData = abi.encodePacked(
    asset,           // target: token contract
    uint256(0),      // value: 0 (no ETH)
    transferCalldata // data: transfer call
);

// Simulate the redeemDelegations call
try delegationManager.redeemDelegations(
    [permissionContext],
    [mode],
    [executionCallData]
) {
    // Verify the transfer would result in correct balance change
    // by checking expected post-simulation balances
    return (true, "");
} catch (bytes memory errorData) {
    return (false, errorData);
}
```

### Simulation Validation

The simulation MUST verify that executing `redeemDelegations` would result in:

1. The `payTo` address receiving at least `maxAmountRequired` of the specified `asset`
2. The funds originating from the `authorization.from` address (the delegator)

### Verification Response

**Success:**

```json
{
  "valid": true,
  "invalidReason": null,
  "details": {
    "delegator": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "delegationManager": "0x74Cb5e4eE81b86e70f9045036a1C5477de69eE87",
    "simulationSuccess": true
  }
}
```

**Failure:**

```json
{
  "valid": false,
  "invalidReason": "DELEGATION_MANAGER_ERROR",
  "error": {
    "code": "DELEGATION_MANAGER_ERROR",
    "message": "Delegation manager reverted during simulation",
    "data": "0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000