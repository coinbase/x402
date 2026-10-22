# Extension: `solidarity`

Status: draft for discussion. Reference checker, simulated ledger and allocation rule: https://craigmerry.com/solidarity-levy/

## Summary

The `solidarity` extension lets a buyer's agent attach a small, separately authorized transfer to a humanitarian fund, at a rate its owner has agreed to in advance. The seller is paid in full and is never asked to pay the share. The facilitator settles the share apart from the purchase, records one line for it, and publishes a monthly batch of those lines as a Merkle tree (RFC 6962) so any owner can prove their share was counted.

Design goals, in order:

1. **Consent.** The field appears only when the owner has a standing policy. A server, seller or agent cannot add it.
2. **Never in the way.** A failed or refused share never blocks, delays or changes the purchase.
3. **Totals, not purchases.** Nothing about what was bought leaves the facilitator.
4. **Checkable.** Every share is in a published batch with a root anyone can recompute.

## Roles

| Role | In x402 terms | Does |
| --- | --- | --- |
| Owner | (outside the protocol) | Sets the policy: rate, monthly cap, fund. |
| Buyer agent | client | Adds the extension when its owner's policy allows. |
| Seller | resource server | Nothing. Need not support or know about the extension. |
| Facilitator | facilitator | Verifies and settles the share, records a ledger line, publishes monthly batches. |
| Fund | (outside the protocol) | Receives transfers, publishes its allocation rule, inputs and results. |

## Advertisement

Because the share is the buyer's choice, the seller does not advertise it. A facilitator that supports the extension lists `solidarity` in the `extensions` array of its `/supported` response (x402 v2 section 7). A client that sees it there MAY add the extension to its `PaymentPayload` even if the `PaymentRequired` did not include it.

> Open question for x402 maintainers: the v2 text describes extensions as advertised by servers and echoed by clients. This proposal needs clients to add an extension the server did not advertise, when the facilitator supports it. That either fits the existing rule ("may append additional info") or needs a small clarification.

## `PaymentPayload`

```json
{
  "extensions": {
    "solidarity": {
      "info": {
        "version": 1,
        "rate": "0.001",
        "amount": "48000",
        "fund": "eip155:8453:0x0000000000000000000000000000000000000000",
        "policy": "sha256:9f2c41e8b7a0d3c5e1f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8",
        "period": "2026-10",
        "authorization": { "scheme": "exact", "payload": { "signature": "0x...", "authorization": { "from": "0x...", "to": "0x0000000000000000000000000000000000000000", "value": "48000", "validAfter": "...", "validBefore": "...", "nonce": "0x..." } } }
      },
      "schema": { "$ref": "https://craigmerry.com/solidarity-levy/spec/solidarity.schema.json" }
    }
  }
}
```

The `fund` address above is a placeholder. No fund exists.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `version` | integer | yes | `1` for this draft. |
| `rate` | decimal string | yes | The owner's rate, for example `"0.001"` for 0.1%. At most `"0.01"`. |
| `amount` | string, atomic units | yes | The share, in the same asset and units as the purchase. Must equal `floor(purchase amount × rate)`, or less if the owner's monthly cap is nearly used. |
| `fund` | CAIP-10 account | yes | Where the share goes. Facilitators MUST only settle to funds on a published allow-list (see Funds). |
| `policy` | `sha256:` + 64 hex | yes | Hash of the owner's policy document (below). Proves a policy exists without revealing it. |
| `period` | `YYYY-MM` | yes | The month the share counts toward, for the cap and for batching. |
| `authorization` | object | yes | A separate, scheme-specific authorization for `amount` to `fund`, in the same format the scheme uses for the purchase (for `exact` on EVM, an EIP-3009 authorization). |

## Owner policy document

Held by the client, never sent. Its hash is the `policy` field. Canonical JSON (RFC 8785, JSON Canonicalization Scheme) before hashing:

```json
{"cap":"5000000","currency":"USDC","fund":"eip155:8453:0x0000000000000000000000000000000000000000","owner":"<owner key or account>","rate":"0.001","receipts":"monthly","since":"2026-10-21T09:12:00Z","version":1}
```

The client MUST stop adding the extension when the month's shares reach `cap`, and MUST drop it entirely when the owner turns the policy off.

## Facilitator behaviour

On `verify` and `settle`, a facilitator that supports `solidarity`:

