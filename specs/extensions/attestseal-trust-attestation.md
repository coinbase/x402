# Extension: `attestseal-trust-attestation`

## Summary

`attestseal-trust-attestation` is an optional x402 extension that lets a paying client decide *whether* to pay before selecting a payment scheme. The resource server includes a cryptographically signed third-party trust attestation in the 402 response; the client verifies the signature locally against the issuer's published DID document and applies its own policy (transaction limit, user confirmation, refusal) keyed on the attestation's recommendation and assurance basis.

The attestation is issuer-agnostic. Any DID-method-web entity can mint attestations; agents authenticate per-issuer via their own allow-list. The reference issuer is AttestSeal (`did:web:attestseal.com`), but no single trust authority is privileged by the protocol.

## Why an extension and not a scheme

Schemes describe *how* funds move. This extension describes evidence the resource server attaches to the payment challenge so the client can decide *whether* to use any scheme at all. The attestation is orthogonal to the scheme/network pair and works identically across `exact` on Base, `exact` on Solana, `upto` on EVM, and any future combination.

## Status

Optional. Composable with all current x402 schemes and transports. Wire shape and field placement follow the x402 extension convention; behavioral requirements (signature semantics, verification flow) are normative.

## Wire shape (primary)

The attestation is delivered as a value inside the `extra` field of a `PaymentRequirements` entry, under the key `attestseal-trust-attestation`. This is the x402-idiomatic transport and SHOULD be the default for both servers and clients.

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base",
  "asset": "0x...",
  "amount": "0.10",
  "...": "...",
  "extra": {
    "attestseal-trust-attestation": {
      "domain": "merchant.example",
      "issuer": "did:web:attestseal.com",
      "issuedAt": "2026-05-02T14:00:00Z",
      "expiresAt": "2026-05-09T14:00:00Z",
      "boundOrigin": "https://merchant.example",
      "trustScore": 78,
      "recommendation": "PROCEED",
      "confidence": "high",
      "assuranceBasis": "earned_proceed",
      "scoringModel": "attestseal-v1.5.1-weights",
      "siteCategory": "consumer",
      "cautionReason": null,
      "parentCompany": null,
      "parentFloorInherited": false,
      "agentPolicyHint": "proceed_earned",
      "signature": "M4OqKvuOiu...",
      "signatureKeyId": "did:web:attestseal.com#signing-key-1"
    }
  }
}
```

`signature` and `signatureKeyId` sit alongside the canonical fields; the signed payload is everything *except* those two and the optional `paymentRequirementsHash` (described below).

## Wire shape (secondary, compatibility)

For environments where embedding additional JSON in `PaymentRequirements` is awkward (CDN-edge stamping, stateless reverse proxies, transports that constrain body shape), the same canonical attestation MAY be carried as sibling `X-AttestSeal-*` HTTP response headers on the 402. The header form is documented at [`X-AttestSeal-* Header Specification`](https://github.com/AttestSeal/attestseal/blob/main/spec/X-ATTESTSEAL-HEADERS.md).

Server / client guidance:

- Servers MAY emit either, both, or only the embedded extension. The embedded extension is RECOMMENDED.
- Clients SHOULD prefer the embedded extension when present and MAY support the header form for backward compatibility with stamping tools that don't have access to the response body.
- When both are present in the same response, the embedded extension takes precedence; a mismatch between the two is a signal of misconfiguration and the client SHOULD reject the response.

## The signed attestation object

```jsonc
{
  "domain":            "<merchant host>",
  "issuer":            "<did:web:...>",
  "issuedAt":          "<RFC 3339>",
  "expiresAt":         "<RFC 3339>",
  "boundOrigin":       "<scheme://host[:port]|null>",
  "trustScore":        <integer 0..100>,
  "recommendation":    "PROCEED" | "CAUTION" | "DENY",
  "confidence":        "high" | "medium" | "low",
  "assuranceBasis":    "<string>",
  "scoringModel":      "<string>",
  "siteCategory":      "<string|null>",
  "cautionReason":     "<string|null>",
  "parentCompany":     "<string|null>",
  "parentFloorInherited": <bool>,
  "agentPolicyHint":   "<string>"
}
```

Field-by-field:

- **`domain`** (required): the resource-server host this attestation refers to. MUST equal the host of the URL that returned the 402.
- **`issuer`** (required): DID of the attesting authority (`did:web:...`).
- **`issuedAt`** / **`expiresAt`** (required): RFC 3339 timestamps. Clients MUST reject expired attestations.
- **`boundOrigin`** (required, may be `null`): when set, the attestation is bound to a specific origin (`https://merchant.example`, `https://api.merchant.example`, etc.) and clients MUST reject if the request URL's origin doesn't match. When `null`, only `domain` is enforced. Lets merchants narrow the attestation to a specific subdomain if they want to.
- **`trustScore`** (required): integer 0-100. Implementation-specific; agents should not threshold on the raw number alone, prefer the `recommendation` + `assuranceBasis` pair.
- **`recommendation`** (required): the agent-actionable verdict. Three values; clients SHOULD apply policy keyed on this plus `assuranceBasis`.
- **`confidence`** (required): how complete the underlying evidence is. Distinguishes "we checked everything and the score is solid" from "we couldn't reach the homepage so the score is best-effort."
- **`assuranceBasis`** (required): a string that names the kind of trust the recommendation rests on. Values are issuer-defined; AttestSeal uses `well_known_tranco_anchor`, `earned_proceed`, `registered_proceed`, `kyc_verified`, `tenant_platform_earned`, `infrastructure_earned`, `api_service_earned`, `tracking`, `not_recommended`. The `_earned` suffix is significant: it tells agents the score did NOT come from parent-rank inheritance, so a merchant on a tenant platform (vercel.app, github.io, myshopify.com) cannot piggyback on the platform's reputation.
- **`scoringModel`** (required): versioned model identifier. Old attestations remain valid under their original model.
- **`siteCategory`** (optional): `consumer` / `tenant_platform` / `infrastructure` / `tracking` / `api_service`. Helps agents reason about platform context.
- **`cautionReason`** (optional, set when `recommendation == "CAUTION"`): explains *why* CAUTION. Issuer-defined values.
- **`parentCompany`** (optional): human-readable parent name when the merchant matches the issuer's parent-company registry.
- **`parentFloorInherited`** (optional, default `false`): cryptographic confirmation that the score did NOT inherit from a parent's reputation rank.
- **`agentPolicyHint`** (optional): convenience string naming the recommended policy action explicitly (`proceed_normal`, `proceed_with_platform_context`, `do_not_pay_tracking`, etc.).

