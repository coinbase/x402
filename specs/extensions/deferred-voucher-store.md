# Extension: `deferred-voucher-store`

## Summary

The `deferred-voucher-store` extension enables voucher storage and retrieval for the `deferred` payment scheme. It provides a pluggable interface that allows servers to choose where vouchers are stored - locally or delegated to a facilitator.

This is a **Server ↔ Client** extension with optional **Facilitator** involvement for storage.

**Key Design Principle:** The extension defines WHAT operations are needed (store/retrieve vouchers). The server chooses WHERE storage happens by selecting an appropriate backend implementation. This addresses facilitator portability concerns - servers can store vouchers locally and switch facilitators without losing voucher state.

---

## PaymentRequired

Server advertises support and current voucher state:

```json
{
  "extensions": {
    "deferred-voucher-store": {
      "info": {
        "type": "aggregation",
        "voucher": {
          "id": "0x...",
          "nonce": 5,
          "valueAggregate": "5000000",
          "buyer": "0x...",
          "seller": "0x...",
          "asset": "0x...",
          "escrow": "0x...",
          "timestamp": 1703123456,
          "chainId": 84532
        },
        "signature": "0x...",
        "account": {
          "balance": "10000000",
          "assetAllowance": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
          "assetPermitNonce": "0"
        }
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "voucher": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "nonce": { "type": "integer" },
              "valueAggregate": { "type": "string" },
              "buyer": { "type": "string" },
              "seller": { "type": "string" },
              "asset": { "type": "string" },
              "escrow": { "type": "string" },
              "timestamp": { "type": "integer" },
              "chainId": { "type": "integer" }
            },
            "required": ["id", "nonce", "valueAggregate", "buyer", "seller", "asset", "escrow", "timestamp", "chainId"]
          },
          "signature": { "type": "string" }
        },
        "required": ["voucher", "signature"]
      }
    }
  }
}
```

---

## `info` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Response type: `"aggregation"` (existing voucher) or `"initial"` (no prior voucher) |
| `voucher` | object | No | Current voucher state (omitted when `type: "initial"`) |
| `signature` | string | No | Signature for current voucher (omitted when `type: "initial"`) |
| `account` | object | Yes | Buyer's escrow account information |

### `type` Values

- **`initial`**: No existing voucher for this buyer-seller-asset combination. Client creates a new voucher with `nonce: 0`.
- **`aggregation`**: Existing voucher found. Client increments `nonce` and adds payment amount to `valueAggregate`.

### `voucher` Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for this buyer-seller pair (bytes32 hex) |
| `nonce` | integer | Current nonce (client increments by 1) |
| `valueAggregate` | string | Total accumulated value (client adds payment amount) |
| `buyer` | string | Buyer address |
| `seller` | string | Seller/payTo address |
| `asset` | string | ERC-20 token contract address |
| `escrow` | string | Escrow contract address |
| `timestamp` | integer | Unix timestamp of last aggregation |
| `chainId` | integer | Network chain ID |

### `account` Fields

| Field | Type | Description |
|-------|------|-------------|
| `balance` | string | Buyer's current escrow balance |
| `assetAllowance` | string | Token allowance for escrow contract |
| `assetPermitNonce` | string | Current EIP-2612 permit nonce |

---

## PaymentPayload

Client echoes the extension with updated voucher:

```json
{
  "extensions": {
    "deferred-voucher-store": {
      "voucher": {
        "id": "0x...",
        "nonce": 6,
        "valueAggregate": "6000000",
        "buyer": "0x...",
        "seller": "0x...",
        "asset": "0x...",
        "escrow": "0x...",
        "timestamp": 1703123500,
        "chainId": 84532
      },
      "signature": "0x..."
    }
  }
}
```

The client:
1. Increments `nonce` by 1
2. Adds payment amount to `valueAggregate`
3. Updates `timestamp` to current time
4. Signs the voucher using EIP-712

---

## Server Behavior

### On PaymentRequired

1. Read buyer address from `payer-identifier` header (if available)
2. Query voucher store for existing voucher
3. Return `type: "initial"` or `type: "aggregation"` with current state
4. Include account balance information for client validation

### On Payment Verification

1. Validate voucher fields match expected values
2. Verify `nonce == previousNonce + 1`
3. Verify `valueAggregate >= previousValueAggregate + paymentAmount`
4. Forward to facilitator for signature verification and escrow balance check

### On Settlement Success

1. Store the new voucher and signature in the voucher store
2. This voucher becomes the baseline for the next aggregation

---

## Facilitator Support

Facilitators MAY advertise voucher storage capability:

```json
// GET /supported
{
  "kinds": [...],
  "extensions": ["deferred-voucher-store"]
}
```

When a facilitator supports this extension, servers MAY delegate storage operations to the facilitator instead of storing vouchers locally.

---

## VoucherStore Interface

Implementations MUST provide these operations:

```typescript
interface VoucherStore {
  // Store a new/aggregated voucher after successful settlement
  storeVoucher(voucher: Voucher, signature: string): Promise<void>;

  // Get latest voucher for aggregation (by buyer-seller-asset)
  getLatestVoucher(
    buyer: string,
    seller: string,
    asset: string
  ): Promise<{ voucher: Voucher; signature: string } | null>;

  // Get account balance information
  getAccountInfo(
    buyer: string,
    seller: string,
    asset: string,
    escrow: string,
    chainId: number
  ): Promise<AccountInfo>;
}
```

### Implementation Options

**Option A: Server stores locally (portable)**

```typescript
const extension = createDeferredVoucherStoreExtension({
  store: new ServerVoucherStore(database)
});
```

**Option B: Server delegates to facilitator**

```typescript
const extension = createDeferredVoucherStoreExtension({
  store: new FacilitatorVoucherStore(facilitatorClient)
});
```

The server chooses the backend. The extension interface remains the same.

---

## Security Considerations

- **Voucher Signatures**: Vouchers are EIP-712 signed by the buyer. The facilitator verifies signatures before approving payments.
- **Nonce Ordering**: Strict `nonce == previousNonce + 1` prevents replay and ensures ordering.
- **Escrow Balance**: The facilitator checks that escrow balance covers `valueAggregate` before verification succeeds.
- **Storage Integrity**: If using local storage, servers MUST ensure voucher data is not corrupted or lost. Lost vouchers cannot be reconstructed.
- **Facilitator Portability**: Servers storing vouchers locally can switch facilitators without losing state. Servers delegating storage to a facilitator are dependent on that facilitator's availability.

---

## Parallel Request Limitations

The current nonce-based design does not support parallel requests well. Each payment must wait for the previous voucher to be stored before the next nonce can be used.

Future versions may address this with:
- Nonce ranges (client reserves a range of nonces)
- Multiple voucher IDs per buyer-seller pair

