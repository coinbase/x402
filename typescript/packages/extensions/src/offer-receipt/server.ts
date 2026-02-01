/**
 * Offer-Receipt Extension for x402ResourceServer
 *
 * This module provides the ResourceServerExtension implementation that uses
 * the extension hooks (enrichPaymentRequiredResponse, enrichSettlementResponse)
 * to add signed offers and receipts to x402 payment flows.
 *
 * Based on: x402/specs/extensions/extension-offer-and-receipt.md (v1.0)
 */

import type {
  ResourceServerExtension,
  PaymentRequiredContext,
  SettleResultContext,
} from "@x402/core/types";
import type { PaymentRequirements } from "@x402/core/types";
import {
  OFFER_RECEIPT,
  type OfferReceiptSigner,
  type OfferReceiptDeclaration,
  type OfferInput,
  type SignedOffer,
  type SignedReceipt,
  type JWSSigner,
} from "./types";
import {
  createOfferJWS,
  createOfferEIP712,
  createReceiptJWS,
  createReceiptEIP712,
  extractEIP155ChainId,
  type SignTypedDataFn,
} from "./signing";

// ============================================================================
// JSON Schemas for Extension Responses
// ============================================================================

/**
 * JSON Schema for offer extension data (§6.1)
 */
const OFFER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          format: { type: "string" },
          acceptIndex: { type: "integer" },
          payload: {
            type: "object",
            properties: {
              version: { type: "integer" },
              resourceUrl: { type: "string" },
              scheme: { type: "string" },
              network: { type: "string" },
              asset: { type: "string" },
              payTo: { type: "string" },
              amount: { type: "string" },
              validUntil: { type: "integer" },
            },
            required: ["version", "resourceUrl", "scheme", "network", "asset", "payTo", "amount"],
          },
          signature: { type: "string" },
        },
        required: ["format", "signature"],
      },
    },
  },
  required: ["offers"],
};

/**
 * JSON Schema for receipt extension data (§6.5)
 */
const RECEIPT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    receipt: {
      type: "object",
      properties: {
        format: { type: "string" },
        payload: {
          type: "object",
          properties: {
            version: { type: "integer" },
            network: { type: "string" },
            resourceUrl: { type: "string" },
            payer: { type: "string" },
            issuedAt: { type: "integer" },
            transaction: { type: "string" },
          },
          required: ["version", "network", "resourceUrl", "payer", "issuedAt"],
        },
        signature: { type: "string" },
      },
      required: ["format", "signature"],
    },
  },
  required: ["receipt"],
};

// ============================================================================
// HTTP Transport Context
// ============================================================================

/**
 * HTTP transport context interface
 * This matches what x402HTTPResourceServer provides
 */
interface HTTPTransportContext {
  adapter?: {
    getUrl?: () => string;
  };
  request?: {
    url?: string;
    method?: string;
  };
  requestUrl?: string;
}

/**
 * Extract resource URL from transport context
 *
 * @param transportContext
 */
function extractResourceUrl(transportContext: unknown): string | undefined {
  const ctx = transportContext as HTTPTransportContext | undefined;

  // Try adapter.getUrl() first (HTTPRequestContext from x402HTTPResourceServer)
  if (ctx?.adapter?.getUrl) {
    return ctx.adapter.getUrl();
  }

  // Try requestUrl (direct property)
  if (ctx?.requestUrl) {
    return ctx.requestUrl;
  }

  // Try request.url
  if (ctx?.request?.url) {
    return ctx.request.url;
  }

  return undefined;
}

// ============================================================================
// Extension Factory
// ============================================================================

/**
 * Convert PaymentRequirements to OfferInput
 *
 * @param requirements
 * @param acceptIndex - Index into accepts[] array
 * @param maxTimeoutSeconds - Optional validity duration override (we use maxTimeoutSeconds instead of phdargen's validitySeconds to match the accepts[] field name)
 */
function requirementsToOfferInput(
  requirements: PaymentRequirements,
  acceptIndex: number,
  maxTimeoutSeconds?: number,
): OfferInput {
  return {
    acceptIndex,
    scheme: requirements.scheme,
    network: requirements.network,
    asset: requirements.asset,
    payTo: requirements.payTo,
    amount: requirements.amount,
    maxTimeoutSeconds: maxTimeoutSeconds ?? requirements.maxTimeoutSeconds,
  };
}

/**
 * Creates an offer-receipt extension for use with x402ResourceServer.
 *
 * The extension uses the hook system to:
 * 1. Add signed offers to each PaymentRequirements in 402 responses
 * 2. Add signed receipts to settlement responses after successful payment
 *
 * @param signer - The signer to use for creating offers and receipts
 * @returns ResourceServerExtension that can be registered with x402ResourceServer
 */