## Per-challenge binding (optional, recommended)

The signed attestation above commits to `domain`, `boundOrigin`, and a TTL window: enough to prevent cross-domain replay and bound replay-after-compromise. To prevent replay across distinct payment challenges *within* the same domain (e.g., an attacker capturing a valid attestation from a $0.10 endpoint and replaying it on a $500 endpoint), the resource server SHOULD include an unsigned `paymentRequirementsHash` field alongside the extension entry:

```json
"extra": {
  "attestseal-trust-attestation": { ... signed attestation ... },
  "attestseal-payment-requirements-hash": "sha256:abc123..."
}
```

The hash is computed by the server over the canonical JSON of the same `PaymentRequirements` object the attestation is attached to (sorted keys, no whitespace, omitting the `extra.attestseal-*` fields themselves). Clients SHOULD recompute the hash from the `PaymentRequirements` they actually received and reject if mismatched. The issuer does not sign this field because the issuer has no view of merchant-specific payment requirements; the binding is server-asserted and client-verified. The combination of (signed domain attestation) plus (unsigned-but-locally-recomputable challenge binding) gives end-to-end protection against both cross-domain and within-domain replay without requiring the issuer to mint per-challenge attestations.

A merchant who wants stronger guarantees (an issuer-signed per-challenge attestation) MAY do so by passing the challenge hash into the issuer's API at attestation-mint time; the issuer SHOULD include it in the signed payload as a `requestBindingHash` field if supported. AttestSeal's reference implementation supports this via `?bind=<hash>` on the check endpoint (post-launch).

## Signature

The signature commits to the SHA-256 of the canonical JSON form of the signed attestation object: keys sorted alphabetically, separators `(",", ":")`, no whitespace, UTF-8 encoded, `signature` and `signatureKeyId` excluded. Signature algorithm is Ed25519. The signature value is multibase-encoded with `M` prefix (RFC-aligned base64pad).

The verification key is referenced by its DID URL (e.g., `did:web:attestseal.com#signing-key-1`) and resolved by fetching the issuer DID document at `https://<host>/.well-known/did.json`. Clients SHOULD cache the DID document for 24 hours and force-refresh on signature-verification failure (handles key-rotation race).

## Verification flow (paying agent)

1. **Extract** the attestation object from `extra.attestseal-trust-attestation` (or, in the secondary header transport, reconstruct from `X-AttestSeal-*`).
2. **Authorize the issuer**: confirm `issuer` is on the agent's allow-list. Reject otherwise.
3. **Bind to domain**: confirm `domain` matches the host of the URL that returned the 402.
4. **Bind to origin** if `boundOrigin` is non-null: confirm the request URL's origin matches. Reject otherwise.
5. **Check freshness**: confirm `expiresAt` is in the future.
6. **Check per-challenge binding** if `attestseal-payment-requirements-hash` is present: recompute the hash from the received `PaymentRequirements` (canonical form, with `extra.attestseal-*` removed) and compare. Reject on mismatch.
7. **Resolve the verification key**: fetch the issuer DID document (cached 24h). Locate the verification method whose `id` matches `signatureKeyId`.
8. **Verify the signature**: reconstruct the canonical signing form (sorted-keys JSON, no whitespace, UTF-8) over all attestation fields *except* `signature` and `signatureKeyId`. SHA-256 the bytes. Ed25519 verify against the public key from step 7.
9. **Apply policy** keyed on `recommendation` plus `assuranceBasis` (or `agentPolicyHint`).

