# x402 Offer/Receipt Extension

Enables signed offers and receipts for the x402 payment protocol.

## Overview

```
┌─────────┐                      ┌─────────────────┐                      ┌─────────────┐
│  Client │                      │ Resource Server │                      │ Facilitator │
└────┬────┘                      └────────┬────────┘                      └──────┬──────┘
     │                                    │                                      │
     │  GET /resource                     │                                      │
     │ ──────────────────────────────────►│                                      │
     │                                    │                                      │
     │  402 + PaymentRequirements         │                                      │
     │     + SignedOffer(s)               │                                      │
     │ ◄──────────────────────────────────│                                      │
     │                                    │                                      │
     │  GET /resource + Payment Header    │                                      │
     │ ──────────────────────────────────►│                                      │
     │                                    │                                      │
     │                                    │  Verify + Settle                     │
     │                                    │ ────────────────────────────────────►│
     │                                    │                                      │
     │                                    │  Settlement Response                 │
     │                                    │ ◄────────────────────────────────────│
     │                                    │                                      │
     │  200 + Resource + SignedReceipt    │                                      │
     │ ◄──────────────────────────────────│                                      │
     │                                    │                                      │
```

The **Offer** is signed by the resource server and included in the 402 response. Each `accepts[]` entry has its own signed offer, proving those specific payment requirements are authentic.

The **Receipt** is signed by the resource server after successful payment and included in the success response. It proves service was delivered.

The **Facilitator** handles payment verification and settlement but is not involved in offer/receipt signing.

## Why Receipts?

Receipts are **portable proofs of paid service**. They enable:

- **Verified user reviews**: Like a "Verified Purchase" badge
- **Audit trails**: Cryptographic proof of service delivery
- **Dispute resolution**: Evidence that service was delivered after payment
- **Agent memory**: AI agents can prove past interactions with services

## Why Offers?

Signed offers:
- Give clients a fallback for proof of interaction if a signed receipt is not sent
- Proves the offer came from the resource server
- Prevents clients from creating their own offer and claiming it came from a server

A **signed Offer** proves the payment requirements actually originated from the resource provider.

## Installation

```bash
npm install @x402/extensions
```

## Server Usage

To enable offer/receipt signing on your resource server, use the server extension:

```typescript
import { 
  offerReceiptResourceServerExtension,
  createJWSOfferReceiptSigner 
} from "@x402/extensions/offer-receipt";
```

See [server.ts](./server.ts) for the extension implementation and signer factory functions.

### Signature Formats

Two formats are supported:

- **JWS** - Best for server-side signing with managed keys (HSM, KMS, etc.)
- **EIP-712** - Best for wallet-based signing (MetaMask, WalletConnect, etc.)

## Client Usage

See the [receipt-attestation client example](../../../../../examples/typescript/clients/receipt-attestation/README.md) for extracting offers/receipts and creating attestations.

## Security Considerations

The `extractPayload()` and related functions extract payloads **without verifying** that the signing key is authorized for the resource's domain.

### Key Management

Servers can sign offers/receipts using:

1. **The payTo address wallet** - The same key that receives payments
2. **A dedicated signing key** - A separate key (e.g., JWS/JWK) for data signing

Either way, clients need to verify the signing key is authorized by the resource URL's domain.

### Key-to-Domain Binding

To establish trust, bind the signing key's DID to the resource domain using one of:

1. **`did:web` DID Document** - Serve at `https://example.com/.well-known/did.json`:
   ```json
   {
     "@context": [
       "https://www.w3.org/ns/did/v1",
       "https://w3id.org/security/suites/secp256k1recovery-2020/v2"
     ],
     "id": "did:web:example.com",
     "verificationMethod": [{
       "id": "did:web:example.com#receipt-signer",
       "type": "EcdsaSecp256k1RecoveryMethod2020",
       "controller": "did:web:example.com",
       "blockchainAccountId": "eip155:8453:0x1234..."
     }],
     "authentication": ["did:web:example.com#receipt-signer"]
   }
   ```
   The domain hosting the DID document establishes authority over the keys listed within it.

2. **DNS TXT Record** - Add a TXT record binding a DID to the domain:
   ```
   v=1;controller=did:pkh:eip155:8453:0x1234...
   ```

3. **OMATrust Key Binding Attestation** - The key owner creates an attestation specifying the key's purpose (e.g., "receipt-signing") and the domain it's authorized for. This allows flexible key delegation without DNS or server access.

### Verification Approaches

For production systems that need trust-bearing verification (verified reviews, reputation systems):

1. **Direct Verification** - Resolve the signer's DID and verify it's authorized for the domain via DNS or `.well-known`
2. **OMATrust Attestation** - Defer verification to the attestation framework, which handles key authorization as part of attestation validation (recommended)

## Files

| File | Description |
|------|-------------|
| [types.ts](./types.ts) | Type definitions for offers, receipts, and signers |
| [signing.ts](./signing.ts) | Signing utilities and offer/receipt creation |
| [server.ts](./server.ts) | Server extension and signer factories |
| [client.ts](./client.ts) | Client-side extraction utilities |

## Related

- [Extension Specification](../../../../../specs/extensions/extension-offer-and-receipt.md)
- [Client Example](../../../../../examples/typescript/clients/receipt-attestation/)
