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
 * Options for creating server-side SIWX hooks.
 */
export interface CreateSIWxHookOptions {
  /** Storage for tracking paid addresses */
  storage: SIWxStorage;
  /** Options for signature verification (e.g., EVM smart wallet support) */
  verifyOptions?: SIWxVerifyOptions;
}

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
  const { storage } = options;

  return async (ctx: {
    paymentPayload: { payload: unknown; resource: { url: string } };
  }): Promise<void> => {
    const payload = ctx.paymentPayload.payload as { authorization?: { from?: string } };
    const address = payload?.authorization?.from;
    if (!address) return;

    const resource = new URL(ctx.paymentPayload.resource.url).pathname;
    await storage.recordPayment(resource, address);
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
  const { storage, verifyOptions } = options;

  return async (
    context: { adapter: { getHeader(name: string): string | undefined; getUrl(): string }; path: string },
  ): Promise<void | { grantAccess: true }> => {
    const header = context.adapter.getHeader(SIGN_IN_WITH_X.toLowerCase());
    if (!header) return;

    try {
      const payload = parseSIWxHeader(header);
      const resourceUri = context.adapter.getUrl();

      const validation = await validateSIWxMessage(payload, resourceUri);
      if (!validation.valid) return;

      const verification = await verifySIWxSignature(payload, verifyOptions);
      if (!verification.valid || !verification.address) return;

      const hasPaid = await storage.hasPaid(context.path, verification.address);
      if (hasPaid) {
        return { grantAccess: true };
      }
    } catch {
      // Invalid SIWX, continue to payment flow
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
