# Cold-Start Mitigation Patterns for `8004-reputation`

## Status

Informative draft.

This document describes pre-payment trust signals that can complement the in-flight `8004-reputation` work during a service or agent's cold-start phase. It does **not** modify the `8004-reputation` protocol flow, define mandatory trust policy, or replace post-payment reputation.

## Motivation

`8004-reputation` is strongest after a client has already:

1. discovered a service
2. paid through x402
3. received the service
4. submitted feedback into the reputation system

That feedback loop is exactly what should remain authoritative over time. The gap is earlier:

- a new service may have no feedback yet
- a service moving to a new market may have thin local history
- a client may want independently verifiable signals before the first paid request

Without a shared shape for those signals, every client invents a different bootstrap policy and every provider has to satisfy one-off integrations.

## Design Goals

Cold-start signal patterns should be:

- **complementary** to `8004-reputation`, not a replacement for it
- **optional**, so clients can ignore them and apply local policy
- **provider-agnostic**, so new providers do not need bespoke client integrations
- **independently verifiable**, so clients can validate what they trust
- **forward-compatible**, so unknown categories and signal types do not break older clients

## Data Model

A registration record or discovered resource MAY expose a `coldStartSignals` object directly, or nest it under `metadata.coldStartSignals`. This draft standardizes the inner object only.

```json
{
  "coldStartSignals": {
    "onChainCredentials": [],
    "onChainActivity": [],
    "offChainAttestations": [],
    "discoveryAttestations": []
  }
}
```

### Known Categories

| Category | Purpose | Example signal families |
| --- | --- | --- |
| `onChainCredentials` | Third-party credentials anchored on chain | EAS attestations, registry entries, non-transferable credentials, compliance attestations |
| `onChainActivity` | Observed wallet or economic behavior | stablecoin balances, staking participation, long-lived activity, wallet trust profiles |
| `offChainAttestations` | Signed claims not anchored directly in chain state | DIDs, verifiable credentials, domain or organization proofs, reasoning attestations |
| `discoveryAttestations` | Signed observations about service behavior | uptime, compatibility checks, availability probes, registry health JWTs |

Clients MUST ignore unknown categories.

### Generic Signal Shape

Each signal entry SHOULD include a provider-defined `type`. Unknown `type` values MUST be ignored unless a client has explicit policy for them.

```json
{
  "type": "serviceHealth",
  "provider": "discovery-service",
  "checkedAt": "2026-03-11T12:00:00Z",
  "ttlSeconds": 300,
  "sig": "base64url-signature",
  "kid": "provider-key-1",
  "jwks": "https://provider.example/.well-known/jwks.json",
  "alg": "EdDSA"
}
```

### Common Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | `string` | Provider-defined signal type |
| `provider` | `string` | Optional provider identifier |
| `checkedAt` | `string` | Optional ISO-8601 timestamp for when the signal was checked or issued |
| `ttlSeconds` | `number` | Optional freshness window in seconds |
| `sig` | `string` | Optional detached signature over the signal payload |
| `kid` | `string` | Optional key identifier for the signing key |
| `jwks` | `string` | Optional HTTPS JWKS hint |
| `alg` | `string` | Optional signature algorithm hint |

Signed signals SHOULD provide at least `sig` and `kid`. `jwks` is a useful distribution hint, but clients remain free to resolve trusted keys through pinned configuration, cached JWKS, or any other local policy.

This draft is intentionally **algorithm-agnostic**. Providers MAY use RSA, P-256 ECDSA, Ed25519, or other JWK-expressible schemes. Clients should determine the concrete verification path from local trust policy plus the signal's `alg` hint and the resolved JWK metadata (for example `kty`, `alg`, and `crv`).

## Category Guidance

### `onChainCredentials`

Use this category for third-party credentials that are anchored in on-chain data and attributable to an issuer.

```json
{
  "type": "eas",
  "chainId": 8453,
  "schemaId": "0x...",
  "attester": "0x...",
  "result": true,
  "checkedAt": "2026-03-11T12:00:00Z",
  "ttlSeconds": 300,
  "sig": "base64url-signature",
  "kid": "provider-key-1",
  "jwks": "https://provider.example/.well-known/jwks.json",
  "alg": "ES256"
}
```

Other valid examples in this category include:

- `type: "compliance-attestation"` for AML/CFT or sanctions screening receipts
- provider-signed ERC-8004 registration or validation snapshots
- non-transferable credential checks such as SBT presence

### `onChainActivity`

Use this category for observed wallet behavior or economic participation signals derived from chain state.

```json
{
  "type": "walletTrust",
  "provider": "example-provider",
  "compositeScore": 0.65,
  "dimensions": {
    "stablecoins": { "score": 0.8 },
    "governance": { "score": 0.6 },
    "staking": { "score": 0.5 }
  },
  "checkedAt": "2026-03-11T12:00:00Z",
  "ttlSeconds": 300,
  "sig": "base64url-signature",
  "kid": "provider-key-1",
  "jwks": "https://provider.example/.well-known/jwks.json",
  "alg": "ES256"
}
```

Clients SHOULD prefer dimension-aware evaluation over a single composite score when task-specific context matters.

### `offChainAttestations`

Use this category for signed claims that are portable but not directly anchored in chain state.

```json
{
  "type": "did",
  "id": "did:pkh:eip155:8453:0x1234...",
  "alternateIds": [
    "did:key:z6Mk...",
    "did:web:agent.example.com"
  ],
  "verifiableCredentials": [
    {
      "type": "HumannessCredential",
      "issuer": "did:web:issuer.example"
    }
  ]
}
```

