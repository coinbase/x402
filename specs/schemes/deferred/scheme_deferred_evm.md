# Scheme: `deferred` on `EVM`

## Summary

The `deferred` scheme on EVM chains uses `EIP-712` signed vouchers to represent payment commitments from a buyer to a seller. Before issuing vouchers, the buyer deposits funds—denominated in a specific `ERC-20` token—into an on-chain escrow earmarked for the seller. Each voucher authorizes a payment against that escrow balance, and explicitly specifies the asset being used.
Sellers can collect and aggregate these signed messages over time, choosing when to redeem them on-chain and settling the total amount in a single transaction.
This design enables efficient, asset-flexible micropayments without incurring prohibitive gas costs for every interaction.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `signature`: The signature of the `EIP-712` voucher.
- `voucher`: parameters required to reconstruct the signed message for the operation.

### Voucher Fields

- `id`: Unique identifier for the voucher (bytes32)
- `buyer`: Address of the payment initiator (address)
- `seller`: Address of the payment recipient (address)
- `valueAggregate`: Total outstanding amount in the voucher, monotonically increasing (uint256)
- `asset`: ERC-20 token address (address)
- `timestamp`: Last aggregation timestamp (uint64)
- `nonce`: Incremented with each aggregation (uint256)
- `escrow`: Address of the escrow contract (address)
- `chainId`: Network chain ID (uint256)
- `expiry`: Expiration timestamp after which voucher cannot be collected (uint64)

Example:

```json
{
  "signature": "0x3a2f7e3b6c1d8e9c0f64f8724e5cfb8bfe9a3cdb1ad6e4a876f7d418e47e96b11a23346a1b0e60c8d3a4c4fd0150a244ab4b0e6d6c5fa4103f8fa8fd2870a3c81b",
  "voucher": {
    "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "valueAggregate": "2000000000000000000",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "timestamp": 1740673000,
    "nonce": 3,
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "chainId": 84532,
    "expiry": 1740759400
  }
}
```

Full `X-PAYMENT` header:

```json
{
  "x402Version": 1,
  "scheme": "deferred",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x3a2f7e3b6c1d8e9c0f64f8724e5cfb8bfe9a3cdb1ad6e4a876f7d418e47e96b11a23346a1b0e60c8d3a4c4fd0150a244ab4b0e6d6c5fa4103f8fa8fd2870a3c81b",
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
      "valueAggregate": "2000000000000000000",
      "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
      "timestamp": 1740673000,
      "nonce": 3,
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "chainId": 84532,
      "expiry": 1740759400
    }
  }
}
```

## `paymentRequirements` extra object

The `extra` object in the "Payment Required Response" should contain the following fields:
- A `type` field to indicate wether it's a new voucher or an aggregation
- If this is a new voucher being created:
  - `voucher`: A simplified voucher object with:
    - `id`: The voucher id
    - `escrow`: The address of the escrow contract
- If an existing voucher is being aggregated:
  - `signature`: The signature of the latest voucher corresponding to the given `id`
  - `voucher`: The latest voucher corresponding to the given `id`

Example:

```json
{
  ...
  "extra": {
    "type": "new",
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    }
  }
}

{
  ...
  "extra": {
    "type": "aggregation",
    "signature": "0x3a2f7e3b6c1d8e9c0f64f8724e5cfb8bfe9a3cdb1ad6e4a876f7d418e47e96b11a23346a1b0e60c8d3a4c4fd0150a244ab4b0e6d6c5fa4103f8fa8fd2870a3c81b",
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
      "valueAggregate": "2000000000000000000",
      "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
      "timestamp": 1740673000,
      "nonce": 3,
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "chainId": 84532,
      "expiry": 1740759400
    }
  }
}
```

## Verification

The following steps are required to verify a deferred payment:

1. **Signature validation**: Verify the EIP-712 signature is valid
2. **Payment requirements matching**:
    - Verify scheme is `"deferred"`
    - Verify `paymentPayload.network` matches `paymentRequirements.network`
    - Verify `paymentRequirements.payTo` matches `paymentPayload.voucher.seller`
    - Verify `paymentPayload.voucher.asset` matches `paymentRequirements.asset`
    - Verify `paymentPayload.voucher.chainId` matches the chain specified by `paymentRequirements.network`
3. **Voucher aggregation validation** (if aggregating an existing voucher):
    - Verify `nonce` equals the previous `nonce + 1`
    - Verify `valueAggregate` is equal to the previous `valueAggregate + paymentRequirements.maxAmountRequired`
    - Verify `timestamp` is greater than the previous `timestamp`
    - Verify `buyer`, `seller`, `asset`, `escrow` and `chainId` all match the previous voucher values
4. **Amount validation**:
    - Verify `paymentPayload.voucher.valueAggregate` is enough to cover `paymentRequirements.maxAmountRequired` plus previous voucher value aggregate if it's an aggregate voucher
5. **Escrow balance check**:
    - Verify the `buyer` has enough of the `asset` (ERC20 token) in the escrow to cover the valueAggregate in the `payload.voucher`
    - Verify `id` has not been already collected in the escrow, or if it has, that the new balance is greater than what was already paid (in which case the difference will be paid)
6. **Expiry validation**:
    - Verify the voucher has not expired by checking that the current timestamp is less than or equal to `expiry`
    - Verify `paymentPayload.voucher.expiry` and `paymentPayload.voucher.timestamp` dates make sense
7. **Transaction simulation** (optional but recommended):
    - Simulate the voucher collection to ensure the transaction would succeed on-chain

## Settlement

Settlement is performed via the facilitator calling the `collect` function on the escrow contract with the `payload.signature` and `payload.voucher` parameters from the `X-PAYMENT` header. This can be initiated by buyer's request or the facilitator holding the vouchers could trigger automatic settlement based on pre-agreed conditions.

Multiple vouchers may be collected in a single transaction, using the `collectMany` function.

## Appendix

### `X-Payment-Buyer` header

The `X-PAYMENT-BUYER` header allows buyers to notify sellers about their identity before signing any voucher or message. This enables sellers to determine whether to request a new voucher or check their voucher store for existing vouchers for further aggregation. It's important to note this header requires no proof of identity, the seller assumes the buyer is who it claims to be. This is not a problem however since the payment flow will later require valid signatures which an impostor wont be able to forge.

The header contains the buyer's EVM address as a simple string:

```
X-PAYMENT-BUYER: 0x209693Bc6afc0C5328bA36FaF03C514EF312287C
```

The buyer needs to add this header when initially requesting access to a resource. Failing to provide the header will result in new vouchers being created on each interaction, defeating the purpose of the `deferred` scheme.

Example 402 response with an existing voucher:
```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "deferred",
    "network": "base-sepolia",
    "maxAmountRequired": "1000000",
    "payTo": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "extra": {
      "type": "aggregation",
      "signature": "0x3a2f7e3b...",
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "5000000",
        "nonce": 2,
        // ... other voucher fields
      }
    }
  }]
}
```

### Facilitator specification

Facilitators supporting the `deferred` scheme should implement a voucher store for sellers and new APIs. Specification for these can be found here:
- [Voucher Store specification](./voucher_store.md)
- [Deferred Facilitator specification](./scheme_deferred_evm_facilitator.md)

### Escrow contract specification

The full specification for the deferred escrow contract can be found here: [DeferredPaymentEscrow specification](./scheme_deferred_evm_escrow_contract.md)