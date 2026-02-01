/**
 * x402 Receipt Attestation Client Example
 *
 * Demonstrates extracting signed offers and receipts from x402 payment flows.
 * Uses the raw flow for visibility into what's happening at each step.
 *
 * Use Cases for Signed Receipts/Offers:
 * - Verified user reviews ("Verified Purchase" badges)
 * - Audit trails and compliance records
 * - Dispute resolution evidence
 * - Agent memory (AI agents proving past interactions)
 */

import { config } from "dotenv";
import {
  x402Client,
  x402HTTPClient,
  type PaymentRequired,
} from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import {
  extractOffersFromPaymentRequired,
  decodeSignedOffers,
  findAcceptsObjectFromSignedOffer,
  extractReceiptFromResponse,
  extractReceiptPayload,
  verifyReceiptMatchesOffer,
} from "@x402/extensions/offer-receipt";

config();

// ============================================================================
// SECURITY WARNING
// ============================================================================
//
// 1. PRIVATE KEY MANAGEMENT
//    Loading private keys from environment variables is for demonstration only.
//    In production, use secure key management (HSM, KMS, hardware wallets).
//
// 2. KEY SEPARATION
//    The payment signing key SHOULD be different from keys controlling
//    wallets with significant funds.
//
// 3. KEY-TO-DOMAIN BINDING (for servers)
//    See specs/extensions/extension-offer-and-receipt.md §4.5.1
//
// ============================================================================

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;

