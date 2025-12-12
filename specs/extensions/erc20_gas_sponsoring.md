# Extension: `erc20_approval_gas_sponsoring`

## Summary

The `erc20_approval_gas_sponsoring` extension enables a **gasless ERC-20 approval flow** for the `schema_exact_evm.md` schema.

Because these tokens lack native gasless approvals:

- The **Client** must sign a normal EVM transaction calling `approve(Permit2, amount)`.
- The **Facilitator** agrees to:

  - Fund the Client’s wallet with enough native gas token.
  - Broadcast the Client’s signed approval transaction.
  - Immediately perform settlement via `x402Permit2Proxy` after the approval confirms.

This flow is typically executed using an **atomic batch transaction**.

---

# PaymentRequired

A Facilitator advertises support for this extension by including an `erc20_approval_gas_sponsoring` entry inside the `extensions` object in the **402 Payment Required** response.

```json
{
  "x402Version": "2",
  "extensions": {
    "erc20_approval_gas_sponsoring": {
      "info": {
        "description": "Facilitator accepts a raw signed approval transaction and will sponsor the gas fees.",
        "version": "1"
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "from": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{40}$",
            "description": "The address of the sender."
          },
          "asset": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{40}$",
            "description": "The ERC-20 token contract address."
          },
          "amount": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Approval amount (uint256). Typically MaxUint."
          },
          "signedTransaction": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]+$",
            "description": "RLP-encoded signed transaction calling ERC20.approve()."
          }
        },
        "required": ["from", "asset", "amount", "signedTransaction"]
      }
    }
  }
}
```

---

# Usage: PaymentPayload

To use this extension:

1. The **Client constructs** a normal Ethereum transaction calling:

   ```
   token.approve(Permit2, amount)
   ```

2. The Client signs this transaction off-chain.

3. The Client inserts the **raw signed transaction hex** under:

```
extensions.erc20_approval_gas_sponsoring
```

### Client Implementation Note

The Client must ensure:

- `maxFee` & `maxPriorityFee` are aligned with the current network prices.
- `nonce` matches the current on-chain nonce of the Client wallet

Incorrect fees or nonce values invalidate the signed transaction.

---

## Example PaymentPayload

```json
{
  "x402Version": "2",
  "signature": "0xPermit2WitnessSignature...",
  "permit2Authorization": {
    "permitted": {
      "token": "0xStandardTokenAddress...",
      "amount": "100000"
    },
    "from": "0xUserWallet...",
    "spender": "0xPermit2ProxyAddress...",
    "nonce": "0xf37466...",
    "deadline": "1740672154",
    "witness": {
      "to": "0xReceiverAddress...",
      "validAfter": "1740672089",
      "extra": {}
    }
  },
  "extensions": {
    "erc20_approval_gas_sponsoring": {
      "info": {
        "description": "Facilitator accepts a raw signed approval transaction and will sponsor the gas fees.",
        "version": "1"
      },
      "schema": {
        "from": "0xUserWallet...",
        "asset": "0xStandardTokenAddress...",
        "amount": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
        "signedTransaction": "0xf86d8201..."
      }
    }
  }
}
```

---

## Verification Logic

Upon receiving a `PaymentPayload` containing `erc20_approval_gas_sponsoring`:

### 1. Decode the raw signed transaction

- Perform RLP decoding.

### 2. Validate transaction fields

- **Signer** matches `from`
- **`to` address** equals the `asset` contract
- **calldata** corresponds to:

  ```
  approve(Permit2CanonicalAddress, amount)
  ```

- **nonce** matches user’s current on-chain nonce
- **maxFee** and \*_maxPriorityFee_ match the current network prices

### 3. Simulate the full execution sequence

The Facilitator must simulate in a single atomic batch transaction:

1. **Funding** → sending native gas token to the user
2. **Approval Relay** → broadcasting the user’s signed approval
3. **Settlement** → calling `x402Permit2Proxy.settle`

---

## Settlement Logic

The Facilitator constructs an **atomic bundle** with the following ordered operations:

1. Gas Funding: Send enough native gas token to the user (`from`) to pay for gas used by the approval transaction.

2. Broadcast Approval: Broadcast the Client-provided `signedTransaction` which calls `ERC20.approve(Permit2, amount)`

3. x402PermitProxy Settlement: Call `x402Permit2Proxy.settle()`