If any step fails, the agent SHOULD fall back to a direct API call to the issuer (`GET https://api.<issuer-host>/v1/check/<domain>?refresh=true`) before refusing payment. The fallback adds one round-trip but preserves the trust guarantee.

## Server flow (resource server)

1. Look up the merchant's most recent attestation from the issuer (cached locally up to `expiresAt`).
2. If absent or expired, fetch a fresh one.
3. Canonicalize the `PaymentRequirements` for the current challenge and compute the SHA-256.
4. Embed the attestation in `extra.attestseal-trust-attestation` and the hash in `extra.attestseal-payment-requirements-hash`.
5. Return the 402.

The reference Python implementation (`attestseal-x402` on PyPI, post-launch) provides middleware for FastAPI / Flask / aiohttp that does steps 1-4 automatically. A Cloudflare Worker template is available for CDN-edge stamping (header transport).

## Security considerations

**Cross-domain replay.** Prevented by `domain` (signed) plus step 3 of verification.

**Origin-narrow replay.** Prevented when `boundOrigin` is set plus step 4 of verification.

**Cross-challenge replay within the same domain.** Prevented when `attestseal-payment-requirements-hash` is present plus step 6 of verification. Without this binding, an attacker who captures a valid attestation can present it on different `PaymentRequirements` (different amount, different scheme, different resource) until `expiresAt`. Resource servers issuing high-value payments SHOULD include the binding.

**Replay after merchant compromise.** Bounded by `expiresAt`. Default TTL is issuer-specific; AttestSeal defaults to 7 days. Issuers MAY emit shorter-TTL attestations for merchants in a "watching" state. The protocol does not currently support pre-expiry revocation; future versions may add a revocation list at the DID document level.

**Key rotation.** The DID document SHOULD list prior keys with a `revoked` timestamp so attestations issued before rotation continue to verify until they expire. Clients with cached DID documents will briefly fail verification during rotation; the fallback rule (force-refresh DID on bad signature) handles this.

**Information leakage.** The attestation is server-issued and static; processing it does not communicate the agent's identity, IP, or User-Agent to the issuer.

**Trust-on-first-use of the issuer DID.** The first DID document fetch relies on TLS to authenticate the response. Issuers SHOULD serve DID documents over HTTPS with publicly-CT-logged certificates. Clients with stronger trust requirements MAY pin the DID document out-of-band.

**No privileged status for any single issuer.** This extension does not bless any one trust authority. Agents are expected to maintain their own allow-list of issuer DIDs and to apply policy per-issuer if they wish (e.g., higher transaction limits for issuers with rigorous KYC integration).

## Reference issuer: AttestSeal

The reference implementation is AttestSeal (`did:web:attestseal.com`), an independent trust attestation layer for AI agent commerce. AttestSeal scores 1M+ domains under a published versioned model (`attestseal-v1.5.1-weights`), publishes the dataset under CC-BY-4.0, signs every attestation with Ed25519, and does not handle payments. Methodology and source are open at [github.com/AttestSeal/attestseal](https://github.com/AttestSeal/attestseal).

The protocol described here does not require AttestSeal as the issuer. Any DID-method-web entity can issue attestations; agents authenticate per-issuer via their own allow-list.

## Implementations

| Implementation | Language | Path |
|---|---|---|
| Server middleware (FastAPI / Flask / aiohttp) | Python | [`sdk/x402/`](https://github.com/AttestSeal/attestseal/tree/main/sdk/x402), `attestseal-x402` on PyPI |
| Client verifier (httpx / aiohttp) | Python | same package |
| Cloudflare Worker template (header transport) | TypeScript | [`deploy/cloudflare-worker-x402/`](https://github.com/AttestSeal/attestseal/tree/main/deploy/cloudflare-worker-x402) |

## Compatibility

- **x402 v1** and **v2**: both compatible. The extension lives in `extra`.
- **Schemes**: scheme-agnostic. The attestation does not interact with the payment scheme.
- **Networks**: network-agnostic. The attestation is about the resource-server domain, not the chain.
- **Transports**: HTTP, MCP, A2A. The header-transport option only applies to HTTP; the embedded option works on any transport that carries `PaymentRequirements`.

## Open questions

- Should the canonical hash for `attestseal-payment-requirements-hash` be specified in this doc, or referenced from a shared canonicalization helper in `specs/`? Current text leaves it informal; happy to tighten.
- Should `assuranceBasis` move to a controlled vocabulary (with new values requiring this spec to be updated) or stay free-form (issuer-defined with a recommendation that issuers document publicly)? Current preference: free-form.
- Should the attestation TTL have a protocol-level maximum (e.g., 30 days), or should this stay issuer-policy?

Comments welcome via PR review or via [github.com/AttestSeal/attestseal/issues](https://github.com/AttestSeal/attestseal/issues).