async function main(): Promise<void> {
  // Set up payment client
  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: evmSigner });
  registerExactSvmScheme(client, { signer: svmSigner });

  const httpClient = new x402HTTPClient(client);

  // =========================================================================
  // Step 1: Initial request (expect 402)
  // =========================================================================
  console.log(`Requesting: ${url}`);
  const initialResponse = await fetch(url, { method: "GET" });

  if (initialResponse.status !== 402) {
    const body = await initialResponse.json();
    console.log("Response:", body);
    return;
  }

  // =========================================================================
  // Step 2: Extract and decode signed offers from 402 response
  // =========================================================================
  const paymentRequiredBody = await initialResponse.json() as PaymentRequired;
  const getHeader = (name: string) => initialResponse.headers.get(name);
  const paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, paymentRequiredBody);

  const signedOffers = extractOffersFromPaymentRequired(paymentRequired);

  if (signedOffers.length === 0) {
    console.log("No signed offers (server may not have offer signing enabled)");
    return;
  }

  // Decode all offers to inspect their payloads
  const decodedOffers = decodeSignedOffers(signedOffers);

  console.log(`\nSigned Offers (${decodedOffers.length}):`);
  decodedOffers.forEach((d, i) => {
    console.log(`  [${i}] ${d.scheme} on ${d.network}: ${d.amount} to ${d.payTo}`);
  });

  // =========================================================================
  // Step 3: Select offer and find matching accepts entry
  // =========================================================================
  // Select the first offer (could filter by network, sort by amount, etc.)
  const selected = decodedOffers[0];
  const matchingAccept = findAcceptsObjectFromSignedOffer(selected, paymentRequired.accepts);

  if (!matchingAccept) {
    console.log("\nNo matching accepts[] entry for signed offer");
    return;
  }

  console.log(`\nSelected: ${selected.scheme} on ${selected.network}`);

  // =========================================================================
  // Step 4: Create payment and retry
  // =========================================================================
  console.log("Making payment...");

  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  const paidResponse = await fetch(url, {
    method: "GET",
    headers: paymentHeaders,
  });

  if (!paidResponse.ok) {
    console.error(`Payment failed: ${paidResponse.status}`);
    return;
  }

  const responseBody = await paidResponse.json();
  console.log("Response:", responseBody);

  // =========================================================================
  // Step 5: Extract signed receipt from success response
  // =========================================================================
  const signedReceipt = extractReceiptFromResponse(paidResponse);

  if (signedReceipt) {
    const receiptPayload = extractReceiptPayload(signedReceipt);
    console.log(`\nSigned Receipt:`);
    console.log(`  format: ${signedReceipt.format}`);
    console.log(`  resourceUrl: ${receiptPayload.resourceUrl}`);
    console.log(`  payer: ${receiptPayload.payer}`);
    console.log(`  network: ${receiptPayload.network}`);
    console.log(`  issuedAt: ${new Date(receiptPayload.issuedAt * 1000).toISOString()}`);
    if (receiptPayload.transaction) {
      console.log(`  transaction: ${receiptPayload.transaction}`);
    }
  } else {
    console.log("\nNo signed receipt (server may not have receipt signing enabled)");
  }

  // =========================================================================
  // Step 6: Verify receipt matches offer
  // =========================================================================
  //
  // IMPORTANT: Key Binding Verification
  // ------------------------------------
  // The extraction functions (extractReceiptPayload, extractOfferPayload) do
  // NOT verify signatures. They only decode the payload. Before trusting a
  // receipt or offer, you should verify:
  //
  // 1. SIGNATURE VALIDITY
  //    - JWS: Use jose.compactVerify() with the public key
  //    - EIP-712: Use viem's recoverTypedDataAddress() to recover the signer
  //
  // 2. KEY-TO-DOMAIN BINDING
  //    The signing key must be authorized to sign for the resource URL's domain.
  //    To verify this:
  //    - Extract the signer's DID (kid from JWS header, or did:pkh from EIP-712)
  //    - Derive the expected domain DID from resourceUrl (e.g., did:web:api.example.com)
  //    - Check that the signing key is bound to that domain via:
  //      a) did:web document at https://<domain>/.well-known/did.json
  //      b) DNS TXT record binding the DID to the domain
  //      c) On-chain attestation (e.g., OMATrust key binding attestation)
  //
  // This verification is typically performed by downstream trust systems
  // (OMATrust, PEAC) when you submit the receipt as proof. However, clients
  // can also verify directly if they need immediate trust decisions.
  //
  // See: specs/extensions/extension-offer-and-receipt.md §4.5.1
  // =========================================================================

  if (signedReceipt) {
    // Basic payload field verification (does NOT verify signature or key binding)
    const payerAddresses = [evmSigner.address, svmSigner.address];
    const verified = verifyReceiptMatchesOffer(signedReceipt, selected, payerAddresses);

    console.log(`\nPayload Verification: ${verified ? "✓ PASSED" : "✗ FAILED"}`);
    console.log(`  (Note: Signature and key binding verification not shown in this example)`);

    if (!verified) {
      // For debugging, show individual checks
      const receiptPayload = extractReceiptPayload(signedReceipt);
      console.log(`  resourceUrl: ${receiptPayload.resourceUrl === selected.resourceUrl ? "✓" : "✗"}`);
      console.log(`  network: ${receiptPayload.network === selected.network ? "✓" : "✗"}`);
      const payerMatch = payerAddresses.some(
        (addr) => receiptPayload.payer.toLowerCase() === addr.toLowerCase()
      );
      console.log(`  payer: ${payerMatch ? "✓" : "✗"}`);
      const issuedRecently = Math.floor(Date.now() / 1000) - receiptPayload.issuedAt < 3600;
      console.log(`  recent: ${issuedRecently ? "✓" : "✗"}`);
    }
  }

  // =========================================================================
  // Step 7: Summary - Proofs available for downstream use
  // =========================================================================
  console.log("\n--- Proofs Available ---");
  if (signedReceipt) {
    console.log("✓ x402-receipt (proves payment received AND service delivered)");
  }
  if (selected) {
    console.log("✓ x402-offer (proves server committed to payment terms)");
  }

  // -------------------------------------------------------------------------
  // Integration Point: Trust Systems (OMATrust, PEAC, etc.)
  // -------------------------------------------------------------------------
  //
  // This is where integration with downstream systems like OMATrust and PEAC
  // can reside. These systems are planning to support x402 signed receipts
  // and offers for use cases like:
  //
  // - Verified user reviews ("Verified Purchase" badges)
  // - Audit trails and compliance records
  // - Dispute resolution evidence
  // - Agent memory proofs
  //
  // Integration examples will be added in a future update.
  // -------------------------------------------------------------------------
}

main().catch((error) => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
