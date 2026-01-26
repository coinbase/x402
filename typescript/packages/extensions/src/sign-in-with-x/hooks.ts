/**
 * SIWX Lifecycle Hooks
 *
 * Pre-built hooks for integrating SIWX authentication with x402 servers and clients.
 */

import type { SIWxStorage } from "./storage";
import type { SIWxExtensionInfo, SIWxVerifyOptions } from "./types";
import type { SIWxSigner } from "./sign";
import { SIGN_IN_WITH_X } from "./types";
import { parseSIWxHeader } from "./parse";
import { validateSIWxMessage } from "./validate";
import { verifySIWxSignature } from "./verify";
import { createSIWxPayload } from "./client";
import { encodeSIWxHeader } from "./encode";

/**
 * Extracts the payer address from a payment payload.
 * Supports multiple payment scheme formats.
 *
 * @param payload - The payment payload from settlement
 * @returns The payer address if found, undefined otherwise
 */
function extractPayerAddress(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const p = payload as Record<string, unknown>;

  // EVM exact scheme: payload.authorization.from
  if (p.authorization && typeof p.authorization === "object") {
    const auth = p.authorization as Record<string, unknown>;
    if (typeof auth.from === "string") return auth.from;
  }

  // Solana exact scheme: payload.payer
  if (typeof p.payer === "string") return p.payer;

  // Generic: payload.from
  if (typeof p.from === "string") return p.from;

  return undefined;
}

/**
 * Options for creating server-side SIWX hooks.
 */
export interface CreateSIWxHookOptions {
  /** Storage for tracking paid addresses */
  storage: SIWxStorage;
  /** Options for signature verification (e.g., EVM smart wallet support) */
  verifyOptions?: SIWxVerifyOptions;
  /** Optional callback for logging/debugging */
  onEvent?: (event: SIWxHookEvent) => void;
}

/**
 * Events emitted by SIWX hooks for logging/debugging.
 */
export type SIWxHookEvent =
  | { type: "payment_recorded"; resource: string; address: string }
  | { type: "access_granted"; resource: string; address: string }
  | { type: "validation_failed"; resource: string; error?: string }
  | { type: "siwx_header_sent"; resource: string };

/**
 * Creates an onAfterSettle hook that records payments for SIWX.
 *
 * @param options - Hook configuration
 * @returns Hook function for x402ResourceServer.onAfterSettle()
 *
 * @example
 * ```typescript
 * const storage = new InMemorySIWxStorage();
 * const resourceServer = new x402ResourceServer(facilitator)
 *   .onAfterSettle(createSIWxSettleHook({ storage }));
 * ```
 */
export function createSIWxSettleHook(options: CreateSIWxHookOptions) {
  const { storage, onEvent } = options;

  return async (ctx: {
    paymentPayload: { payload: unknown; resource: { url: string } };
    result: { success: boolean };
  }): Promise<void> => {
    // Only record payment if settlement succeeded
    if (!ctx.result.success) return;

    const address = extractPayerAddress(ctx.paymentPayload.payload);
    if (!address) return;

    const resource = new URL(ctx.paymentPayload.resource.url).pathname;
    await storage.recordPayment(resource, address);
    onEvent?.({ type: "payment_recorded", resource, address });
  };
}

/**
 * Creates an onProtectedRequest hook that validates SIWX auth before payment.
 *
 * @param options - Hook configuration
 * @returns Hook function for x402HTTPResourceServer.onProtectedRequest()
 *
 * @example
 * ```typescript
 * const storage = new InMemorySIWxStorage();
 * const httpServer = new x402HTTPResourceServer(resourceServer, routes)
 *   .onProtectedRequest(createSIWxRequestHook({ storage }));
 * ```
 */
export function createSIWxRequestHook(options: CreateSIWxHookOptions) {
  const { storage, verifyOptions, onEvent } = options;

  return async (context: {
    adapter: { getHeader(name: string): string | undefined; getUrl(): string };
    path: string;
  }): Promise<void | { grantAccess: true }> => {
    // Try both cases for header (HTTP headers are case-insensitive)
    const header =
      context.adapter.getHeader(SIGN_IN_WITH_X) ||
      context.adapter.getHeader(SIGN_IN_WITH_X.toLowerCase());
    if (!header) return;

    try {
      const payload = parseSIWxHeader(header);
      const resourceUri = context.adapter.getUrl();

      const validation = await validateSIWxMessage(payload, resourceUri);
      if (!validation.valid) {
        onEvent?.({ type: "validation_failed", resource: context.path, error: validation.error });
        return;
      }

      const verification = await verifySIWxSignature(payload, verifyOptions);
      if (!verification.valid || !verification.address) {
        onEvent?.({ type: "validation_failed", resource: context.path, error: verification.error });
        return;
      }

      const hasPaid = await storage.hasPaid(context.path, verification.address);
      if (hasPaid) {
        onEvent?.({
          type: "access_granted",
          resource: context.path,
          address: verification.address,
        });
        return { grantAccess: true };
      }
    } catch (err) {
      onEvent?.({
        type: "validation_failed",
        resource: context.path,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };
}

/**
 * Creates an onPaymentRequired hook for client-side SIWX authentication.
 *
 * @param signer - Wallet signer for creating SIWX proofs
 * @returns Hook function for x402HTTPClient.onPaymentRequired()
 *
 * @example
 * ```typescript
 * const httpClient = new x402HTTPClient(client)
 *   .onPaymentRequired(createSIWxClientHook(signer));
 * ```
 */
export function createSIWxClientHook(signer: SIWxSigner) {
  return async (context: {
    paymentRequired: { extensions?: Record<string, unknown> };
  }): Promise<{ headers: Record<string, string> } | void> => {
    const siwxExtension = context.paymentRequired.extensions?.[SIGN_IN_WITH_X] as
      | { info: SIWxExtensionInfo }
      | undefined;

    if (!siwxExtension?.info) return;

    try {
      const payload = await createSIWxPayload(siwxExtension.info, signer);
      const header = encodeSIWxHeader(payload);
      return { headers: { [SIGN_IN_WITH_X]: header } };
    } catch {
      // Failed to create SIWX payload, continue to payment
    }
  };
}
