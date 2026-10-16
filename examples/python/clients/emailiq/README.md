# EmailIQ live client (Python / httpx)

Pay the **live** EmailIQ x402 endpoint on Base and print email-intelligence JSON.

## Facts (verify yourself)

| | |
|---|---|
| Resource | `POST https://emailiq.dev/email/intelligence` |
| Without payment | HTTP **402** + `PAYMENT-REQUIRED` (x402 v2) |
| Price | **0.01 USDC** on Base (`eip155:8453`), scheme `exact` |
| Body | `{"email":"<address>"}` |
| Docs for agents | https://emailiq.dev/llms.txt |
| Free rate-limited demo (no USDC) | `POST https://emailiq.dev/demo/email` |
| Bazaar | Indexed via CDP Facilitator after settlement (search: `emailiq` / `verify signup email`) |

No partnership claim. EmailIQ is an independent seller; this folder is an example of calling a real catalogued resource.

## Setup

```bash
cd examples/python/clients/emailiq
cp .env-local .env
# Set EVM_PRIVATE_KEY to a Base wallet that holds a little USDC
uv sync --reinstall-package x402
uv run python main.py
```

Optional env:

- `EMAIL` — address to analyze (default `signup@example.com`)
- `RESOURCE_SERVER_URL` — default `https://emailiq.dev`
- `ENDPOINT_PATH` — default `/email/intelligence`

## What you should see

1. Client registers an EVM signer.
2. First POST is challenged with 402; the SDK signs and retries with `PAYMENT-SIGNATURE`.
3. HTTP 200 JSON with fields such as `valid_syntax`, `mx_records`, `spf_enabled`, `dkim_enabled`, `dmarc_enabled`, `is_disposable`, `score`.

## Related

- Generic httpx client: [`../httpx`](../httpx)
- EmailIQ product / starter pack: https://github.com/Son-of-Ultron/EmailIQ