The current issue discussion treats `did:pkh`, `did:key`, and `did:web` as all in-bounds. For EVM-native agents, `did:pkh` is a natural default because it reuses the existing wallet identity with minimal extra setup.

Other valid examples in this category include:

- domain verification proofs
- code audit or organization credentials
- `type: "reasoningAttestation"` or equivalent verifier receipts for payment-decision integrity

### `discoveryAttestations`

Use this category for signed observations about service behavior or availability.

```json
{
  "type": "serviceHealth",
  "provider": "x402-discovery",
  "serviceId": "legacy/cf-pay-per-crawl",
  "uptimePct": 98.2,
  "avgLatencyMs": 340,
  "facilitatorCompatible": true,
  "chainVerifications": {
    "erc8004Registered": true,
    "operatorWalletTrust": {
      "provider": "trust-provider",
      "trustId": "TRST-XXXXX"
    }
  },
  "checkedAt": "2026-03-11T12:00:00Z",
  "ttlSeconds": 300,
  "sig": "base64url-signature",
  "kid": "discovery-key-1",
  "jwks": "https://discovery.example/.well-known/jwks.json",
  "alg": "EdDSA"
}
```

This category answers a different question than identity-oriented categories:

- identity categories ask: **who is this actor?**
- discovery attestations ask: **does this service appear to work as advertised?**

Providers MAY also package discovery attestations as signed JWTs or equivalent signed envelopes, as long as the payload shape and verification metadata are documented.

## Client Processing Model

Recommended high-level flow:

1. discover the service or registration record
2. inspect available `8004-reputation` history
3. if reputation is thin, inspect `coldStartSignals`
4. ignore unknown categories and unknown signal `type` values
5. apply freshness checks using `checkedAt` and `ttlSeconds`
6. verify any signed signals the client trusts
7. combine the remaining signals with local payment policy
8. after real interactions, increasingly defer to accumulated `8004-reputation`

This document does **not** standardize thresholds or score cutoffs. It also does not mandate a universal trust-tier table. However, tiered local policy is an expected use of these signals, and implementers may reasonably map combinations of cold-start signals to payment tiers such as trial, standard, or high-trust access.

## TypeScript Reference Scaffold

The repository includes a minimal TypeScript scaffold in `@x402/extensions/cold-start` for parsing, freshness checks, and detached signature verification.

```ts
import {
  extractColdStartSignals,
  getFreshColdStartSignals,
  verifyColdStartSignalSignature,
} from "@x402/extensions/cold-start";

const signals = extractColdStartSignals(discoveredResource);

if (!signals) {
  return { proceed: false, reason: "no-cold-start-signals" };
}

const usableSignals = [];

for (const { category, signal } of getFreshColdStartSignals(signals)) {
  if (signal.sig) {
    const verification = await verifyColdStartSignalSignature(signal, {
      resolveJwk: ({ kid }) => trustedKeyStore.lookup(kid),
    });

    if (!verification.valid) {
      continue;
    }
  }

  usableSignals.push({ category, type: signal.type });
}

const proceed = usableSignals.length > 0 || hasSufficient8004Reputation(discoveredResource);
```

Current scaffold notes:

- parsing helpers ignore unknown categories by default
- unknown signal `type` values are preserved for local policy
- freshness checks are generic and signal-type agnostic
- detached signature verification is real, but intentionally small
- the current reference verifier supports caller-supplied JWK resolution and a small multi-algorithm set (`RS256`, `ES256`, and `Ed25519` / `EdDSA`)
- providers can override canonicalization or payload construction when they sign JWTs or other envelopes instead of the default canonical JSON object

## Freshness and Replay

Cold-start signals often depend on changing state. Clients SHOULD scale freshness requirements with payment risk.

- low-value payments may accept cached signals
- medium-value payments should prefer recent signed signals
- high-value payments may require direct provider refresh or direct verification

Signals missing either `checkedAt` or `ttlSeconds` are harder to evaluate consistently. Clients should treat partial freshness metadata conservatively.

Some signal families are especially time-sensitive:

- compliance receipts may need shorter TTLs because sanctions lists can change quickly
- discovery attestations may need tighter windows for high-value routing decisions
- reasoning or verification attestations may be tied to a single payment or request and should not be reused broadly

## Security Considerations

### Provider compromise

Signed signals are only as trustworthy as their signing keys, issuance controls, and verification policy. Clients SHOULD pin or otherwise trust-manage key material for high-value flows.

### Temporary or manipulated positions

On-chain activity can be inflated temporarily. Clients SHOULD avoid treating activity-only signals as equivalent to long-lived reputation.

### Category concentration

Relying on a single category creates a single failure mode. Higher-value interactions SHOULD prefer signals from multiple categories when available.

### Canonical payload ambiguity

This draft does not standardize a canonical payload for every possible signal type. Providers should document what they sign. The reference TypeScript helper uses canonical JSON without `sig`, `kid`, `jwks`, or `alg` as a pragmatic default.

## Relationship to `8004-reputation`

These patterns are intentionally complementary:

- `coldStartSignals` help when there is little or no interaction history
- `8004-reputation` becomes the stronger signal after real usage accumulates
- clients MAY keep both as defense-in-depth, but cold-start signals should not redefine the `8004-reputation` flow

## Future Work

Possible follow-on work:

- standard canonical payload definitions for common signal types
- support for additional signature algorithms and key-distribution helpers
- optional vocabulary for trust tiers or minimum signal counts
- tighter linkage with registry-specific schemas once the surrounding discovery work settles
