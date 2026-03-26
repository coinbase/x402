# Scheme: `deferred` on `EVM`

## Summary

The `deferred` scheme on EVM chains uses `EIP-712` signed vouchers to represent payment commitments from a buyer to a seller. Before issuing vouchers, the buyer deposits funds—denominated in a specific `ERC-20` token—into an on-chain escrow earmarked for the seller. Each voucher authorizes a payment against that escrow balance, and explicitly specifies the asset being used.
Sellers can collect and aggregate these signed messages over time, choosing when to redeem them on-chain and settling the total amount in a single transaction. The funds in the escrow contract are subject to a thawing period when withdrawing, this gives sellers guarantee they will be able to redeem in time.
Interactions with the escrow contract for the buyer (depositing, thawing and withdrawing funds) are all performed via signed authorizations to remove the need for gas and blockchain access. These authorizations are executed and translated into on-chain actions by the facilitator.
This design enables efficient, asset-flexible micropayments without incurring prohibitive gas costs for every interaction.


## Protocol sequencing

The deferred scheme follows the standard x402 flow with a key difference: payments are stored off-chain as signed vouchers during the main resource request flow but collected on-chain later in a deferred way.

### Resource Request Flow

1. **Client** sends an HTTP request to a **resource server**, optionally including a `PAYER-IDENTIFIER` header to identify themselves.

2. **Resource server** responds with `402 Payment Required`. The response follows the standard x402 v2 format with a `resource` object and `accepts` array. The `PaymentRequirements.extra` field includes scheme-specific static information (e.g., EIP-712 domain info) and, if the buyer identified themselves via `PAYER-IDENTIFIER`, buyer state including escrow balance and voucher history.

3. **Client** creates a signed `voucher` based on the `PaymentRequirements` and embeds it into the `PaymentPayload`. The `PaymentPayload` follows x402 v2 format with `resource`, `accepted` (the selected `PaymentRequirements`), and `payload` (the scheme-specific data). The voucher can be an aggregation on top of a previous one, or a new one if there is no pre-existing history. Optionally, the client can include a signed `deposit` authorization for gasless escrow top-up.

4. **Client** sends the HTTP request with the `PAYMENT-SIGNATURE` header containing the `PaymentPayload`.

5. **Resource server** verifies the `PaymentPayload` is valid either via local verification or by POSTing the `PaymentPayload` and `PaymentRequirements` to the `/verify` endpoint of a `facilitator`.

6. **Facilitator** verifies the payload and voucher are valid and returns a `VerifyResponse`.

7. If valid, **resource server** performs the work to fulfill the request.

8. **Resource server** settles the payment either locally or by POSTing the `PaymentPayload` and `PaymentRequirements` to the `/settle` endpoint of a `facilitator`. Note that the payment is not actually collected at this stage, the voucher is stored locally or at the facilitator for deferred on-chain collection. If the `PaymentPayload` included a `deposit` authorization, it is executed on-chain at this point.

9. **Resource server** returns `200 OK` with the resource and a `PAYMENT-RESPONSE` header.

### On-Chain Settlement Flow

On-chain settlement is decoupled from the request flow and triggered at the seller's or facilitator's discretion:

1. **Resource server or Facilitator** decides to settle vouchers based on a threshold, schedule, or manual trigger.

2. **Resource server or Facilitator** collects by interacting with the escrow contract on the blockchain. This transfers payment from the buyer's escrow balance to the seller.

## `PAYER-IDENTIFIER` header

The `PAYER-IDENTIFIER` header allows buyers to provide **unauthenticated identification** to servers before signing any voucher or message. This enables sellers to customize the payment requirements based on pre-existing voucher history with the buyer—either to initiate a new voucher or to retrieve an existing one for further aggregation.

Note that this header requires no proof of identity; the seller assumes the buyer is who they claim to be. This is not a problem since vouchers contain no private information and the payment flow will later require valid signatures, which an impostor won't be able to forge.

The header contains the buyer's EVM address as a simple string:

```
PAYER-IDENTIFIER: 0x209693Bc6afc0C5328bA36FaF03C514EF312287C
```

