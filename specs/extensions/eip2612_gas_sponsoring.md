# Extension: `eip2612_gas_sponsoring`

## Summary

The `eip2612_gas_sponsoring` extension enables a "gasless" approval flow to the `Permit` Contract for tokens that implement **EIP-2612** for the `schema_exact_evm.md` schema.

When this extension is active, the Facilitator agrees to accept this off-chain signature and submit it to the blockchain on the user's behalf, paying the gas fees. This is typically batched atomically with the settlement transaction.

## `PaymentRequired`

A Facilitator advertises support for this extension by including the `eip2612_gas_sponsoring` key in the `extensions` object of the `402 Payment Required` response.

```json
{
    "x402Version": "2",
    "extensions": {
      "eip2612_gas_sponsoring": {
        "info": {
          "description": "Facilitator accepts EIP-2612 gasless Permit to `Permit2` canonical contract.",
          "version": "1",
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
              "description": "The address of the ERC-20 token contract."
            },
            "amount": {
              "type": "string",
              "pattern": "^[0-9]+$",
              "description": "The amount to approve (uint256). Typically MaxUint."
            },
            "deadline": {
              "type": "string",
              "pattern": "^[0-9]+$",
              "description": "The timestamp at which the signature expires."
            },
            "signature": {
              "type": "string",
              "pattern": "^0x[a-fA-F0-9]+$",
              "description": "The 65-byte concatenated signature (r, s, v) as a hex string."
            }
          },
          "required": ["from", "asset", "amount", "deadline", "signature"]
        }
      }
    }
  }
}
```

## Usage: `PaymentPayload`

To utilize this extension, the client must generate a valid EIP-2612 signature and include it in the `eip2612_gas_sponsoring` under the key `extensions`.

### Example PaymentPayload

```json
{
  "x402Version": "2",
  "signature": "0x2d6a7588d6...",
  "permit2Authorization": {
    "permitted": {
      "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "100000"
    },
    "from": "0x....",
    "spender": "0xPermit2ProxyAddress...",
    "nonce": "0xf37466...",
    "deadline": "1740672154",
    "witness": {
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "validAfter": "1740672089",
      "extra": {}
    }
  },
  "extensions": {
    "eip2612_gas_sponsoring": {
      "info": {
        "description": "Facilitator accepts EIP-2612 gasless Permit to `Permit2` canonical contract.",
        "version": "1"
      },
      "schema": {
        "from": "0x9F86b5b01d584e2eF5AC2c7A60F3E5164d548881",
        "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "amount": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
        "deadline": "1740672154",
        "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c"
      }
    }
  }
}
```

## Verification Logic

When the Facilitator receives a payload containing `eip2612_gas_sponsoring` data, they must verify the following:

1.  **Verify** the `asset` address actually implements `IERC20Permit`.
2.  **Verify** the `signature` was signed for the correct spender (Canonical Permit2 address) and recovers to `from`.
3.  **Simulate** `x402Permit2Proxy.settleWithPermit`

## Settlement Logic

The Settlement is performed by calling the `x402Permit2Proxy.settleWithPermit`.
