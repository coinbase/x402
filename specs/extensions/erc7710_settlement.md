# Extension: `erc7710Settlement`

## Summary

The `erc7710Settlement` extension enables an alternative settlement mechanism for the [`scheme_exact_evm.md`](../schemes/exact/scheme_exact_evm.md) scheme using **ERC-7710** smart contract delegations instead of EIP-3009's `transferWithAuthorization`.

When this extension is active, the Facilitator accepts ERC-7710 delegation-based payments, which enables payments from smart contract accounts (including ERC-4337 accounts, other smart accounts, multi-sig wallets, and EOAs via EIP-7702) that may not support EIP-3009 but do support ERC-7710 delegations.

## Example Use Cases

- AI agents with bounded payment authority
- Smart wallet users paying for API access
- Multi-sig wallets authorizing recurring payments
- Long-lived payment sessions with constrained permissions

## Key Differences from Standard `exact` Settlement

| Aspect | Standard `exact` (EIP-3009) | `erc7710Settlement` Extension |
|--------|----------------------------|-------------------------------|
| Payer Type | Only EIP-3009 compatible tokens | Any ERC-7710 compatible account |
| Authorization | `transferWithAuthorization` signature | Delegation + Delegation Manager address |
| Execution | Facilitator calls token contract | Facilitator calls Delegation Manager |
| Payer | Must hold funds directly | Can delegate via policy |
| Response Latency | Must wait for blockchain confirmation | Optimistic servers can respond immediately after simulation |

## `PaymentRequired`

A Facilitator advertises support for this extension by including the `erc7710Settlement` key in the `extensions` object of the `402 Payment Required` response.

```json
{
  "x402Version": "2",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "1000000",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 300,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {
    "erc7710Settlement": {
      "info": {
        "description": "The facilitator accepts ERC-7710 delegation-based settlement as an alternative to EIP-3009.",
        "version": "1"
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "delegationManager": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{40}$",
            "description": "The address of the ERC-7710 Delegation Manager contract."
          },
          "permissionContext": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]+$",
            "description": "Encoded delegation authority (hex-encoded bytes)."
          },
          "from": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{40}$",
            "description": "Address of the delegator (payer's smart account)."
          },
          "to": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{40}$",
            "description": "Address of the recipient (must match payTo)."
          },
          "value": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Payment amount in atomic token units."
          },
          "validAfter": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Unix timestamp after which the payment is valid (optional)."
          },
          "validBefore": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Unix timestamp before which the payment is valid (optional)."
          },
          "version": {
            "type": "string",
            "pattern": "^[0-9]+(\\.[0-9]+)*$",
            "description": "Schema version identifier."
          }
        },
        "required": [
          "delegationManager",
          "permissionContext",
          "from",
          "to",
          "value",
          "version"
        ]
      }
    }
  }
}
```

## Usage: `PaymentPayload`

To utilize this extension, the client must include the ERC-7710 delegation data in the `erc7710Settlement` key under `extensions`. When using this extension, the standard `payload` field (containing EIP-3009 signature/authorization) is not required.

### Example PaymentPayload

```json
{
  "x402Version": "2",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "1000000",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 300,
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  },
  "extensions": {
    "erc7710Settlement": {
      "info": {
        "delegationManager": "0x74Cb5e4eE81b86e70f9045036a1C5477de69eE87",
        "permissionContext": "0x000000000000000000000000857b06519e91e3a54538791bdbb0e22373e36b6600000000000000000000000023456789abcdef0123456789abcdef0123456789...",
        "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "value": "1000000",
        "validAfter": "1740672089",
        "validBefore": "1740672389",
        "version": "1"
      }
    }
  }
}
```

### Minimal PaymentPayload (without time bounds)