export function createOfferReceiptExtension(signer: OfferReceiptSigner): ResourceServerExtension {
  // Store the current resource URL during declaration enrichment for use in hooks
  let currentResourceUrl: string | undefined;

  return {
    key: OFFER_RECEIPT,

    /**
     * Enrich declaration with transport context
     * Captures the resource URL for later use in hooks
     *
     * @param declaration
     * @param transportContext
     */
    enrichDeclaration: (declaration: unknown, transportContext: unknown): unknown => {
      // Capture resource URL from transport context
      currentResourceUrl = extractResourceUrl(transportContext);
      return declaration;
    },

    /**
     * Add signed offers to 402 PaymentRequired response.
     * Returns extension data with signed offers (one per requirement).
     *
     * @param declaration
     * @param context
     */
    enrichPaymentRequiredResponse: async (
      declaration: unknown,
      context: PaymentRequiredContext,
    ): Promise<unknown> => {
      const config = declaration as OfferReceiptDeclaration | undefined;

      // Get resource URL - prefer from context, fall back to captured URL
      const resourceUrl = context.paymentRequiredResponse.resource?.url || currentResourceUrl;

      if (!resourceUrl) {
        console.warn("[offer-receipt] No resource URL available for signing offers");
        return undefined;
      }

      // Sign offers for each payment requirement
      const offers: SignedOffer[] = [];

      for (let i = 0; i < context.requirements.length; i++) {
        const requirement = context.requirements[i];
        try {
          const offerInput = requirementsToOfferInput(requirement, i, config?.maxTimeoutSeconds);
          const signedOffer = await signer.signOffer(resourceUrl, offerInput);
          offers.push(signedOffer);
        } catch (error) {
          console.error(`[offer-receipt] Failed to sign offer for requirement ${i}:`, error);
        }
      }

      if (offers.length === 0) {
        return undefined;
      }

      // Return extension data per spec structure
      return {
        info: {
          offers,
        },
        schema: OFFER_SCHEMA,
      };
    },

    /**
     * Add signed receipt to settlement response.
     * Returns extension data with signed receipt proving service delivery.
     *
     * @param declaration
     * @param context
     */
    enrichSettlementResponse: async (
      declaration: unknown,
      context: SettleResultContext,
    ): Promise<unknown> => {
      const config = declaration as OfferReceiptDeclaration | undefined;

      // Skip if settlement failed
      if (!context.result.success) {
        return undefined;
      }

      // Get payer from settlement result
      const payer = context.result.payer;
      if (!payer) {
        console.warn("[offer-receipt] No payer available for signing receipt");
        return undefined;
      }

      // Get network and transaction from settlement result
      const network = context.result.network;
      if (!network) {
        console.warn("[offer-receipt] No network available for signing receipt");
        return undefined;
      }
      const transaction = context.result.transaction;

      // Get resource URL from captured URL during declaration enrichment
      const resourceUrl = currentResourceUrl;

      if (!resourceUrl) {
        console.warn("[offer-receipt] No resource URL available for signing receipt");
        return undefined;
      }

      // Determine whether to include transaction hash (default: false for privacy)
      const includeTxHash = config?.includeTxHash === true;

      try {
        const signedReceipt: SignedReceipt = await signer.signReceipt(
          resourceUrl,
          payer,
          network,
          includeTxHash ? transaction || undefined : undefined,
        );
        // Return extension data per spec structure
        return {
          info: {
            receipt: signedReceipt,
          },
          schema: RECEIPT_SCHEMA,
        };
      } catch (error) {
        console.error("[offer-receipt] Failed to sign receipt:", error);
        return undefined;
      }
    },
  };
}

/**
 * Declare offer-receipt extension for a route
 *
 * Use this in route configuration to enable offer-receipt for a specific endpoint.
 *
 * @param config - Optional configuration for the extension
 * @returns Extension declaration object to spread into route config
 */
export function declareOfferReceiptExtension(
  config?: OfferReceiptDeclaration,
): Record<string, OfferReceiptDeclaration> {
  return {
    [OFFER_RECEIPT]: {
      includeTxHash: config?.includeTxHash,
      maxTimeoutSeconds: config?.maxTimeoutSeconds,
    },
  };
}

// ============================================================================
// Signer Factory Functions
// ============================================================================

/**
 * Create an OfferReceiptSigner that uses JWS format
 *
 * @param kid - Key identifier DID (e.g., did:web:api.example.com#key-1)
 * @param jwsSigner - JWS signer with sign() function and algorithm
 * @returns OfferReceiptSigner for use with createOfferReceiptExtension
 */
export function createJWSOfferReceiptSigner(kid: string, jwsSigner: JWSSigner): OfferReceiptSigner {
  return {
    kid,
    format: "jws",

    async signOffer(resourceUrl: string, input: OfferInput) {
      return createOfferJWS(resourceUrl, input, jwsSigner);
    },

    async signReceipt(resourceUrl: string, payer: string, network: string, transaction?: string) {
      return createReceiptJWS({ resourceUrl, payer, network, transaction }, jwsSigner);
    },
  };
}

/**
 * Create an OfferReceiptSigner that uses EIP-712 format
 *
 * @param kid - Key identifier DID (e.g., did:pkh:eip155:1:0x...)
 * @param signTypedData - Function to sign EIP-712 typed data (from viem wallet client)
 * @returns OfferReceiptSigner for use with createOfferReceiptExtension
 */
export function createEIP712OfferReceiptSigner(
  kid: string,
  signTypedData: SignTypedDataFn,
): OfferReceiptSigner {
  return {
    kid,
    format: "eip712",

    async signOffer(resourceUrl: string, input: OfferInput) {
      const chainId = extractEIP155ChainId(input.network);
      return createOfferEIP712(resourceUrl, input, chainId, signTypedData);
    },

    async signReceipt(resourceUrl: string, payer: string, network: string, transaction?: string) {
      const chainId = extractEIP155ChainId(network);
      return createReceiptEIP712({ resourceUrl, payer, network, transaction }, chainId, signTypedData);
    },
  };
}
