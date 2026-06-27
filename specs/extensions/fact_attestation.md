# Fact Attestation Extension

**1. Overview**

The Fact Attestation Extension adds **third-party-signed observations about a merchant or offer** to x402, enabling a paying agent to check whether the counterparty and its terms are *real* before settlement.

It complements the [Offer and Receipt Extension](./extension-offer-and-receipt.md):

- An **offer** commits the resource server to its own payment terms.
- A **receipt** proves a payment was made and service delivered.
- A **fact attestation** carries an *independent* party's signed, method-disclosed observations about the merchant/offer (domain age, TLS age, off-domain redirect, brand-similarity, observed price vs expected) — the signal neither offer nor receipt provides, because both are self-asserted by the server being paid.

Use cases: pre-settlement fraud screening (e.g. freshly-registered storefronts cloning a real brand at a fabricated price), agent shopping safety, and feeding signed reality-checks into reputation systems without the issuer grading its own catalog.

Fact attestations are **x402 version-agnostic** and reuse the signed-artifact conventions of the Offer and Receipt Extension.

**2. Status, Evolution, and Forward Compatibility**

Optional and composable. Wire shape MAY change to align with canonical extension architecture; behavioral requirements (payload structure, signature format, verification rules) are normative as written. Implementers SHOULD treat unknown fields as unsupported rather than best-effort interpreting them.

**3. Signed Artifact Structure**

A fact attestation is one signed artifact placed in the `extensions` field, associated with an `accepts[]` entry (and MAY also appear on the `SettlementResponse`).

**3.1 Common Object Shape** (identical to Offer/Receipt §3.1)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | string | Yes | `"jws"` or `"eip712"` |
| `payload` | object | EIP-712 only | Canonical payload fields (omit for JWS) |
| `signature` | string | Yes | Signature (format-specific encoding) |
| `acceptIndex` | integer | No | Index into `accepts[]` the attestation describes |

Format-specific rules (JWS vs EIP-712) are exactly as in the Offer and Receipt Extension §3.1.1.

**3.2 Attestation Payload**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `subject` | string | Yes | The merchant/offer observed — origin (`https://host`) or `payTo` address |
| `factClass` | string | Yes | One of: `merchant`, `price`, `geo`, `reputation` |
| `observations` | array | Yes | List of `{field, value, method}` — each a raw observation with the method that produced it disclosed |
| `issuer` | string | Yes | Verifier identity (DID or key id); the signer, NOT the party being paid |
| `observedAt` | integer | Yes | Unix timestamp of observation |
| `verify` | string | No | URL where the issuer's public key and the full signed record are published |

**Normative — facts, not judgments.** Each `observations[]` entry MUST be a raw, reproducible observation with `method` disclosed (e.g. `{field:"domain_age_days", value:9, method:"RDAP"}`). The attestation MUST NOT assert a verdict ("legitimate"/"fraudulent"); it asserts only what was observed, by what method. The signature proves the observation is the issuer's and untampered — not that the merchant is good or bad. The consuming agent decides what the facts mean.

**4. Verification Rules**

A verifier MUST:

1. Confirm `format` and verify `signature` over the canonical payload per the Offer and Receipt Extension rules (JWS: verify the compact string; EIP-712: verify against the typed payload).
2. Resolve `issuer` to a public key. The verifier SHOULD pin trusted issuer keys; an attestation signed by the same party as `payTo` MUST be treated as self-asserted (no independence) and SHOULD be ignored for fraud-screening purposes.
3. Reject if `subject` does not match the `accepts[]` entry it claims to describe (origin or `payTo` mismatch).
4. Treat `observedAt` staleness per its own policy; observations are point-in-time.

**5. Security Considerations**

- **Issuer independence is the entire value.** A fact attestation from the resource server about itself carries no more trust than its own offer. Verifiers MUST distinguish third-party issuers from `payTo`.
- **Point-in-time.** A clean observation does not guarantee future behavior; re-observation is the consumer's responsibility.
- **No badge-for-pay.** A signed observation is a measurement, not an endorsement; an issuer that sells favorable attestations breaks the model and SHOULD be de-pinned.
