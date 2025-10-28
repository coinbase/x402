# Scheme: `deferred` on `EVM`

## Summary

The `deferred` scheme on EVM chains uses `EIP-712` signed vouchers to represent payment commitments from a buyer to a seller. Before issuing vouchers, the buyer deposits funds—denominated in a specific `ERC-20` token—into an on-chain escrow earmarked for the seller. Each voucher authorizes a payment against that escrow balance, and explicitly specifies the asset being used.
Sellers can collect and aggregate these signed messages over time, choosing when to redeem them on-chain and settling the total amount in a single transaction. The funds in the escrow contract are subject to a thawing period when withdrawing, this gives sellers guarantee they will be able to redeem in time.
Interactions with the escrow contract for the buyer (depositing, thawing and withdrawing funds) are all performed via signed authorizations to remove the need for gas and blockchain access. These authorizations are executed and translated into on-chain actions by the facilitator.
This design enables efficient, asset-flexible micropayments without incurring prohibitive gas costs for every interaction.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `signature`: The signature of the `EIP-712` voucher.
- `voucher`: parameters required to reconstruct the signed message for the operation.
- `depositAuthorization` (optional): A signed authorization allowing the facilitator to deposit funds into escrow on behalf of the buyer. This enables gasless deposits for new buyers or when additional funds are needed.

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
    "chainId": 84532
  }
}
```

Full `X-PAYMENT` header (without deposit authorization):

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
      "chainId": 84532
    }
  }
}
```

### Deposit Authorization Fields (optional)

The `depositAuthorization` object enables gasless escrow deposits by allowing the facilitator to execute deposits on behalf of the buyer. This is particularly useful for first-time buyers or when escrow balance needs to be topped up. Note that only assets implementing ERC-2612 permit extension are supported for gasless deposits.

The structure consists of two parts:

**Required:**
- `depositAuthorization`: EIP-712 signed authorization for the escrow contract
  - `buyer`: Address of the buyer authorizing the deposit (address)
  - `seller`: Address of the seller receiving the escrow deposit (address)
  - `asset`: ERC-20 token contract address (address)
  - `amount`: Amount to deposit in atomic token units (uint256)
  - `nonce`: Unique bytes32 for replay protection (bytes32)
  - `expiry`: Authorization expiration timestamp (uint64)
  - `signature`: EIP-712 signature of the deposit authorization (bytes)

**Optional:**
- `permit`: EIP-2612 permit for the ERC-20 token
  - `owner`: Token owner address (address)
  - `spender`: Escrow contract address (address)
  - `value`: Token amount to approve (uint256)
  - `nonce`: Token contract nonce for the permit (uint256/bigint)
  - `deadline`: Permit expiration timestamp (uint256)
  - `domain`: Token's EIP-712 domain
    - `name`: Token name (string)
    - `version`: Token version (string)
  - `signature`: EIP-2612 signature of the permit (bytes)

Example `X-PAYMENT` header with deposit authorization:

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
      "chainId": 84532
    },
    "depositAuthorization": {
      "permit": {
        "owner": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "spender": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "value": "5000000",
        "nonce": "0",
        "deadline": 1740759400,
        "domain": {
          "name": "USD Coin",
          "version": "2"
        },
        "signature": "0x8f9e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f1b"
      },
      "depositAuthorization": {
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
        "amount": "5000000",
        "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "expiry": 1740759400,
        "signature": "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b"
      }
    }
  }
}
```

## `paymentRequirements` extra object

The `extra` object in the "Payment Required Response" should contain the following fields:

### Common Fields
- `type`: Indicates whether this is a `"new"` voucher or an `"aggregation"` of an existing voucher
- `account` (optional): Current escrow account details for the buyer-seller-asset tuple
  - `balance`: Current escrow balance in atomic token units
  - `assetAllowance`: Current token allowance for the escrow contract
  - `assetPermitNonce`: Current permit nonce for the token contract
  - `assetDomainName`: EIP-712 domain name for the asset
  - `assetDomainVersion`: EIP-712 domain version for the asset
  - `facilitator`: Address of the facilitator managing the escrow

### For New Vouchers (`type: "new"`)
- `voucher`: A simplified voucher object containing:
  - `id`: The voucher id to use for the new voucher (bytes32)
  - `escrow`: The address of the escrow contract (address)

### For Aggregation (`type: "aggregation"`)
- `signature`: The signature of the latest voucher corresponding to the given `id` (bytes)
- `voucher`: The complete latest voucher corresponding to the given `id` (all voucher fields)

### Examples

**New voucher (without account details):**

```json
{
  "extra": {
    "type": "new",
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27"
    }
  }
}
```

**Aggregation (with account details):**

```json
{
  "extra": {
    "type": "aggregation",
    "account": {
      "balance": "5000000",
      "assetAllowance": "5000000",
      "assetPermitNonce": "0",
      "assetDomainName": "USDC",
      "assetDomainVersion": "2",
      "facilitator": "https://facilitator.com"
    },
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
      "chainId": 84532
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
6. **Deposit authorization validation** (if present):
    - Verify the `depositAuthorization.depositAuthorization.signature` is a valid EIP-712 signature
    - Verify `depositAuthorization.depositAuthorization.buyer` matches `paymentPayload.voucher.buyer`
    - Verify `depositAuthorization.depositAuthorization.seller` matches `paymentPayload.voucher.seller`
    - Verify `depositAuthorization.depositAuthorization.asset` matches `paymentPayload.voucher.asset`
    - Verify `depositAuthorization.depositAuthorization.expiry` has not passed
    - Verify the nonce has not been used before by checking the escrow contract
    - If `permit` is present:
        - Verify the `permit.signature` is a valid EIP-2612 signature
        - Verify the permit nonce is valid by checking the token contract
        - Verify `permit.owner` matches the buyer
        - Verify `permit.spender` matches the escrow contract address
        - Verify `permit.value` is sufficient to cover the deposit amount
        - Verify `permit.deadline` has not passed
7. **Transaction simulation** (optional but recommended):
    - Simulate the voucher collection to ensure the transaction would succeed on-chain

## Deposit Authorization Execution

When a `depositAuthorization` is included in the payment payload, the facilitator should execute it before storing the voucher. This ensures that the buyer has sufficient funds escrowed before the voucher is stored, preventing invalid vouchers from being accepted.

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