The buyer needs to add this header when initially requesting access to a resource. Failing to provide the header will result in new vouchers being created on each interaction, defeating the purpose of the `deferred` scheme.

## `PaymentRequirements` for `deferred`

In addition to the standard x402 `PaymentRequirements` fields, the `deferred` scheme on EVM requires the following in the `extra` field:

### Static Metadata

- `escrow`: Address of the escrow contract (address)
- `name`: EIP-712 domain name for the asset (string)
- `version`: EIP-712 domain version for the asset (string)
- `voucherStorage`: Declares where the seller intends to store vouchers, either `"server"` or `"facilitator"`

### Dynamic Per-Buyer Data

When a `PAYER-IDENTIFIER` header is provided, the scheme injects buyer-specific state:

- `account` (optional): Current escrow account details for the buyer-seller-asset tuple
  - `balance`: Current escrow balance in atomic token units
  - `assetAllowance`: Current token allowance for the escrow contract
  - `assetPermitNonce`: Current permit nonce for the token contract
- `voucher` (optional): The latest voucher for this buyer-seller-asset tuple
- `signature` (optional): The signature of the latest voucher

If `voucher` and `signature` are present, the client should aggregate onto the existing voucher. If absent, the client should create a new voucher.

### Examples

**New voucher (no existing state):**

```json
{
  "extra": {
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "name": "USDC",
    "version": "2",
    "voucherStorage": "server"
  }
}
```

**Aggregation (with existing voucher):**

```json
{
  "extra": {
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "name": "USDC",
    "version": "2",
    "voucherStorage": "server",
    "account": {
      "balance": "5000000",
      "assetAllowance": "115792089237",
      "assetPermitNonce": "0"
    },
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
      "valueAggregate": "2000000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "timestamp": 1740673000,
      "nonce": 3,
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "chainId": 84532
    },
    "signature": "0x3a2f7e3b6c1d8e9c0f64f8724e5cfb8bfe9a3cdb1ad6e4a876f7d418e47e96b11a23346a1b0e60c8d3a4c4fd0150a244ab4b0e6d6c5fa4103f8fa8fd2870a3c81b"
  }
}
```

## `PaymentPayload` `payload` Field

The `payload` field of the `PaymentPayload` header must contain the following fields:

- `signature`: The signature of the `EIP-712` voucher.
- `voucher`: parameters required to reconstruct the signed message for the operation.
- `deposit` (optional): A signed authorization allowing the facilitator to deposit funds into escrow on behalf of the buyer. This enables gasless deposits for new buyers or when additional funds are needed.

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