```json
{
  "x402Version": "2",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "1000000",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 300,
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "extra": {}
  },
  "extensions": {
    "erc7710Settlement": {
      "info": {
        "delegationManager": "0x74Cb5e4eE81b86e70f9045036a1C5477de69eE87",
        "permissionContext": "0x000000000000000000000000857b06519e91e3a54538791bdbb0e22373e36b66...",
        "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "value": "1000000",
        "version": "1"
      }
    }
  }
}
```

## Verification Logic

When the Facilitator receives a payload containing `erc7710Settlement` data, they must verify the following:

### Step 1: Basic Validation

1. Verify `x402Version` matches expected version (2)
2. Verify `accepted.scheme` is `"exact"`
3. Verify `accepted.network` matches the payment requirements (CAIP-2 format)
4. Verify `delegationManager` is a valid address

### Step 2: Authorization Validation

1. Verify `to` matches `paymentRequirements.payTo`
2. Verify `value` >= `paymentRequirements.amount`
3. If `validAfter` is provided: verify current time >= `validAfter`
4. If `validBefore` is provided: verify current time < `validBefore`
5. If both time bounds provided: verify `validBefore - validAfter` <= `paymentRequirements.maxTimeoutSeconds`

### Step 3: Simulation

The Facilitator MUST simulate the `redeemDelegations` call to ensure it would successfully transfer the required funds:

```solidity
// Construct the execution calldata for ERC-20 transfer
bytes memory transferCalldata = abi.encodeWithSelector(
    IERC20.transfer.selector,
    to,
    value
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
    return (true, "");
} catch (bytes memory errorData) {
    return (false, errorData);
}
```

### Simulation Validation

The simulation MUST verify that executing `redeemDelegations` would result in:

1. The `payTo` address receiving at least `amount` of the specified `asset`
2. The funds originating from the `from` address (the delegator)

## Settlement Logic

Settlement is performed by the Facilitator executing the `redeemDelegations` call on the Delegation Manager contract.

### Settlement Steps

1. **Construct execution calldata**: Build the ERC-20 `transfer` call to transfer funds from the delegator to the `payTo` address
2. **Execute `redeemDelegations`**: Call the Delegation Manager with the `permissionContext`, execution mode, and calldata
3. **Verify transfer success**: Confirm the on-chain transaction completed successfully
4. **Return settlement response**: Provide transaction hash and status

### Settlement Response

The settlement response follows the standard x402 v2 `SettleResponse` schema.

**Success:**

```json
{
  "success": true,
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "network": "eip155:8453"
}
```

**Failure:**

```json
{
  "success": false,
  "errorReason": "delegation_execution_failed",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "transaction": "",
  "network": "eip155:8453"
}
```

## Security Considerations

### Delegation Scope

- The `permissionContext` encodes the full delegation and any user-defined policies
- Facilitators do not need to parse or validate the `permissionContext` internally; instead rely on simulation
- Delegations may include spending limits, time bounds, or other constraints enforced by the Delegation Manager

### Replay Protection

- Each delegation execution is tracked by the Delegation Manager contract
- Time bounds (`validAfter`, `validBefore`) provide additional replay protection
- Nonces or execution counts may be enforced by delegation caveats

### Trust Model

- The Facilitator MUST be trusted to execute the delegation correctly and report settled payments correctly
- The Delegation Manager contract enforces all delegation constraints on-chain, and MUST be trusted by the granting user

## Appendix

### ERC-7710 Reference

ERC-7710 defines a standard interface for delegation managers that enable smart contract accounts to delegate specific capabilities to other addresses. Key concepts:

- **Delegator**: The account granting permission (typically a smart wallet)
- **Delegate**: The account receiving permission (the client submitting the payment)
- **Delegation Manager**: Contract that validates and executes delegated actions
- **Permission Context**: Encoded proof of delegation authority

### Optimistic Response Pattern

Since the Facilitator controls execution and simulation provides strong guarantees, an optimistic server MAY respond to the client immediately after successful simulation without waiting for the on-chain settlement to complete. This enables response latencies limited only by simulation speed rather than blockchain confirmation times.
