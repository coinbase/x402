# Extension: `erc4337PaymasterGasSponsoring`

## Summary

The `erc4337PaymasterGasSponsoring` extension enables **gasless UserOperation execution** for the [`userOp` asset transfer method](../schemes/exact/scheme_exact_evm.md#3-assettransfermethod-userop).

An ERC-4337 [Paymaster](https://eips.ethereum.org/EIPS/eip-4337#paymasters) is a contract that sponsors gas for UserOperations. When this extension is active, the Facilitator advertises a Paymaster that will cover gas costs, enabling smart wallet users to transact without holding native gas tokens.

---

## `PaymentRequired`

A Facilitator advertises support for this extension by including an `erc4337PaymasterGasSponsoring` entry inside the `extensions` object in the **402 Payment Required** response.

```json
{
  "x402Version": "2",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "10000",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "extra": {
        "assetTransferMethod": "userOp",
        "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {
    "erc4337PaymasterGasSponsoring": {
      "info": {
        "description": "The facilitator sponsors gas via a Paymaster contract.",
        "version": "1",
        "paymaster": "0x...",
        "paymasterVerificationGasLimit": "0x249F0",
        "paymasterPostOpGasLimit": "0xC350"
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "paymasterAndData": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]+$",
            "description": "The packed paymaster address and data to include in the UserOperation."
          },
          "version": {
            "type": "string",
            "pattern": "^[0-9]+(\\.[0-9]+)*$",
            "description": "Schema version identifier."
          }
        },
        "required": ["paymasterAndData", "version"]
      }
    }
  }
}
```

---

## Usage: `PaymentPayload`

To use this extension, the client includes the Paymaster data in the UserOperation and references the extension:

1. The **Client** constructs a UserOperation with `paymasterAndData` set to the Paymaster address and any authorization data provided by the Facilitator.
2. The **Client** signs the UserOperation (the `paymasterAndData` is included in the signed hash).
3. The **Client** includes the extension data in the payload.

### Example PaymentPayload

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "10000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": {
      "assetTransferMethod": "userOp",
      "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "userOperation": {
      "sender": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "nonce": "0x0",
      "callData": "0xa9059cbb000000000000000000000000209693bc6afc0c5328ba36faf03c514ef312287c0000000000000000000000000000000000000000000000000000000000002710",
      "callGasLimit": "0x186A0",
      "verificationGasLimit": "0x249F0",
      "preVerificationGas": "0xC350",
      "maxFeePerGas": "0x2FAF080",
      "maxPriorityFeePerGas": "0x1E8480",
      "paymasterAndData": "0x...",
      "signature": "0x..."
    }
  },
  "extensions": {
    "erc4337PaymasterGasSponsoring": {
      "info": {
        "paymasterAndData": "0x...",
        "version": "1"
      }
    }
  }
}
```

---

## Verification Logic

When the Facilitator receives a payload containing `erc4337PaymasterGasSponsoring` data:

1. **Verify** the `paymasterAndData` in the UserOperation references the expected Paymaster contract.
2. **Verify** the Paymaster has sufficient deposit in the EntryPoint to cover gas costs.
3. **Simulate** via `eth_estimateUserOperationGas` — this validates both the smart wallet signature and the Paymaster's `validatePaymasterUserOp` in a single call.

---

## Settlement Logic

Settlement follows the standard `userOp` settlement flow. The EntryPoint calls `validatePaymasterUserOp` on the Paymaster during execution, and the Paymaster's EntryPoint deposit is debited for gas costs instead of the smart wallet's deposit.
