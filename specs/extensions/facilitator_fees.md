# Extension: `facilitatorFees`

## Summary

The `facilitatorFees` extension standardizes **facilitator fee disclosure** to enable fee-aware multi-facilitator routing. It prioritizes server-side routing (where servers select the optimal facilitator) while providing optional client-side preferences.

This extension introduces:

**Server-Side (Core):**
- **Facilitator Quote API**: Standardized `GET /x402/fee-quote` endpoint for dynamic fee discovery
- **`facilitatorFeePaid`**: Settlement receipt showing actual fees charged

**Client-Side (Optional):**
- **`facilitatorFeeBid`**: Client preferences for network, asset, and fee constraints

---

## Motivation

x402 v2 supports multi-facilitator routing, but there is no in-band standard for facilitator fee disclosure. Facilitators are beginning to charge fees:
- Coinbase CDP x402 Facilitator: flat-fee model ($0.001/transaction after free tier)
- Thirdweb: percentage-based fees (0.3% bps)

Without standardization:
- Servers cannot compare cost across facilitators for optimal routing
- Multi-facilitator routing cannot become a real market
- Each facilitator invents bespoke fee disclosure formats

### Design Philosophy

**Server-side routing is primary.** In most x402 flows, the server selects which facilitator to use. The client doesn't need to know or control this decision—they care about the total `amount` they're paying. The server handles the complexity of fetching quotes, comparing fees, and routing optimally.

**Client preferences are a lightweight handshake.** Clients may optionally express preferences (e.g., "I prefer USDC on Base" or "don't charge me more than X in fees") but this is not required. The server decides; the client gets a receipt.

---

## Placement

Uses the top-level `extensions` field following the v2 extension pattern:

```
PaymentPayload.extensions.facilitatorFees   (client → server, optional)
SettlementResponse.extensions.facilitatorFees (server → client, receipt)
```

---

# Part 1: Server-Side Fee Discovery (Core)

This section covers the core components that enable servers to perform fee-aware multi-facilitator routing.

## Facilitator Quote API

To enable **server-side multi-facilitator routing**, facilitators SHOULD expose a standardized quote endpoint. This API is the primary mechanism for obtaining fee quotes.

### Endpoint

```
GET /x402/fee-quote?network=<CAIP-2>&asset=<token>&amount=<optional>
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | string | Yes | CAIP-2 network identifier (e.g., `eip155:8453`) |
| `asset` | string | Yes | Token address for fee currency |
| `amount` | string | No | Payment amount in atomic units (enables exact BPS calculation) |

### Response

```json
{
  "facilitatorFeeQuote": {
    "quoteId": "quote_abc123",
    "facilitatorAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "network": "eip155:8453",
    "model": "flat",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "flatFee": "1000",
    "expiry": 1737400000,
    "signature": "0x...",
    "signatureScheme": "eip191"
  }
}
```

### Error Response

```json
{
  "error": "UNSUPPORTED_NETWORK",
  "message": "Network eip155:1 is not supported"
}
```

### Standard Error Codes

| Code | Description |
|------|-------------|
| `UNSUPPORTED_NETWORK` | Facilitator does not support the requested network |
| `UNSUPPORTED_ASSET` | Facilitator does not support the requested asset |
| `INVALID_AMOUNT` | Amount parameter is malformed |

### Why This Matters

This API enables:
- **Server-side routing**: Servers fetch quotes from multiple facilitators and pick the cheapest
- **Dynamic pricing**: Real-time fee discovery instead of hardcoded values
- **Transparency**: Fee breakdowns visible even when routing is server-controlled

> **Note**: Facilitators MAY implement proprietary APIs. This endpoint is RECOMMENDED for interoperability but not required. Servers can use out-of-band configuration for facilitators that don't expose this endpoint.

---

## FacilitatorFeeQuote Structure

The `FacilitatorFeeQuote` object contains facilitator-signed fee disclosure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quoteId` | string | Yes | Unique identifier for this quote |
| `facilitatorAddress` | string | Yes | Signing address of the facilitator (required for signature verification) |
| `network` | string | Yes | CAIP-2 network identifier (e.g., `eip155:8453`). Ensures quote is self-describing and replay-resistant across networks |
| `model` | string | Yes | Fee model: `flat`, `bps`, `tiered`, `hybrid` |
| `asset` | string | Yes | Fee currency (token address or identifier) |
| `flatFee` | string | No | Flat fee amount in atomic units (for `flat` model) |
| `bps` | number | No | Basis points (for `bps` model) |
| `minFee` | string | No | Minimum fee in atomic units |
| `maxFee` | string | Recommended | Maximum fee in atomic units. **Recommended for `bps` model** to enable fee comparison |
| `expiry` | number | Yes | Unix timestamp when quote expires. MUST be ≥ payment's `validBefore` |
| `signature` | string | Yes | Facilitator signature over the quote |
| `signatureScheme` | string | Yes | Signature scheme used (see Signature Schemes) |

