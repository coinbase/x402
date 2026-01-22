# Extension Proposal: Facilitator Fee Disclosure Extensions (`facilitatorFees`)

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
- `facilitatorId` (MUST be a valid URL for unique identification and discoverability)
- `facilitatorFeeQuote` (signed quote) OR `facilitatorFeeQuoteRef` (URL to fetch)
- `maxFacilitatorFee` (conservative upper bound for privacy)

**FacilitatorFeeQuote fields:**
- `quoteId` - Unique identifier
- `facilitatorAddress` - Signing address of the facilitator (required for signature verification)
- `model` - Fee model (`flat | bps | tiered | hybrid`)
- `asset` - Fee currency (token address)
- `flatFee`, `bps`, `minFee`, `maxFee` - Model-specific values (all fee amounts in atomic units)
- `expiry` - Unix timestamp when quote expires (MUST be ≥ payment's `validBefore`)
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
    }
  }
}
```

### B) Client → Server: `facilitatorFeeBid`

- `maxTotalFee` (hard constraint)
- `asset` (fee currency)
- `selectedQuoteId` (optional: explicitly select a quote)

**Selection semantics:**
- If `selectedQuoteId` absent → server picks any facilitator meeting constraints
- If `selectedQuoteId` present → server MUST use that facilitator or reject with error
- If `asset` doesn't match any available quote's asset → server MUST reject with error

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
      "facilitatorId": "https://x402.org/facilitator",
      "model": "flat"
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

The signature is computed over a **canonical JSON representation** of the quote following [RFC 8785 (JSON Canonicalization Scheme)](https://www.rfc-editor.org/rfc/rfc8785). To ensure deterministic signing:

1. **Exclude** `signature` and `signatureScheme` fields from the signing payload
2. **Canonicalize** per RFC 8785: sort keys lexicographically (UTF-16 code units), no whitespace, deterministic number/string serialization
3. **Hash** using the scheme-appropriate algorithm (keccak256 for EIP-191, SHA-256 for Ed25519)
4. **Sign** the hash with the facilitator's private key

> **Note**: For typical quote structures without nested objects, this simplifies to alphabetical key sorting with compact JSON—which produces RFC 8785-compliant output.

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

**For EIP-191 (EVM networks):**
1. Reconstruct the canonical payload from quote fields
2. Recover the signer address from the signature (ECDSA supports key recovery)
3. Verify recovered address matches `facilitatorAddress`

**For Ed25519 (Solana):**
1. Reconstruct the canonical payload from quote fields
2. Verify the signature directly against the provided `facilitatorAddress` public key
   (Ed25519 does not support signer recovery—verification requires the known public key)

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
fee = max(minFee, min(maxFee, floor((paymentAmount * bps) / 10000)))
```
The fee is a percentage of the payment amount, bounded by min/max constraints. Division MUST use **floor rounding** (round down) to ensure deterministic calculation across implementations.

**Important**: BPS fees depend on the payment amount, which isn't known at quote time.
- **`maxFee` is RECOMMENDED** for BPS model quotes (enables fee comparison)
- `minFee` is optional
- Clients MAY exclude BPS quotes without `maxFee` from fee-constrained routing

Clients comparing BPS quotes to flat quotes must:
1. Use `maxFee` as the upper bound for comparison if payment amount is unknown
2. Calculate the exact fee once payment amount is determined
3. Use `minFee` and `maxFee` bounds to filter options that could exceed `maxTotalFee`

Quotes with `bps` model that omit `maxFee` SHOULD be treated as "unknown upper bound" and MAY be excluded from fee-constrained routing.

### Tiered / Hybrid Models
These models combine flat and percentage components. Implementations should provide `minFee` and `maxFee` bounds to enable comparison without exposing full tier structures.

## Expiry Handling

- **Quote expiry MUST be ≥ payment's `validBefore`**: Ensures the quote remains valid for the entire payment window
- **Server receiving expired `selectedQuoteId`**: MUST reject with error; client must re-fetch quotes
- **Facilitator settling with expired quote**: MUST reject settlement
- **Quote expires after verification but before settlement**: Facilitator MUST reject; client should use quotes with sufficient buffer
- **Grace period**: Implementations MAY allow ~30 seconds for clock skew (not required)

## Privacy Considerations

Servers can preserve privacy by:
1. Providing multiple `options` without indicating which will be used
2. Providing only `maxFacilitatorFee` without specific quotes
3. Providing `facilitatorFeeQuoteRef` URLs so clients fetch quotes directly (server doesn't learn which quote client evaluated)

> **Note**: When clients fetch quotes via `facilitatorFeeQuoteRef`, the facilitator learns the client's IP address before the transaction. This is a privacy side channel. Clients requiring stronger privacy should use a proxy or prefer embedded quotes.

## Spec Change Required

This extension requires adding `extensions` to the core `SettleResponse` type:

```typescript
type SettleResponse = {
  success: boolean;
  transaction: string;
  network: Network;
  payer?: string;
  extensions?: Record<string, unknown>;  // NEW
};
```

This change is additive and backwards-compatible.

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
2. **Patient bidding**: Should `facilitatorFeeBid` include a `patient` flag to indicate willingness to wait longer for a lower quote (e.g., batched settlements)?
3. **Quote `for` field**: Should quotes include a `for` field specifying the payment amount? This would make BPS fees deterministic at quote time and enable easier fee comparison.
4. **Error codes**: Should we define standardized error codes for fee-related rejections (e.g., `QUOTE_EXPIRED`, `ASSET_MISMATCH`, `FEE_EXCEEDED`)?
5. **Privacy guidance**: Should we provide more comprehensive privacy guidance? Considerations include: URL parameters in `facilitatorFeeQuoteRef` revealing payment context, quote ID correlation across requests, and timing analysis. Current mitigation is to prefer embedded quotes or use a proxy.
