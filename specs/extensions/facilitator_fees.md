# Extension: `facilitatorFees`

## Summary

The `facilitatorFees` extension standardizes **facilitator fee disclosure** to enable fee-aware multi-facilitator routing. It allows facilitators to disclose their fee structures, clients to express fee constraints, and servers to report actual fees paid after settlement.

This extension introduces three components:
- **`facilitatorFeeQuote`**: Facilitator-signed fee disclosure surfaced at `PaymentRequired` time
- **`facilitatorFeeBid`** (optional): Client fee constraints/preferences surfaced in `PaymentPayload`
- **`facilitatorFeePaid`** (optional): Actual fee charged, surfaced in `SettlementResponse`

---

## Motivation

x402 v2 supports multi-facilitator routing, but there is no in-band standard for facilitator fee disclosure. Facilitators are beginning to charge fees:
- Coinbase CDP x402 Facilitator: flat-fee model ($0.001/transaction after free tier)
- Thirdweb: percentage-based fees (0.3% bps)

Without standardization:
- Clients cannot compare total cost across facilitators
- Multi-facilitator routing cannot become a real market
- Each facilitator invents bespoke fee disclosure formats

---

## `PaymentRequired`

A server advertises facilitator fee options by including the `facilitatorFees` extension in the `extensions` object of the **402 Payment Required** response.

The extension follows the standard v2 pattern:
- **`info`**: Contains the fee disclosure data
- **`schema`**: JSON Schema that validates the structure of `info`

### Example

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://api.example.com/data",
    "description": "Premium data endpoint",
    "mimeType": "application/json"
  },
  "accepts": [ ... ],
  "extensions": {
    "facilitatorFees": {
      "info": {
        "version": "1",
        "options": [
          {
            "facilitatorId": "https://x402.org/facilitator",
            "facilitatorFeeQuote": {
              "quoteId": "quote_abc123",
              "facilitatorAddress": "0x1234567890abcdef1234567890abcdef12345678",
              "model": "flat",
              "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              "flatFee": "1000",
              "expiry": 1737400000,
              "signature": "0x...",
              "signatureScheme": "eip191"
            }
          },
          {
            "facilitatorId": "https://thirdweb.io/facilitator",
            "facilitatorFeeQuoteRef": "https://thirdweb.io/facilitator/fee-quote?network=eip155:8453"
          },
          {
            "facilitatorId": "https://other.facilitator.io",
            "maxFacilitatorFee": "5000"
          }
        ]
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "version": { "type": "string" },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "facilitatorId": { "type": "string" },
                "facilitatorFeeQuote": { "type": "object" },
                "facilitatorFeeQuoteRef": { "type": "string" },
                "maxFacilitatorFee": { "type": "string" }
              },
              "required": ["facilitatorId"]
            }
          }
        },
        "required": ["version", "options"]
      }
    }
  }
}
```

---

## FacilitatorFeeQuote Structure

The `facilitatorFeeQuote` object contains facilitator-signed fee disclosure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quoteId` | string | Yes | Unique identifier for this quote |
| `facilitatorAddress` | string | Yes | Signing address of the facilitator (required for signature verification) |
| `model` | string | Yes | Fee model: `flat`, `bps`, `tiered`, `hybrid` |
| `asset` | string | Yes | Fee currency (token address or identifier) |
| `flatFee` | string | No | Flat fee amount in atomic units (for `flat` model) |
| `bps` | number | No | Basis points (for `bps` model) |
| `minFee` | string | No | Minimum fee in atomic units |
| `maxFee` | string | Recommended | Maximum fee in atomic units. **Recommended for `bps` model** to enable fee comparison |
| `expiry` | number | Yes | Unix timestamp when quote expires |
| `signature` | string | Yes | Facilitator signature over the quote |
| `signatureScheme` | string | Yes | Signature scheme used (see below) |

### Fee Model Requirements

#### Flat Fee Model
For `flat` model quotes, `flatFee` MUST be provided.

#### BPS (Basis Points) Model
For `bps` model quotes:
- `bps` MUST be provided (basis points, e.g., 30 = 0.3%)
- `maxFee` SHOULD be provided to enable fee comparison
- `minFee` is optional

Quotes without `maxFee` MAY be excluded from fee-constrained routing. Routing algorithms vary per client—some may prefer flat fees, others may accept uncapped BPS.

#### Tiered / Hybrid Models
For complex models, `minFee` and `maxFee` bounds SHOULD be provided to enable comparison without exposing full tier structures.

---

### Alternative: `facilitatorFeeQuoteRef`

Instead of embedding the quote, servers MAY provide a URL where clients can fetch the quote directly:

