/**
 * Server-side extension hooks for offer/receipt generation
 *
 * This module provides:
 * 1. ResourceServerExtension implementation for framework adapters
 * 2. Factory functions to create OfferReceiptSigner instances
 */

import type { ResourceServerExtension } from "@x402/core/types";
import type { OfferReceiptSigner } from "@x402/core/types";
import type { PaymentRequirements } from "@x402/core/types";
import { OFFER_RECEIPT } from "./types";
import type { JWSSigner } from "./types";
import {
  createOfferJWS,
  createOfferEIP712,
  createReceiptJWS,
  createReceiptEIP712,
  type OfferInput,
  type SignTypedDataFn,
} from "./signing";

/**
 * Resource server extension for offer/receipt
 *
 * This extension enriches the declaration with transport context
 * (similar to the bazaar extension pattern).
 */
export const offerReceiptResourceServerExtension: ResourceServerExtension = {
  key: OFFER_RECEIPT,

  enrichDeclaration: (declaration, _transportContext) => {
    // For now, pass through the declaration unchanged
    // Framework adapters handle the actual signing
    return declaration;
  },
};

/**
 * Convert PaymentRequirements to OfferInput
 *
 * @param requirements
 */
function requirementsToOfferInput(requirements: PaymentRequirements): OfferInput {
  return {
    scheme: requirements.scheme,
    settlement: (requirements.extra?.settlement as string) || "txid",
    network: requirements.network,
    asset: requirements.asset,
    payTo: requirements.payTo,
    amount: requirements.amount,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
  };
}

/**
 * Create an OfferReceiptSigner that uses JWS format
 *
 * @param kid - Key identifier DID (e.g., did:web:api.example.com#key-1)
 * @param jwsSigner - JWS signer with sign() function and algorithm
 * @returns OfferReceiptSigner compatible with framework middleware
 *
 * @example
 * ```typescript
 * import { createJWSOfferReceiptSigner } from "@x402/extensions/offer-receipt";
 *
 * const signer = createJWSOfferReceiptSigner(
 *   "did:web:api.example.com#key-1",
 *   {
 *     kid: "did:web:api.example.com#key-1",
 *     format: "jws",
 *     algorithm: "ES256K",
 *     sign: async (payload) => { ... }
 *   }
 * );
 *
 * app.use(paymentMiddleware(routes, server, paywallConfig, undefined, true, {
 *   offerSigner: signer,
 *   receiptSigner: signer
 * }));
 * ```
 */
export function createJWSOfferReceiptSigner(kid: string, jwsSigner: JWSSigner): OfferReceiptSigner {
  return {
    kid,
    format: "jws",

    async signOffer(resourceUrl: string, requirements: PaymentRequirements) {
      const input = requirementsToOfferInput(requirements);
      const signed = await createOfferJWS(resourceUrl, input, jwsSigner);
      return signed;
    },

    async signReceipt(resourceUrl: string, payer: string) {
      const signed = await createReceiptJWS({ resourceUrl, payer }, jwsSigner);
      return signed;
    },
  };
}

/**
 * Create an OfferReceiptSigner that uses EIP-712 format
 *
 * @param kid - Key identifier DID (e.g., did:pkh:eip155:1:0x...)
 * @param chainId - Chain ID for EIP-712 domain
 * @param signTypedData - Function to sign EIP-712 typed data (from viem wallet client)
 * @returns OfferReceiptSigner compatible with framework middleware
 *
 * @example
 * ```typescript
 * import { createEIP712OfferReceiptSigner } from "@x402/extensions/offer-receipt";
 * import { createWalletClient, http } from "viem";
 * import { privateKeyToAccount } from "viem/accounts";
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY);
 * const walletClient = createWalletClient({ account, transport: http() });
 *
 * const signer = createEIP712OfferReceiptSigner(
 *   `did:pkh:eip155:1:${account.address}`,
 *   1, // mainnet
 *   walletClient.signTypedData
 * );
 * ```
 */
export function createEIP712OfferReceiptSigner(
  kid: string,
  chainId: number,
  signTypedData: SignTypedDataFn,
): OfferReceiptSigner {
  return {
    kid,
    format: "eip712",

    async signOffer(resourceUrl: string, requirements: PaymentRequirements) {
      const input = requirementsToOfferInput(requirements);
      const signed = await createOfferEIP712(resourceUrl, input, chainId, signTypedData);
      return {
        format: "eip712" as const,
        payload: signed.payload as unknown as Record<string, unknown>,
        signature: signed.signature,
      };
    },

    async signReceipt(resourceUrl: string, payer: string) {
      const signed = await createReceiptEIP712({ resourceUrl, payer }, chainId, signTypedData);
      return {
        format: "eip712" as const,
        payload: signed.payload as unknown as Record<string, unknown>,
        signature: signed.signature,
      };
    },
  };
}
