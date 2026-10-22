# Cloudflare Worker Bazaar Seller

A Worker `fetch` handler for `GET /weather` that advertises the Bazaar discovery
extension and still gets cataloged when a buyer omits it.

The handler uses `@x402/core`, `@x402/evm`, and `@x402/extensions` only. It is
not a workspace package (no `package.json`), so it does not change
`examples/typescript/pnpm-lock.yaml`. Copy `src/index.ts` into a Worker that
resolves those packages from a built checkout of this repo.

Set `FACILITATOR_URL` and `PAY_TO` as Worker variables. `PAY_TO` is the seller
receive address. Leave a placeholder in source; do not commit a real address or
a facilitator credential. Bundling `@x402/extensions/bazaar` pulls in facilitator
code that imports `node:url`, so the Worker needs the `nodejs_compat` flag.

## 402 response

`declareDiscoveryExtension` builds `extensions.bazaar` with a query-parameter
input schema and an output example. That object is passed to
`x402ResourceServer.createPaymentRequiredResponse` and sent in the
`PAYMENT-REQUIRED` header (`encodePaymentRequiredHeader`). The v2 HTTP helper
does the same, and its JSON body is `{}`. Clients read the header, not the body.

`info.input.method` is `"GET"` because this handler passes `method` into
`declareDiscoveryExtension`. The Express bazaar example omits `method` and lets
`bazaarResourceServerExtension.enrichDeclaration` set it from the request, which
also narrows the schema enum to that one method. This handler does not register
that extension, so the schema enum stays `["GET", "HEAD", "DELETE"]`. `"GET"`
is inside that enum, so facilitator schema validation still accepts the block.

Decoded header (shape, not a live payload):

```json
{
  "x402Version": 2,
  "resource": { "url": "https://example.workers.dev/weather" },
  "accepts": [{ "scheme": "exact", "network": "eip155:84532" }],
  "extensions": {
    "bazaar": {
      "info": {
        "input": {
          "type": "http",
          "method": "GET",
          "queryParams": { "city": "san-francisco" }
        },
        "output": {
          "type": "json",
          "example": { "city": "san-francisco", "weather": "foggy", "temperature": 60 }
        }
      },
      "schema": { "...": "..." }
    }
  }
}
```

`price: "$0.001"` is turned into `amount` and `asset` by `ExactEvmScheme` after
`initialize()` loads facilitator supported kinds. The network literal
`eip155:84532` matches the other TypeScript server examples.

## Buyers copy `extensions`

The v2 spec says clients echo extension `info` from `PaymentRequired` onto
`PaymentPayload`. They may add fields; they may not drop or replace advertised
ones. `x402Client.createPaymentPayload` does that copy by merging
`paymentRequired.extensions` into the payload.

`validateExtensions` checks keys the client actually sent. Each echoed `info`
must still contain the advertised `info`. A mismatched `bazaar` echo fails with
`extension_echo_mismatch`. An absent `extensions` object, an empty one, or a
payload that simply leaves out `bazaar` is currently accepted (`valid: true`).
The spec still requires the echo. This handler does not reject the omission; it
repairs it below.

## Server-side bazaar when the client omits it

`extractDiscoveryInfo` reads `paymentPayload.extensions.bazaar` from the body
the resource server posts to the facilitator. `verifyPayment` and
`settlePayment` forward the payload they are given. The HTTP middleware
(`x402HTTPResourceServer`) does not insert a missing `bazaar` key, so a client
that skips the echo never shows up in the catalog.

`withSellerBazaar` copies this worker's own `bazaar` object onto the payload
only when that key is absent, after `validateExtensions`, and passes that
object to both `verifyPayment` and `settlePayment`. A key the client already
sent is left as-is.

That does not change the exact-scheme signature. For `eip3009`, the client
signs EIP-712 `TransferWithAuthorization`: `from`, `to`, `value`, `validAfter`,
`validBefore`, `nonce`. For `permit2`, the signed type is
`PermitWitnessTransferFrom` (`permitted`, `spender`, `nonce`, `deadline`,
`witness`). `PaymentPayload.extensions` is outside both. Filling it in keeps
`payload.signature` valid.

The payer signature also does not authenticate the catalog text. The facilitator
trusts the resource server that calls `/verify` and `/settle`. Attaching the
seller's block tells that facilitator what this worker advertised. It does not
prove the buyer signed the discovery document.
