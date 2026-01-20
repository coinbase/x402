# RFC: Facilitator Fee Disclosure Extension (`facilitatorFees`)

## Summary

This RFC proposes an **opt-in extension** to standardize facilitator fee disclosure for fee-aware multi-facilitator routing.

We introduce:
- **`facilitatorFeeQuote`**: Facilitator-signed fee disclosure surfaced at `PaymentRequired` time
- **`facilitatorFeeBid`** (optional): Client fee constraints surfaced in `PaymentPayload`
- **`facilitatorFeePaid`** (optional): Actual fee charged surfaced in `SettlementResponse`

## Motivation

x402 v2 supports multi-facilitator routing, but there is no in-band standard for facilitator fee disclosure. Facilitators are beginning to charge explicit fees:

- **Coinbase CDP x402 Facilitator**: flat-fee model ($0.001/transaction after free tier)
- **Thirdweb**: percentage-based fees (0.3% bps)

Without standardization:
- Clients cannot compare total cost across facilitators
- Multi-facilitator routing cannot become a real market
- Each facilitator invents bespoke fee disclosure formats

## Goals

- Enable **fee-aware routing** across multiple facilitators (clients compare total cost)
- Standardize fee **disclosure** without standardizing a single fee model
- Support **privacy-preserving** server behavior
- Enable **client agency** in facilitator selection while keeping simple cases simple
- Preserve backwards compatibility and extensions-first design

## Non-goals

- NOT standardizing "the best" fee model (flat vs bps vs tiered) — only disclosure
- NOT mandating facilitator discovery/selection policy
- NOT changing x402 settlement semantics — only attaching metadata

## Proposed Design

### Placement

Uses the top-level `extensions` field (not `accepts[i].extra`) following the v2 extension pattern:

```
PaymentRequired.extensions.facilitatorFees
PaymentPayload.extensions.facilitatorFees
SettlementResponse.extensions.facilitatorFees
```

### A) Server → Client: `facilitatorFeeQuote`

The `info.options[]` array contains facilitator choices:
- `facilitatorId` (URL recommended)
- `facilitatorFeeQuote` (signed quote) OR `facilitatorFeeQuoteRef` (URL to fetch)
- `maxFacilitatorFee` (conservative upper bound for privacy)

**FacilitatorFeeQuote fields:**
- `quoteId` - Unique identifier
- `model` - Fee model (`flat | bps | tiered | hybrid`)
- `asset` - Fee currency (token address)
- `flatFee`, `bps`, `minFee`, `maxFee` - Model-specific values
- `expiry` - Unix timestamp when quote expires
- `signature` - Facilitator signature
- `signatureScheme` - Signature scheme used

**Example:**

```json
"extensions": {
  "facilitatorFees": {
    "info": {
      "version": "1",
      "options": [
        {
          "facilitatorId": "https://x402.org/facilitator",
          "facilitatorFeeQuote": {
            "quoteId": "quote_abc123",
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
          "facilitatorFeeQuoteRef": "https://thirdweb.io/facilitator/fee-quote?..."
        }
      ]
    },
    "schema": { "..." }
  }
}
```

### B) Client → Server: `facilitatorFeeBid`

- `maxTotalFee` (hard constraint)
- `asset` (fee currency)
- `selectedQuoteId` (optional: explicitly select a quote)
- `patient` (optional: willing to wait/batch)

**Selection semantics:**
- If `selectedQuoteId` absent → server picks any facilitator meeting constraints
- If `selectedQuoteId` present → server SHOULD use that facilitator

**Example:**

```json
"extensions": {
  "facilitatorFees": {
    "info": {
      "version": "1",
      "facilitatorFeeBid": {
        "maxTotalFee": "2000",
        "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "selectedQuoteId": "quote_abc123"
      }
    }
  }
}
```

### C) Server → Client: `facilitatorFeePaid`

- `facilitatorFeePaid` (actual fee charged)
- `asset`, `quoteId`, `facilitatorId`, `model`

**Example:**

```json
"extensions": {
  "facilitatorFees": {
    "info": {
      "version": "1",
      "facilitatorFeePaid": "1000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "quoteId": "quote_abc123",
      "facilitatorId": "https://x402.org/facilitator"
    }
  }
}
```

## Signature Schemes

To prevent fragmentation, signature schemes are specified per network family:

| Network Family | Scheme | Description |
|----------------|--------|-------------|
| `eip155:*` | `eip191` | EIP-191 personal_sign over keccak256 of canonical quote JSON |
| `solana:*` | `ed25519` | Ed25519 over SHA-256 of canonical quote JSON |

## Expiry Handling

- **Server receiving expired `selectedQuoteId`**: SHOULD reject with error; client must re-fetch quotes
- **Facilitator settling with expired quote**: MUST reject settlement
- **Grace period**: Implementations MAY allow ~30 seconds for clock skew (not required)

## Privacy Considerations

Servers can preserve privacy by:
1. Providing multiple `options` without indicating which will be used
2. Providing only `maxFacilitatorFee` without specific quotes
3. Providing `facilitatorFeeQuoteRef` URLs so clients fetch quotes directly (server doesn't learn which quote client evaluated)

## Spec Change Required

`SettlementResponse` needs an `extensions` field added to core types:

```typescript
type SettleResponse = {
  // ... existing fields ...
  extensions?: Record<string, unknown>;  // NEW
};
```

## Backwards Compatibility

- All fields are optional extensions
- Existing clients/servers ignore unrecognized extensions
- Existing facilitators continue to work unchanged

## Implementation

Reference implementation provided in this PR:
- Spec: `specs/extensions/facilitator_fees.md`
- TypeScript: `typescript/packages/extensions/src/facilitator-fees/`
- Tests: `typescript/packages/extensions/test/facilitator-fees.test.ts`

## Open Questions

1. **Facilitator `/fee-quote` endpoint**: Standardize a facilitator API for fetching quotes directly?
2. **`selectedQuoteId` enforcement**: SHOULD vs MUST honor selection?
3. **Fee model vocabulary**: Formally define `flat | bps | tiered` semantics, or keep informational?
