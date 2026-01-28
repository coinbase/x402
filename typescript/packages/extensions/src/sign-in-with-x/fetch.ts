/**
 * Fetch wrapper for SIWX authentication.
 *
 * Provides a convenient wrapper around fetch that automatically handles
 * SIWX authentication when a 402 response includes SIWX extension info.
 */

import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { SIWxSigner } from "./sign";
import type { SIWxExtension } from "./types";
import { SIGN_IN_WITH_X } from "./types";
import { createSIWxPayload } from "./client";
import { encodeSIWxHeader } from "./encode";

/**
 * Helper to extract signer's chain ID from signer object.
 *
 * @param signer - Wallet signer (EVMSigner or SolanaSigner)
 * @returns CAIP-2 chain ID (e.g., "eip155:1" or "solana:5eykt...")
 */
async function getSignerChainIdForFetch(signer: SIWxSigner): Promise<string> {
  if ("getChainId" in signer && typeof signer.getChainId === "function") {
    return await signer.getChainId();
  }
  // Fallback: detect from signer properties
  const isEVM = "address" in signer || "account" in signer;
  return isEVM ? "eip155:1" : "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
}

/**
 * Wraps fetch to automatically handle SIWX authentication.
 *
 * When a 402 response is received with a SIWX extension:
 * 1. Extracts SIWX info from PAYMENT-REQUIRED header
 * 2. Creates signed SIWX proof using the provided signer
 * 3. Retries the request with the SIWX header
 *
 * If the 402 response doesn't include SIWX extension info, the original
 * response is returned unchanged (allowing payment handling to proceed).
 *
 * @param fetch - The fetch function to wrap (typically globalThis.fetch)
 * @param signer - Wallet signer (EVMSigner or SolanaSigner)
 * @returns A wrapped fetch function that handles SIWX authentication
 *
 * @example
 * ```typescript
 * import { wrapFetchWithSIWx } from '@x402/extensions/sign-in-with-x';
 * import { privateKeyToAccount } from 'viem/accounts';
 *
 * const signer = privateKeyToAccount(privateKey);
 * const fetchWithSIWx = wrapFetchWithSIWx(fetch, signer);
 *
 * // Request that may require SIWX auth (for returning paid users)
 * const response = await fetchWithSIWx('https://api.example.com/data');
 * ```
 */
export function wrapFetchWithSIWx(fetch: typeof globalThis.fetch, signer: SIWxSigner) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const clonedRequest = request.clone();

    const response = await fetch(request);

    if (response.status !== 402) {
      return response;
    }

    // Extract SIWX info from 402 response
    const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
    if (!paymentRequiredHeader) {
      return response; // No PAYMENT-REQUIRED header, return original response
    }

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
    const siwxExtension = paymentRequired.extensions?.[SIGN_IN_WITH_X] as SIWxExtension | undefined;

    if (!siwxExtension?.supportedChains) {
      return response; // Server doesn't support SIWX, return original 402
    }

    // Prevent infinite loops
    if (clonedRequest.headers.has(SIGN_IN_WITH_X)) {
      throw new Error("SIWX authentication already attempted");
    }

    // Get signer's chain and find matching chain in supportedChains
    const signerChainId = await getSignerChainIdForFetch(signer);
    const matchingChain = siwxExtension.supportedChains.find(
      chain => chain.chainId === signerChainId,
    );

    if (!matchingChain) {
      return response; // Chain not supported, return original 402
    }

    // Build complete info with selected chain
    const completeInfo = {
      ...siwxExtension.info,
      chainId: matchingChain.chainId,
      type: matchingChain.type,
    };

    // Create and send SIWX proof
    const payload = await createSIWxPayload(completeInfo, signer);
    const siwxHeader = encodeSIWxHeader(payload);

    clonedRequest.headers.set(SIGN_IN_WITH_X, siwxHeader);

    return fetch(clonedRequest);
  };
}
