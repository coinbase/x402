# Receipt Attestation Client Example

This example demonstrates how **clients** can extract signed receipts from x402 payment flows and create verified user review attestations.

> **Note:** This is a client-side example. For server-side receipt signing configuration, see the [server examples](../../servers/).

## Why Receipts Matter

Receipts enable **verified user reviews** — like an ecommerce "Verified Purchase" badge. When a server issues a receipt, it proves the reviewer actually paid for and used the service.

## The Flow

```
┌─────────┐     402 + Offer      ┌─────────┐
│  Client │ ◄─────────────────── │  Server │
│         │                      │         │
│         │  Payment + Request   │         │
│         │ ──────────────────► │         │
│         │                      │         │
│         │   200 + Receipt      │         │
│         │ ◄─────────────────── │         │
└─────────┘                      └─────────┘
     │
     │  Create Attestation
     ▼
┌─────────────────────────────────────────┐
│  Attestation Payload                    │
│  - attester: did:pkh:eip155:8453:0x...  │
│  - subject: did:web:api.example.com     │
│  - ratingValue: 5                       │
│  - reviewBody: "Great service!"         │
│  - proofs: [{ x402-receipt }]           │
└─────────────────────────────────────────┘
     │
     │  Submit to Trust System (e.g. OMATrust)
     ▼
┌─────────────────────────────────────────┐
│  Trust System that allows agents to:    │
│  - Verify receipt signature             │
│  - Confirm commercial transaction       │
│  - Index verified review                │
└─────────────────────────────────────────┘
```

## Quick Start

1. Install dependencies from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/receipt-attestation
```

2. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

3. Run the example:

```bash
pnpm start
```

## Key Files

- **[index.ts](./index.ts)** - Main example showing the complete flow
- **[omatrust.ts](./omatrust.ts)** - OMATrust attestation creation (can be replaced with other trust systems)

## How It Works

The example uses `wrapFetchWithPayment` with the `onPaymentComplete` callback to capture offer/receipt metadata:

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { createOfferReceiptExtractor, type OfferReceiptResponse } from "@x402/extensions/offer-receipt";

const fetchWithPayment = wrapFetchWithPayment(fetch, client, {
  onPaymentComplete: createOfferReceiptExtractor()
});

const response = await fetchWithPayment(url, { method: "GET" }) as OfferReceiptResponse;

// Access extracted metadata
if (response.offerReceipt?.receipt) {
  // Create verified review with receipt proof
}
```

## Attestation Fallback

- **Receipt available** → Rating 5, "Verified Purchase" (proves payment completed)
- **Only offer available** → Rating 3, less trusted (proves terms were presented)

See [omatrust.ts](./omatrust.ts) for the attestation payload structure.

## Submitting to OMATrust

The example creates an attestation payload ready for submission to OMATrust via EAS (Ethereum Attestation Service). For complete submission instructions, supported chains, and contract addresses, see the [OMATrust documentation](https://docs.oma3.org).

## Related

- [Offer/Receipt Extension Spec](../../../../specs/extensions/extension-offer-and-receipt.md)
- [Server Examples](../../servers/) - How to configure receipt signing on the server
