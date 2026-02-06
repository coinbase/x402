# Offer-Receipt Extension Server Example

Express.js server demonstrating the offer-receipt extension for x402. This extension adds signed offers and receipts to payment flows, enabling:

- **Signed offers** — cryptographic proof of payment terms from the server
- **Signed receipts** — proof of service delivery after payment
- **DID document** — serves `/.well-known/did.json` for JWS signature verification

## Quick Start

The key additions to enable offer-receipt are:

```typescript
import {
  createOfferReceiptExtension,
  createJWSOfferReceiptIssuer,
  declareOfferReceiptExtension,
} from "@x402/extensions/offer-receipt";

// 1. Create an issuer (creates and signs offers/receipts)
const issuer = createJWSOfferReceiptIssuer(kid, jwsSigner);

// 2. Register the extension with the resource server
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(createOfferReceiptExtension(issuer));

// 3. Declare the extension in route config
const routes = {
  "GET /weather": {
    accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo }],
    extensions: {
      ...declareOfferReceiptExtension({ includeTxHash: false }),
    },
  },
};
```

## Setup

1. Copy `.env-local` to `.env` and configure:

```bash
cp .env-local .env
```

Required variables:
- `FACILITATOR_URL` — Facilitator endpoint
- `EVM_ADDRESS` — Address to receive payments
- `SIGNING_PRIVATE_KEY` — Base64-encoded PKCS#8 private key (ES256/P-256)
- `SERVER_DOMAIN` — DID identifier for your domain (e.g., `api.example.com` or `localhost%3A4021` for local dev)

2. Generate a signing key:

```bash
openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt | base64 -w0
```

3. Install and run:

```bash
cd ../../
pnpm install && pnpm build
cd servers/offer-receipt
pnpm dev
```

## DID Document

The server exposes a DID document at `/.well-known/did.json` for JWS signature verification:

```bash
curl http://localhost:4021/.well-known/did.json
```

This enables clients to verify signed offers and receipts by resolving the `did:web:localhost%3A4021#key-1` key identifier to the server's public key.

For local development, the library's `resolveDidWeb` function automatically uses HTTP for `localhost` and `127.0.0.1` domains.

## Configuration Options

`declareOfferReceiptExtension()` accepts:

- `includeTxHash` — Include transaction hash in receipt (default: `false` for privacy)
- `offerValiditySeconds` — How long offers remain valid (default: 300)

## Response Format

### 402 Response with Signed Offer

The `extensions` field includes signed offers:

```json
{
  "x402Version": 2,
  "accepts": [...],
  "extensions": {
    "offer-receipt": {
      "info": {
        "offers": [{
          "format": "jws",
          "acceptIndex": 0,
          "signature": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDp3ZWI6Li4uIn0..."
        }]
      }
    }
  }
}
```

### Success Response with Signed Receipt

```json
{
  "success": true,
  "transaction": "0x...",
  "extensions": {
    "offer-receipt": {
      "info": {
        "receipt": {
          "format": "jws",
          "signature": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDp3ZWI6Li4uIn0..."
        }
      }
    }
  }
}
```

## Related

- [Extension Specification](../../../../typescript/packages/extensions/src/offer-receipt/README.md)
- [Offer/Receipt Client Example](../../clients/offer-receipt/)