See [Fee Model Semantics](#fee-model-semantics) for detailed requirements per model type.

---

## Settlement Receipt: `facilitatorFeePaid`

After settlement, servers SHOULD include a fee receipt in the `SettlementResponse`. This provides transparency to clients about the actual fees charged.

### Example

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
| `facilitatorId` | string | No | Facilitator that processed payment |
| `model` | string | No | Fee model applied |

### Why This Matters

The settlement receipt:
- **Provides transparency**: Clients see exactly what they paid in facilitator fees
- **Enables auditing**: Clients can verify fees match expectations
- **Supports analytics**: Applications can track fee costs over time

### Core Dependency: `SettleResponse.extensions`

> **✅ Resolved:** The x402 v2 spec now includes `extensions?: Record<string, unknown>` in the `SettleResponse` type (added in PR #1003). This allows extensions like `facilitatorFees` to attach metadata to settlement responses.

---

# Part 2: Client Fee Preferences (Optional)

This section covers optional client-side features. Most clients will not need these—the server handles routing and clients get a receipt. However, clients MAY express preferences as a lightweight handshake.

## `facilitatorFeeBid` in PaymentPayload

Clients MAY include fee preferences in their `PaymentPayload` via the `facilitatorFees` extension. This is purely advisory—the server is not required to honor these preferences but SHOULD attempt to.

### Example

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
          "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        }
      }
    }
  }
}
```

### FacilitatorFeeBid Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `maxTotalFee` | string | No | Maximum acceptable fee in atomic units (soft constraint) |
| `asset` | string | No | Preferred fee currency |

### Semantics

- **These are preferences, not requirements.** The server SHOULD try to honor them but MAY route differently based on availability, reliability, or other factors.
- **The `amount` field is authoritative.** Clients already consent to the total payment amount. The fee bid is additional context for cost-conscious routing, not a mechanism to reduce the total.
- **Simple cases need nothing.** Most clients can omit this extension entirely.

### Use Cases

1. **Cost-conscious clients**: Express "prefer facilitators charging ≤ $0.001"
2. **Asset preferences**: Express "I prefer paying fees in USDC rather than native tokens"
3. **Simple clients**: Omit the extension entirely—server handles everything

---

## Fee Model Semantics

Different fee models require different calculation approaches:

### Flat Fee Model

```
fee = flatFee
```

The fee is constant regardless of payment amount. For `flat` model quotes, `flatFee` MUST be provided.

### BPS (Basis Points) Model

```
fee = max(minFee, min(maxFee, floor((paymentAmount * bps) / 10000)))
```

The fee is a percentage of the payment amount, bounded by min/max constraints. Division MUST use **floor rounding** (round down) to ensure deterministic calculation across implementations.

For `bps` model quotes:
- `bps` MUST be provided (basis points, e.g., 30 = 0.3%)
- `maxFee` is **RECOMMENDED** to enable fee comparison
- `minFee` is optional

**Important**: BPS fees depend on the payment amount, which isn't known at quote time.

Servers comparing BPS quotes to flat quotes must:
1. Use `maxFee` as the upper bound for comparison if payment amount is unknown
2. Calculate the exact fee once payment amount is determined
3. Use `minFee` and `maxFee` bounds to filter options that could exceed constraints

Quotes with `bps` model that omit `maxFee` SHOULD be treated as "unknown upper bound" and MAY be excluded from fee-constrained routing.

### Tiered / Hybrid Models

These models combine flat and percentage components. Implementations should provide `minFee` and `maxFee` bounds to enable comparison without exposing full tier structures.

---

## Signature Schemes

To prevent fragmentation, this extension specifies signature schemes per network family:

| Network Family | Scheme | Description |
|----------------|--------|-------------|
| `eip155:*` | `eip191` | EIP-191 personal_sign over keccak256 of canonical quote JSON |
| `solana:*` | `ed25519` | Ed25519 over SHA-256 of canonical quote JSON |

The `signatureScheme` field MUST be one of the above values. Implementations SHOULD reject quotes with unrecognized signature schemes.

### Quote Signing

The signature is computed over a canonical JSON representation of the quote (excluding `signature` and `signatureScheme` fields). 

Canonicalization MUST follow [RFC 8785 (JSON Canonicalization Scheme)](https://www.rfc-editor.org/rfc/rfc8785):
- Object keys MUST be sorted lexicographically (UTF-16 code units)
- No whitespace between tokens
- Numbers serialized without redundant characters
- Strings use minimal escape sequences per RFC 8785 §3.2.2.2

> **Implementation Note**: For simple quote structures without nested objects or special characters, alphabetical key sorting with compact JSON serialization is sufficient and produces RFC 8785-compliant output.

**Canonical fields (in order):**
```
asset, bps, expiry, facilitatorAddress, flatFee, maxFee, minFee, model, network, quoteId
```

**Example canonical payload:**
```json
{"asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","expiry":1737400000,"facilitatorAddress":"0x1234...","flatFee":"1000","model":"flat","network":"eip155:8453","quoteId":"quote_abc123"}
```

### Verification

Servers SHOULD verify quote signatures before trusting fee information:

**For EIP-191 (EVM networks):**
1. Reconstruct the canonical payload from quote fields
2. Recover the signer address from the signature (ECDSA supports key recovery)
3. Verify recovered address matches `facilitatorAddress`

**For Ed25519 (Solana):**
1. Reconstruct the canonical payload from quote fields
2. Verify the signature directly against the provided `facilitatorAddress` public key
   (Ed25519 does not support signer recovery—verification requires the known public key)

Reference implementation provided in `@x402/extensions/facilitator-fees`.

---

## Expiry Handling

- **Quote expiry MUST be ≥ payment's `validBefore`**: Ensures the quote remains valid for the entire payment window
- **Facilitator settling with expired quote**: MUST reject settlement
- **Quote expires after verification but before settlement**: Facilitator MUST reject; servers should use quotes with sufficient buffer
- **Grace period**: Implementations MAY allow ~30 seconds for clock skew (not required)

---

## Backwards Compatibility

- All fields are optional extensions
- Existing clients/servers ignore unrecognized `extensions` fields
- Existing facilitators continue to work unchanged

---

## Open Questions

1. **Quote `for` field**: Should quotes include a `for` field specifying the payment amount? This would make BPS fees deterministic at quote time and enable easier fee comparison.

2. **Error codes**: Should we define standardized error codes for fee-related rejections (e.g., `QUOTE_EXPIRED`, `ASSET_MISMATCH`)?

3. **Receipt detail level**: Should `facilitatorFeePaid` include more breakdown details (e.g., base fee vs. network costs)?
