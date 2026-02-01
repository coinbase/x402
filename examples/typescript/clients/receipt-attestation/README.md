# Receipt Attestation Client Example

Demonstrates how clients extract signed offers and receipts from x402 payment flows.

For background on why receipts matter, payload structure, and security considerations, see the [Offer/Receipt Extension README](../../../../typescript/packages/extensions/src/offer-receipt/README.md).

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

Required environment variables:
- `EVM_PRIVATE_KEY` - Private key for EVM payments
- `SVM_PRIVATE_KEY` - Private key for Solana payments (base58)
- `RESOURCE_SERVER_URL` - Server URL (default: `http://localhost:4021`)
- `ENDPOINT_PATH` - Endpoint path (default: `/weather`)

3. Run the example:

```bash
pnpm start
```

## What This Example Shows

The example uses the raw flow (not the wrapper) for visibility into each step:

1. Make initial request → receive 402 with signed offers
2. Extract and decode offers to inspect payment options
3. Select an offer and find the matching `accepts[]` entry
4. Create payment and retry the request
5. Extract signed receipt from success response
6. Verify receipt payload matches the offer

See [index.ts](./index.ts) for the full implementation with detailed comments.

## Related

- [Offer/Receipt Extension](../../../../typescript/packages/extensions/src/offer-receipt/) - Types, signing utilities, client functions
- [Extension Specification](../../../../specs/extensions/extension-offer-and-receipt.md) - Full protocol spec
