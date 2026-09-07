# Extension: `no-wallet`

## Summary

The `no-wallet` extension lets a resource server tell a caller that cannot pay
**what it would need in order to pay**, in a form the caller can act on without
a human.

A `402` is currently a complete answer for a client that already has funds and a
signer, and a dead end for one that does not. The dead end is the common case:
on one production host publishing a signed funnel, 96.7% of `402` responses are
never followed by a settlement.

This extension does not attempt to make a client solvent. It states the
requirement precisely, optionally points at software that can satisfy the
signing half, and — where the server has one — offers a path that needs no
payment at all.

**It is deliberately not a wallet advertisement.** The design constraints below
exist so that a server can ship it without endorsing a vendor, and a client can
trust it without being steered.

---

## Motivation

A client receiving `402` today can fail for at least four distinct reasons, and
the response cannot distinguish them:

| The client... | Can the server tell? | Should the answer differ? |
|---|---|---|
| has a wallet and funds, but chose not to pay | no | no |
| has a wallet, but not enough of the asset | no | yes |
| has no signer at all | no | yes |
| is a crawler and was never buying | no | no |

The second and third are recoverable and the client usually cannot tell which
it is either, because the reason it failed is on its own side. A server that
says *what holding is required* converts a refusal into an instruction.

The measured cost of not doing this: on the host cited above, a plain-text
pointer to wallet software placed in the body of every `402` produced roughly
ten installs a day and almost no additional settlements. Software was never the
missing part. **Funds were.** An extension that says "install this" repeats that
mistake; one that says "you need 5000 units of this asset on this network"
does not.

---

## `PaymentRequired`

The server advertises the extension alongside its requirements:

```json
{
  "extensions": {
    "no-wallet": {
      "info": {
        "anyWalletWorks": true,
        "requires": {
          "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "network": "eip155:8453",
          "amount": "5000",
          "signing": "eip3009"
        },
        "freeAlternative": "https://api.example.com/preview",
        "wallets": [
          {
            "name": "example-wallet",
            "docs": "https://example.com/skill.md",
            "install": "npx -y example-wallet",
            "selfInstallable": true,
            "custodial": false
          }
        ]
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "anyWalletWorks": { "type": "boolean" },
          "requires": {
            "type": "object",
            "properties": {
              "asset": { "type": "string" },
              "network": { "type": "string" },
              "amount": { "type": "string" },
              "signing": { "type": "string" }
            },
            "required": ["asset", "network", "amount"]
          },
          "freeAlternative": { "type": "string", "format": "uri" },
          "wallets": {
            "type": "array",
            "maxItems": 8,
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string", "maxLength": 64 },
                "docs": { "type": "string", "format": "uri" },
                "install": { "type": "string", "maxLength": 256 },
                "selfInstallable": { "type": "boolean" },
                "custodial": { "type": "boolean" }
              },
              "required": ["name", "docs", "custodial"]
            }
          }
        },
        "required": ["anyWalletWorks", "requires"]
      }
    }
  }
}
```

### Fields

**`anyWalletWorks`** (required). `true` when the resource accepts payment from
any signer able to satisfy `requires`. A server MUST NOT set this `false` unless
its endpoint genuinely rejects otherwise-valid payments based on the client's
choice of software.

**`requires`** (required). What a client must hold. `asset`, `network` and
`amount` mirror the corresponding `PaymentRequirements` and MUST agree with
them. `signing` names the authorisation the server expects (`eip3009`,
`eip2612`, …) so a client can tell whether its existing signer is sufficient
before installing anything.

**`freeAlternative`** (optional). A URL serving something useful for no payment
— a preview, a sample, a reduced tier. A client with no funds can act on this
immediately, which is the only field in this extension that helps a caller that
cannot become solvent.

**`wallets`** (optional). Software that can produce the required signature.
Advisory only. See the constraints below.

---

## Constraints on `wallets`

These exist so the field cannot become an advertising slot, which is the failure
mode that would stop servers shipping it and stop clients trusting it.

1. A server that lists any wallet SHOULD list every option it is aware of that
   satisfies `requires`, not only one.
2. `custodial` is required on every entry. A client is entitled to know whether
   it is being pointed at something that will hold its keys.
3. A client MUST NOT treat this list as an endorsement, and MUST NOT install
   from it without whatever approval its operator requires.
4. A client MUST be able to pay by any other means. A server that will only
   accept payment from a listed wallet is not implementing this extension; it is
   implementing a lock-in and should not advertise `anyWalletWorks`.
5. An empty or absent `wallets` array is a complete and valid use of this
   extension. `requires` alone is the useful part.

---

## `PaymentPayload`

Nothing is echoed. This extension describes the server's requirements and the
client's options; it carries no state into a payment and MUST NOT affect
settlement.

---

## Client behaviour

A conforming client that receives `402` with this extension and cannot pay:

1. Compares `requires` against what it holds. If the shortfall is funds rather
   than software, installing a wallet will not help and the client SHOULD say so
   to its operator rather than installing anything.
2. If `freeAlternative` is present, MAY fetch it and continue with reduced data.
3. If it has no signer at all and its operator permits installation, MAY use
   `wallets` — subject to constraint 3 above.

A client SHOULD surface the shortfall to whoever runs it, because funding is
almost always a decision above the client's authority.

---

## Security considerations

**The `wallets` list is attacker-controlled input.** It arrives from whichever
server answered, over a channel the client does not control, and it contains a
shell command. A client MUST treat `install` as untrusted text. Automatically
executing it is equivalent to executing an arbitrary command supplied by a
stranger, and no client should do so without explicit operator approval.
Implementations SHOULD display the command rather than run it.

**`requires` must not be trusted over `PaymentRequirements`.** A server could
state a larger `amount` here than it charges. Clients MUST validate any payment
against `PaymentRequirements`, never against this extension.

**`freeAlternative` is an ordinary URL** from an untrusted party and carries the
same risks as any other link in a server response.

---

## Non-goals

- Funding clients. Nothing here moves money.
- Wallet discovery as a directory. The list is what one server happens to know.
- Any registry, allowlist or certification of wallets.

---

## Prior art

Deployed in a non-standard form on at least one production host, as a
`no_wallet` object in the `402` body outside `extensions`, carrying an install
command, a docs URL and an explicit statement that any wallet works. This
proposal keeps that shape, moves it into `extensions`, and adds `requires` —
without which the pattern points solvent-looking clients at software that cannot
solve their actual problem.