Full `PaymentPayload` header (aggregation scenario, without deposit):

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/resource",
    "description": "Example resource",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "deferred",
    "network": "eip155:84532",
    "amount": "1000000",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "payTo": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "maxTimeoutSeconds": 60,
    "extra": {
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "name": "USDC",
      "version": "2",
      "voucherStorage": "server",
      "account": {
        "balance": "5000000",
        "assetAllowance": "115792089237",
        "assetPermitNonce": "0"
      },
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "1000000",
        "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
        "timestamp": 1740672000,
        "nonce": 2,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "signature": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b1c"
    }
  },
  "payload": {
    "signature": "0x3a2f7e3b6c1d8e9c0f64f8724e5cfb8bfe9a3cdb1ad6e4a876f7d418e47e96b11a23346a1b0e60c8d3a4c4fd0150a244ab4b0e6d6c5fa4103f8fa8fd2870a3c81b",
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
      "valueAggregate": "2000000",
      "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
      "timestamp": 1740673000,
      "nonce": 3,
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "chainId": 84532
    }
  },
  "extensions": {}
}
```

Note how the new voucher in `payload` has `nonce: 3` and `valueAggregate: "2000000"`, which is the previous voucher's `valueAggregate` plus the `accepted.amount`, and the `nonce` was incremented by 1.

### Deposit Fields (optional)

The `deposit` object enables gasless escrow deposits by allowing the facilitator to execute deposits on behalf of the buyer. This is particularly useful for first-time buyers or when escrow balance needs to be topped up.

The object structure consists of two parts:

- **`authorization`**: Authorizes the escrow contract to deposit a specific amount of tokens on behalf of the buyer for a specific seller. This is an EIP-712 signed message that the escrow contract verifies before accepting the deposit.

- **`permit`** (optional): An EIP-2612 permit that grants the escrow contract approval to transfer the buyer's tokens. This is only needed if the buyer hasn't already approved the escrow contract to spend their tokens. If the buyer has sufficient allowance, the permit can be omitted.

The facilitator executes the deposit by first calling `permit` (if provided) to set the token allowance, then calling the escrow's deposit function with the `authorization`.

**`authorization` fields:**
- `buyer`: Address of the buyer authorizing the deposit (address)
- `seller`: Address of the seller receiving the escrow deposit (address)
- `asset`: ERC-20 token contract address (address)
- `amount`: Amount to deposit in atomic token units (uint256)
- `nonce`: Unique bytes32 for replay protection (bytes32)
- `expiry`: Authorization expiration timestamp (uint64)
- `signature`: EIP-712 signature of the authorization (bytes)

**`permit` fields (optional):**
- `owner`: Token owner address (address)
- `spender`: Escrow contract address (address)
- `value`: Token amount to approve (uint256)
- `nonce`: Token contract nonce for the permit (uint256/bigint)
- `deadline`: Permit expiration timestamp (uint256)
- `domain`: Token's EIP-712 domain
  - `name`: Token name (string)
  - `version`: Token version (string)
- `signature`: EIP-2612 signature of the permit (bytes)

Example `PaymentPayload` header with deposit:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/resource",
    "description": "Example resource",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "deferred",
    "network": "eip155:84532",
    "amount": "1000000",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "payTo": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "maxTimeoutSeconds": 60,
    "extra": {
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "name": "USDC",
      "version": "2",
      "voucherStorage": "server",
      "account": {
        "balance": "0",
        "assetAllowance": "0",
        "assetPermitNonce": "0"
      }
    }
  },
  "payload": {
    "signature": "0x3a2f7e3b6c1d8e9c0f64f8724e5cfb8bfe9a3cdb1ad6e4a876f7d418e47e96b11a23346a1b0e60c8d3a4c4fd0150a244ab4b0e6d6c5fa4103f8fa8fd2870a3c81b",
    "voucher": {
      "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
      "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
      "valueAggregate": "1000000",
      "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
      "timestamp": 1740673000,
      "nonce": 1,
      "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
      "chainId": 84532
    },
    "deposit": {
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
      "authorization": {
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
        "amount": "5000000",
        "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "expiry": 1740759400,
        "signature": "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b"
      }
    }
  },
  "extensions": {}
}
```

## Verification

The following steps are required to verify a `deferred` payment:

1. **Signature validation**: Verify the EIP-712 signature is valid
2. **Payment requirements matching**:
    - Verify `paymentPayload.accepted.scheme` is `"deferred"`
    - Verify `paymentPayload.accepted.network` matches `paymentRequirements.network`
    - Verify `paymentRequirements.payTo` matches `paymentPayload.payload.voucher.seller`
    - Verify `paymentPayload.payload.voucher.asset` matches `paymentRequirements.asset`
    - Verify `paymentPayload.payload.voucher.chainId` matches the chain specified by `paymentRequirements.network`
3. **Voucher aggregation validation** (if aggregating an existing voucher):
    - Verify `nonce` equals the previous `nonce + 1`
    - Verify `valueAggregate` is equal to the previous `valueAggregate + paymentRequirements.amount`
    - Verify `timestamp` is greater than the previous `timestamp`
    - Verify `buyer`, `seller`, `asset`, `escrow` and `chainId` all match the previous voucher values
4. **Amount validation**:
    - Verify `paymentPayload.payload.voucher.valueAggregate` is enough to cover `paymentRequirements.amount` plus previous voucher value aggregate if it's an aggregate voucher
5. **Escrow balance check**:
    - Verify the `buyer` has enough of the `asset` (ERC20 token) in the escrow to cover the valueAggregate in the `paymentPayload.payload.voucher`
    - Verify `id` has not been already collected in the escrow, or if it has, that the new balance is greater than what was already paid (in which case the difference will be paid)