```json
{
  "facilitatorId": "https://thirdweb.io/facilitator",
  "facilitatorFeeQuoteRef": "https://thirdweb.io/facilitator/fee-quote?network=eip155:8453&amount=100000"
}
```

### Alternative: `maxFacilitatorFee`

For privacy or simplicity, servers MAY provide only a conservative upper bound:

```json
{
  "facilitatorId": "https://other.facilitator.io",
  "maxFacilitatorFee": "5000"
}
```

---

## `PaymentPayload`

Clients MAY include fee constraints in their `PaymentPayload` via the `facilitatorFees` extension:

```json
{
  "x402Version": 2,
  "resource": { ... },
  "accepted": { ... },
  "payload": { ... },
  "extensions": {
    "facilitatorFees": {
      "info": {
        "version": "1",
        "facilitatorFeeBid": {
          "maxTotalFee": "2000",
          "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "selectedQuoteId": "quote_abc123",
          "patient": false
        }
      }
    }
  }
}
```

### FacilitatorFeeBid Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `maxTotalFee` | string | Yes | Maximum acceptable fee in atomic units |
| `asset` | string | Yes | Fee currency |
| `selectedQuoteId` | string | No | Explicitly select a specific quote |
| `patient` | boolean | No | Willing to wait/batch for lower fees |

### Selection Semantics

- If `selectedQuoteId` is **absent**: Server picks any facilitator meeting `maxTotalFee` constraint
- If `selectedQuoteId` is **present**: Server **MUST** use the facilitator associated with that quote, or reject the request with an error

> **Rationale**: MUST (not SHOULD) ensures client agency is enforceable. Clients can verify the `facilitatorId` in `facilitatorFeePaid` matches their selection. Without mandatory enforcement, fee-aware routing becomes meaningless as servers could always route to more expensive facilitators.

This keeps simple cases simple while enabling agency for clients who fetch quotes via `facilitatorFeeQuoteRef`.

---

## `SettlementResponse`

After settlement, servers MAY include fee receipt information:

```json
{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:8453",
  "payer": "0x...",
  "extensions": {
    "facilitatorFees": {
      "info": {
        "version": "1",
        "facilitatorFeePaid": "1000",
        "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "quoteId": "quote_abc123",
        "facilitatorId": "https://x402.org/facilitator",
        "model": "flat"
      }
    }
  }
}
```

### FacilitatorFeePaid Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `facilitatorFeePaid` | string | Yes | Actual fee charged in atomic units |
| `asset` | string | Yes | Fee currency |
| `quoteId` | string | No | Quote that was used |
| `facilitatorId` | string | No | Facilitator that processed payment |
| `model` | string | No | Fee model applied |

### Spec Dependency: `SettleResponse.extensions`

> **⚠️ Required Change:** The current x402 v2 spec does not include an `extensions` field in `SettlementResponse`. 
>
> This extension requires adding the following to the core `SettleResponse` type:
> ```typescript
> extensions?: Record<string, unknown>;
> ```
>
> This change is **additive** and backwards-compatible—existing facilitators continue to work, and existing clients will ignore the new field. However, it modifies the facilitator interface contract and must be implemented before this extension can report fees paid.

---

## Signature Schemes

To prevent fragmentation, this extension specifies signature schemes per network family:

| Network Family | Scheme | Description |
|----------------|--------|-------------|
| `eip155:*` | `eip191` | EIP-191 personal_sign over keccak256 of canonical quote JSON |
| `solana:*` | `ed25519` | Ed25519 over SHA-256 of canonical quote JSON |

The `signatureScheme` field MUST be one of the above values. Implementations SHOULD reject quotes with unrecognized signature schemes.

### Quote Signing

The signature is computed over a canonical JSON representation of the quote (excluding `signature` and `signatureScheme` fields). Fields MUST be sorted alphabetically for canonicalization.

---

## Expiry Handling

- **Server receiving expired `selectedQuoteId`**: MUST reject with error; client must re-fetch quotes
- **Facilitator settling with expired quote**: MUST reject settlement
- **Grace period**: Implementations MAY allow ~30 seconds for clock skew (not required)

---

## Privacy Considerations

Servers can preserve privacy by:
1. Providing multiple `options` without indicating which will be used
2. Providing only `maxFacilitatorFee` without specific quotes
3. Providing `facilitatorFeeQuoteRef` URLs so clients fetch quotes directly (server doesn't learn which quote client evaluated)

**Important:**
- Quotes SHOULD NOT include payer identity
- Avoid stable quote identifiers that enable cross-request correlation
- Quotes are signed and expiry-bounded; clients can retain proofs without trusting the server

---

## Backwards Compatibility

- All fields are optional extensions
- Existing clients/servers ignore unrecognized `extensions` fields
- Existing facilitators continue to work unchanged
