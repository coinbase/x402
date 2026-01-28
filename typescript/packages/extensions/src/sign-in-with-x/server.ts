/**
 * Server-side ResourceServerExtension for SIWX
 *
 * Provides enrichDeclaration hook to refresh time-based fields per request.
 */

import { randomBytes } from "crypto";
import type { ResourceServerExtension } from "@x402/core/types";
import type { SIWxExtension } from "./types";
import { SIGN_IN_WITH_X } from "./types";

/**
 * SIWX Resource Server Extension.
 *
 * Implements enrichDeclaration hook to refresh time-based fields (nonce, issuedAt, expirationTime)
 * for each 402 PaymentRequired response, preventing stale nonces and expired timestamps.
 *
 * @example
 * ```typescript
 * import { siwxResourceServerExtension } from "@x402/extensions/sign-in-with-x";
 *
 * const resourceServer = new x402ResourceServer(facilitator)
 *   .registerExtension(siwxResourceServerExtension)
 *   .onAfterSettle(createSIWxSettleHook({ storage }));
 * ```
 */
export const siwxResourceServerExtension: ResourceServerExtension = {
  key: SIGN_IN_WITH_X,

  enrichDeclaration: (declaration, _) => {
    const extension = declaration as SIWxExtension & { _metadata?: { expirationSeconds?: number } };

    // Refresh time-based fields per request to prevent expiration
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date().toISOString();

    // Calculate expirationTime based on configured duration
    // undefined = infinite expiration (omit expirationTime field)
    const expirationSeconds = extension._metadata?.expirationSeconds;
    const expirationTime =
      expirationSeconds !== undefined
        ? new Date(Date.now() + expirationSeconds * 1000).toISOString()
        : undefined;

    const info: Record<string, unknown> = {
      ...extension.info,
      nonce,
      issuedAt,
    };

    // Only include expirationTime if defined (allows infinite expiration)
    if (expirationTime !== undefined) {
      info.expirationTime = expirationTime;
    }

    // Return with supportedChains preserved
    return {
      info,
      supportedChains: extension.supportedChains,
      schema: extension.schema,
    };
  },
};