6. **Deposit validation** (if present):
    - Verify the `paymentPayload.payload.deposit.authorization.signature` is a valid EIP-712 signature
    - Verify `paymentPayload.payload.deposit.authorization.buyer` matches `paymentPayload.payload.voucher.buyer`
    - Verify `paymentPayload.payload.deposit.authorization.seller` matches `paymentPayload.payload.voucher.seller`
    - Verify `paymentPayload.payload.deposit.authorization.asset` matches `paymentPayload.payload.voucher.asset`
    - Verify `paymentPayload.payload.deposit.authorization.expiry` has not passed
    - Verify the nonce has not been used before by checking the escrow contract
    - If `paymentPayload.payload.deposit.permit` is present:
        - Verify the `paymentPayload.payload.deposit.permit.signature` is a valid EIP-2612 signature
        - Verify the permit nonce is valid by checking the token contract
        - Verify `permit.owner` matches the buyer
        - Verify `permit.spender` matches the escrow contract address
        - Verify `permit.value` is sufficient to cover the deposit amount
        - Verify `permit.deadline` has not passed
7. **Transaction simulation** (optional but recommended):
    - Simulate the voucher collection to ensure the transaction would succeed on-chain

## Settlement

Settlement in the `deferred` scheme occurs during the standard x402 `/settle` flow but does **not** transfer funds on-chain. Instead, it:

1. **Executes deposit** (if `deposit` is included in the payment payload): The facilitator executes the deposit authorization to ensure the buyer has sufficient funds escrowed before storing the voucher.

2. **Stores the voucher**: Depending on the `voucherStorage` configuration:
   - `"server"`: The server stores the voucher locally.
   - `"facilitator"`: The facilitator stores the voucher on behalf of the server (facilitator must support this through an extension).

The voucher is now held for later on-chain collection.

## Collection

Collection is the on-chain settlement of vouchers, performed separately from the request flow. This is what actually transfers funds from the buyer's escrow balance to the seller.

The facilitator calls the `collect` function on the escrow contract with the voucher and signature. This can be initiated by:
- **Seller request**: The seller explicitly requests collection of their vouchers
- **Automatic trigger**: The facilitator collects based on pre-agreed conditions (threshold, schedule, etc.)

Multiple vouchers can be collected in a single transaction using the `collectMany` function, reducing gas costs.

## Funds Recovery

Buyers can recover unused funds from their escrow accounts through the **flush** mechanism. This enables gasless fund recovery by signing an authorization that the facilitator executes on their behalf.

### How It Works

1. **Buyer signs** a `FlushAuthorization` (EIP-712)
2. **Buyer submits** to facilitator's custom endpoint
3. **Facilitator executes** `flushWithAuthorization` on the escrow contract
4. **Contract performs** two operations:
   - Withdraws any funds that have already completed thawing
   - Starts thawing any remaining balance

To fully recover funds, the buyer will need to flush at least twice. First time the thawing will be initiated, next one will withdraw the funds.

## Appendix

### A. Escrow Contract Specification

The `deferred` scheme requires an on-chain escrow contract that:
- Holds buyer deposits earmarked for specific sellers
- Processes voucher collection
- Enforces thawing period for withdrawals
- Supports gasless operations via signed authorizations

Full specification: [DeferredPaymentEscrow specification](./scheme_deferred_evm_escrow_contract.md)

### B. Facilitator Custom Endpoints

The `deferred` scheme requires facilitator endpoints beyond the standard x402 `/verify` and `/settle`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/deferred/buyers/:buyer` | GET | Query on-chain account data and voucher state |
| `/deferred/buyers/:buyer/flush` | POST | Execute gasless fund recovery for buyer |
| `/deferred/vouchers/collect` | POST | Submit vouchers for on-chain settlement |

Full specification: [Deferred Facilitator specification](./scheme_deferred_evm_facilitator.md)

### C. `deferred-voucher-store` (Facilitator Extension)

Optional extension indicating the facilitator can store vouchers on behalf of servers. 
Full specification: [`deferred-voucher-store` extension](../../extensions/deferred-voucher-store.md)