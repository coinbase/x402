# Receipt Attestation Client Example

Demonstrates how clients extract signed offers and receipts from x402 payment flows.

For background on why receipts matter, payload structure, and security considerations, see the [Offer/Receipt Extension README](../../../../typescript/packages/extensions/src/offer-receipt/README.md).

## Use Cases for Signed Receipts/Offers

- Verified user reviews ("Verified Purchase" badges)
- Audit trails and compliance records
- Dispute resolution evidence
- Agent memory (AI agents proving past interactions)

## Quick Start

1. Install dependencies from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/receipt-attestation
```

2. Copy `.env-local` to `.env` and configure:

```bash
cp .env-local .env
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

## Key Binding Verification

The extraction functions (`extractReceiptPayload`, `extractOfferPayload`) do NOT verify signatures. They only decode the payload. Before trusting a receipt or offer, you should verify:

### 1. Signature Validity
- **JWS**: Use `jose.compactVerify()` with the public key
- **EIP-712**: Use viem's `recoverTypedDataAddress()` to recover the signer

### 2. Key-to-Domain Binding
The signing key must be authorized to sign for the resource URL's domain. To verify this:
- Extract the signer's DID (`kid` from JWS header, or `did:pkh` from EIP-712)
- Derive the expected domain DID from `resourceUrl` (e.g., `did:web:api.example.com`)
- Check that the signing key is bound to that domain via:
  - `did:web` document at `https://<domain>/.well-known/did.json`
  - DNS TXT record binding the DID to the domain
  - On-chain attestation (e.g., OMATrust key binding attestation)

This verification is typically performed by downstream trust systems (OMATrust, PEAC) when you submit the receipt as proof. However, clients can also verify directly if they need immediate trust decisions.

See: [Extension Specification §4.5.1](../../../../specs/extensions/extension-offer-and-receipt.md)

## Security Considerations

1. **Private Key Management**: Loading private keys from environment variables is for demonstration only. In production, use secure key management (HSM, KMS, hardware wallets).

2. **Key Separation**: The payment signing key SHOULD be different from keys controlling wallets with significant funds.

3. **Key-to-Domain Binding** (for servers): See [Extension Specification §4.5.1](../../../../specs/extensions/extension-offer-and-receipt.md)

## Related

- [Offer/Receipt Extension](../../../../typescript/packages/extensions/src/offer-receipt/) - Types, signing utilities, client functions
- [Extension Specification](../../../../specs/extensions/extension-offer-and-receipt.md) - Full protocol spec
