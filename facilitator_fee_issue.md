# RFC: Facilitator Fee Disclosure Extension (`facilitatorFees`)

## Summary

This RFC proposes an **opt-in extension** to standardize facilitator fee disclosure for fee-aware multi-facilitator routing.

We introduce:
- **`facilitatorFeeQuote`**: Facilitator-signed fee disclosure surfaced at `PaymentRequired` time
- **`facilitatorFeeBid`** (optional): Client fee constraints surfaced in `PaymentPayload`
- **`facilitatorFeePaid`** (optional): Actual fee charged surfaced in `SettlementResponse`

> **Important**: This extension requires adding `extensions?: Record<string, unknown>` to the core `SettleResponse` type. See [Spec Change Required](#spec-change-required) for details.

## Motivation

x402 v2 supports multi-facilitator routing, but there is no standard for facilitator fee disclosure. Facilitators are beginning to charge explicit fees:

- **Coinbase CDP x402 Facilitator**: flat-fee model ($0.001/transaction after free tier)
- **Thirdweb**: percentage-based fees (30 bps / 0.3%)

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

Uses the top-level `extensions` field following the v2 extension pattern:

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
- `facilitatorAddress` - Signing address of the facilitator (required for signature verification)
- `model` - Fee model (`flat | bps | tiered | hybrid`)
- `asset` - Fee currency (token address)
- `flatFee`, `bps`, `minFee`, `maxFee` - Model-specific values
- `expiry` - Unix timestamp when quote expires
- `signature` - Facilitator signature over the canonical quote
- `signatureScheme` - Signature scheme used (`eip191` | `ed25519`)

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
- If `selectedQuoteId` present → server MUST use that facilitator or reject with error

> **Rationale**: MUST (not SHOULD) ensures client agency is enforceable. Clients can verify the `facilitatorId` in `facilitatorFeePaid` matches their selection.

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

### Canonical Quote Format

The signature is computed over a **canonical JSON representation** of the quote. To ensure deterministic signing:

1. **Exclude** `signature` and `signatureScheme` fields from the signing payload
2. **Sort** remaining fields alphabetically by key
3. **Serialize** as compact JSON (no whitespace)
4. **Hash** using the scheme-appropriate algorithm (keccak256 for EIP-191, SHA-256 for Ed25519)
5. **Sign** the hash with the facilitator's private key

**Canonical fields (in order):**
```
asset, bps, expiry, facilitatorAddress, flatFee, maxFee, minFee, model, quoteId
```

**Example canonical payload:**
```json
{"asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","expiry":1737400000,"facilitatorAddress":"0x1234...","flatFee":"1000","model":"flat","quoteId":"quote_abc123"}
```

### Verification

Clients SHOULD verify quote signatures before trusting fee information:
1. Reconstruct the canonical payload from quote fields
2. Recover the signer address from the signature
3. Verify recovered address matches `facilitatorAddress`

Reference implementation provided in `@x402/extensions/facilitator-fees`.

## Fee Model Semantics

Different fee models require different calculation approaches:

### Flat Fee Model
```
fee = flatFee
```
The fee is constant regardless of payment amount.

### BPS (Basis Points) Model
```
fee = max(minFee, min(maxFee, (paymentAmount * bps) / 10000))
```
The fee is a percentage of the payment amount, bounded by optional min/max constraints.

**Important**: BPS fees depend on the payment amount, which isn't known at quote time. Clients comparing BPS quotes to flat quotes must:
1. Use `maxFee` as the upper bound for comparison if payment amount is unknown
2. Calculate the exact fee once payment amount is determined
3. Use `minFee` and `maxFee` bounds to filter options that could exceed `maxTotalFee`

### Tiered / Hybrid Models
These models combine flat and percentage components. Implementations should provide `minFee` and `maxFee` bounds to enable comparison without exposing full tier structures.

## Expiry Handling

- **Server receiving expired `selectedQuoteId`**: MUST reject with error; client must re-fetch quotes
- **Facilitator settling with expired quote**: MUST reject settlement
- **Grace period**: Implementations MAY allow ~30 seconds for clock skew (not required)

## Privacy Considerations

Servers can preserve privacy by:
1. Providing multiple `options` without indicating which will be used
2. Providing only `maxFacilitatorFee` without specific quotes
3. Providing `facilitatorFeeQuoteRef` URLs so clients fetch quotes directly (server doesn't learn which quote client evaluated)

## Spec Change Required

> **Breaking Change**: This extension requires a modification to the core x402 type definitions.

`SettlementResponse` needs an `extensions` field added to core types:

```typescript
type SettleResponse = {
  success: boolean;
  transaction: string;
  network: Network;
  payer?: string;
  extensions?: Record<string, unknown>;  // NEW - required for this extension
};
```

This change is **additive** and backwards-compatible—existing facilitators continue to work, and existing clients will ignore the new field. However, it does modify the facilitator interface contract.

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

## Resolved Questions

- ~~**`selectedQuoteId` enforcement**: SHOULD vs MUST honor selection?~~ → **MUST** (see Selection Semantics)
- ~~**Fee model vocabulary**: Formally define `flat | bps | tiered` semantics?~~ → **Defined** (see Fee Model Semantics)
- ~~**Canonical signing format**: How to deterministically sign quotes?~~ → **Defined** (see Canonical Quote Format)
