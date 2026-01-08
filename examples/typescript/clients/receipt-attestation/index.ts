/**
 * Receipt Attestation Client Example
 *
 * Demonstrates the full x402 payment flow with offer/receipt extraction and
 * attestation payload creation for verified user reviews.
 *
 * Flow:
 * 1. Make a paid request to an x402-protected endpoint
 * 2. Extract the signed offer from the 402 response (if available)
 * 3. Extract the signed receipt from the success response (if available)
 * 4. Create an attestation payload using receipt (preferred) or offer (fallback)
 * 5. The attestation can be submitted to OMATrust or any trust system
 */

import { config } from "dotenv";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import {
  createOfferReceiptExtractor,
  extractPayload,
  type OfferReceiptResponse,
  type SignedReceipt,
  type SignedOffer,
  type ReceiptPayload,
  type OfferPayload,
} from "@x402/extensions/offer-receipt";
import { createOMATrustUserReview, type ProofSource } from "./omatrust";

config();

// SECURITY WARNING: Loading private keys from environment variables is for demonstration
// purposes only. In production, use secure key management solutions such as hardware
// wallets, HSMs, or cloud KMS services. Never commit real private keys to source control.
const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;

/**
 * Example demonstrating the full offer/receipt → attestation flow.
 *
 * This shows how a client can:
 * 1. Make a paid API request
 * 2. Extract signed offers from the 402 response
 * 3. Extract the signed receipt proving they paid for the service
 * 4. Create a verified user review attestation (using receipt or offer)
 *
 * Required environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 */
async function main(): Promise<void> {
  console.log("=== x402 Offer/Receipt Attestation Example ===\n");
  
  // Step 1: Set up the payment-enabled client (supports both EVM and SVM)
  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: evmSigner });
  registerExactSvmScheme(client, { signer: svmSigner });

  // Use the offer/receipt extractor to capture payment metadata
  const fetchWithPayment = wrapFetchWithPayment(fetch, client, {
    onPaymentComplete: createOfferReceiptExtractor()
  });

  // Step 2: Make request (client handles 402 → payment → retry automatically)
  console.log(`Making request to: ${url}\n`);
  console.log("(If 402 received, client will automatically pay and retry)\n");
  const response = await fetchWithPayment(url, { method: "GET" }) as OfferReceiptResponse;

  if (!response.ok) {
    console.error(`Request failed with status: ${response.status}`);
    process.exit(1);
  }

  const body = await response.json();
  console.log("Response body:", body);

  // Step 3: Extract x402 metadata from response
  const offerReceipt = response.offerReceipt;

  if (!offerReceipt) {
    console.log("\nNo offer/receipt metadata (payment may not have been required)");
    process.exit(0);
  }

  console.log("\n--- x402 Payment Metadata ---");

  // Step 4: Extract the accepted offer and display all offers for reference
  const offers = offerReceipt.offers;
  const acceptedOffer = offerReceipt.acceptedOffer;

  if (acceptedOffer) {
    console.log("\nAccepted offer:");
    const acceptedPayload = extractPayload<OfferPayload>(acceptedOffer);
    console.log(`  format: ${acceptedOffer.format}`);
    console.log(`  resourceUrl: ${acceptedPayload.resourceUrl}`);
    console.log(`  scheme: ${acceptedPayload.scheme}`);
    console.log(`  amount: ${acceptedPayload.amount}`);
    console.log(`  network: ${acceptedPayload.network}`);
  }

  if (offers && offers.length > 0) {
    console.log(`\nAll offers received (${offers.length} total):`);
    offers.forEach((offer, i) => {
      console.log(`  Offer ${i + 1}: format=${offer.format}`);
      const offerPayload = extractPayload<OfferPayload>(offer);
      console.log(`    resourceUrl: ${offerPayload.resourceUrl}`);
      console.log(`    amount: ${offerPayload.amount}`);
      console.log(`    network: ${offerPayload.network}`);
    });
  }

  // Show settlement response
  if (offerReceipt.settlementResponse) {
    console.log("\nSettlement response:");
    console.log(`  success: ${offerReceipt.settlementResponse.success}`);
    console.log(`  transaction: ${offerReceipt.settlementResponse.transaction}`);
    console.log(`  network: ${offerReceipt.settlementResponse.network}`);
    console.log(`  payer: ${offerReceipt.settlementResponse.payer}`);
  }

  // Step 5: Extract and display the receipt
  const receipt = offerReceipt.receipt as SignedReceipt | undefined;

  if (receipt) {
    console.log("\n--- Signed Receipt ---");
    console.log(`Format: ${receipt.format}`);

    const receiptPayload = extractPayload<ReceiptPayload>(receipt);
    console.log("Receipt payload:");
    console.log(`  resourceUrl: ${receiptPayload.resourceUrl}`);
    console.log(`  payer: ${receiptPayload.payer}`);
    console.log(`  issuedAt: ${receiptPayload.issuedAt} (${new Date(receiptPayload.issuedAt * 1000).toISOString()})`);
  } else {
    console.log("\n--- No Receipt ---");
    console.log("Server did not return a receipt (receipt signing may not be enabled)");
  }

  // Step 6: Create an attestation payload
  console.log("\n--- Creating Attestation Payload ---");

  // Get network from settlement response or accepted offer
  const network = offerReceipt.settlementResponse?.network 
    || (acceptedOffer ? extractPayload<OfferPayload>(acceptedOffer).network : "eip155:1");

  if (receipt) {
    // Preferred: Use receipt for verified review (proves payment completed)
    console.log("Using RECEIPT for attestation (verified purchase)");

    const receiptPayload = extractPayload<ReceiptPayload>(receipt);
    const proofSource: ProofSource = {
      type: "receipt",
      proof: receipt,
      payer: receiptPayload.payer,
      network,
    };

    const review = createOMATrustUserReview(
      proofSource,
      {
        ratingValue: 5,
        reviewBody: "Excellent API service! Fast and reliable.",
      }
    );

    console.log("\nOMATrust User Review (with x402-receipt proof):");
    console.log(JSON.stringify(review, null, 2));
  } else if (acceptedOffer) {
    // Fallback: Use offer for review (proves terms were presented, not that payment completed)
    console.log("Using OFFER for attestation (no receipt available)");
    console.log("Note: Offer-based reviews are less trusted than receipt-based reviews");

    const payer = offerReceipt.settlementResponse?.payer || evmSigner.address;
    const proofSource: ProofSource = {
      type: "offer",
      proof: acceptedOffer,
      payer,
      network,
    };

    const review = createOMATrustUserReview(
      proofSource,
      {
        ratingValue: 3,
        reviewBody: "Service worked but no receipt was provided.",
      }
    );

    console.log("\nOMATrust User Review (with x402-offer proof):");
    console.log(JSON.stringify(review, null, 2));
  } else {
    console.log("No offer or receipt available - cannot create attestation");
    process.exit(0);
  }

  // Step 7: Explain what to do next
  console.log("\n--- Next Steps ---");
  console.log("To submit this review to OMATrust:");
  console.log("1. See the README.md for complete EAS submission code");
  console.log("2. Install: pnpm add @ethereum-attestation-service/eas-sdk ethers");
  console.log("3. Use the submitToOMATrust() function from the README");
  console.log("\nThe review payload above is ready to submit to OMATrust!");
  console.log("Receipt-based reviews get a 'Verified Purchase' badge.");
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