1. MUST verify and settle the purchase exactly as it would without the extension. A problem with the share MUST NOT change the purchase result.
2. MUST check that `amount` ≤ `floor(purchase amount × rate)`, that `rate` ≤ 0.01, that `fund` is allow-listed, and that `authorization` is valid for `amount` to `fund`. If any check fails it skips the share and reports why.
3. SHOULD settle the share in the same batch window as the purchase; MAY hold shares and settle them together, as long as each is in that month's batch.
4. MUST NOT forward the policy hash, the share, or any purchase detail to the fund other than through the monthly batch.
5. Reports the outcome in the `EXTENSION-RESPONSES` side channel (x402 v2 section 7.2.1), which is never forwarded to buyers:

```json
{ "solidarity": { "status": "recorded", "line": "sha256:a41f...", "batch": "facilitator.example/2026-10" } }
```

`status` is `recorded`, `skipped` (with a `reason`: `over-rate`, `bad-authorization`, `fund-not-allowed`, `settlement-failed`) or `unsupported`.

## Ledger lines and monthly batches

Each recorded share becomes one line, UTF-8, fields separated by `|`:

```
<payment id>|<facilitator id>|<owner pseudonym>|<amount in millionths of a USD-equivalent unit>
```

- `payment id` is the x402 `payment-identifier` when present, otherwise a facilitator-assigned id. It MUST NOT encode what was bought.
- `owner pseudonym` is `sha256(policy hash || period)`, so an owner's lines can be found with their own policy but are not linkable across months by anyone else.

At the end of each month the facilitator builds a Merkle tree over the month's lines sorted by `payment id`, exactly as RFC 6962 section 2.1 defines it: leaf hash `SHA-256(0x00 || line)`, node hash `SHA-256(0x01 || left || right)`. It publishes a signed statement:

```json
{ "batch": "facilitator.example/2026-10", "lines": 1840221, "total": "91822400000", "merkle_root": "3b7e09d1...", "previous": "sha256:<hash of last month's statement>", "signature": "ed25519:..." }
```

and transfers `total` to the fund. Statements chain by `previous`, so a month cannot be rewritten later without breaking the chain. Witnesses (other facilitators, the fund, any volunteer) SHOULD co-sign statements, as transparency logs do.

## Receipts

Each month the client can fetch, for its pseudonym, every line and an RFC 6962 inclusion proof (audit path) against the published root. Verification follows RFC 9162 section 2.1.3.2. A reference checker with no dependencies is at https://craigmerry.com/solidarity-levy/verify.py and in the browser at https://craigmerry.com/solidarity-levy/ledger/.

## Funds

A fund is eligible only if it:

- is held by a named trustee and allocated under a public mandate (the proposal assumes UN responsibility, for example a window of the Central Emergency Response Fund);
- publishes, before paying out, its allocation rule, the exact inputs (pinned by hash), and the result, so anyone can recompute it;
- reports what it raises alongside official aid levels, so it cannot quietly replace them.

The allow-list itself is published as a signed document and is out of scope for this draft.

## Security and privacy considerations

- **Consent.** The policy hash proves a policy exists, not that it is genuine. Facilitators cannot check consent beyond that; clients carry the duty. A facilitator that sees shares without a policy pattern it recognises SHOULD skip them.
- **Rounding.** Shares are floored, never rounded up. A share of zero is not recorded.
- **Replay.** Use the `payment-identifier` extension for idempotency; a share is recorded at most once per payment id.
- **Sanctions and money laundering.** The fund address is fixed and allow-listed, so shares cannot be pointed at arbitrary recipients. Facilitators apply their existing screening to the buyer.
- **Linkability.** Lines carry no purchase data and a per-month owner pseudonym. Amounts are still visible; a policy with a very unusual rate could make an owner's lines stand out.
- **Second preimages.** The leaf/node prefixes of RFC 6962 prevent presenting an inner node as a leaf. Do not use Merkle trees that duplicate an odd node.

## Test vectors

- Merkle roots: the RFC 6962 reference vectors (leaves `""`, `00`, `10`, `2021`, `3031`, `40414243`, `5051525354555657`, `606162636465666768696a6b6c6d6e6f`; root of all eight `5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328`). Both reference implementations, https://craigmerry.com/solidarity-levy/merkle.js and https://craigmerry.com/solidarity-levy/verify.py, reproduce them.
- A full simulated month (three facilitators, 3,544 lines) can be downloaded from the ledger page and checked with `verify.py`.

## Open questions

1. Client-added extensions not advertised by the server (see Advertisement).
2. Cards and bank transfers: AP2 and the Agentic Commerce Protocol settle through card and account rails, where a separate authorization means a second charge. A processor-side equivalent of this extension would carry the same fields in the processor's own API.
3. Tax receipts: who issues them, and in which countries a share can be deductible.
4. Who keeps the fund allow-list.
