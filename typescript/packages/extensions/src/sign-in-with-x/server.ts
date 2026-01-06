/**
 * ResourceServerExtension hook for SIWX extension
 *
 * Optional hook for x402 resource server integration.
 * Can enrich declarations based on transport context.
 */

import { SIGN_IN_WITH_X } from "./types";

/**
 * Extension declaration type for SIWX
 */
export interface SIWxDeclaration {
  info: unknown;
  schema: unknown;
}

/**
 * Transport context provided by the resource server
 */
export interface TransportContext {
  /** HTTP request if using HTTP transport */
  request?: { headers: Headers; url: string };
}

/**
 * SIWX ResourceServerExtension hook.
 *
 * Currently passes through declarations unchanged.
 * Can be extended to auto-derive fields from HTTP context.
 *
 * @example
 * ```typescript
 * import { siwxResourceServerExtension } from '@x402/extensions/sign-in-with-x';
 *
 * // Register with x402 resource server
 * server.registerExtension(siwxResourceServerExtension);
 * ```
 */
export const siwxResourceServerExtension = {
  key: SIGN_IN_WITH_X,

  /**
   * Enrich SIWX declaration with transport context.
   * Currently a pass-through; can be extended for auto-derivation.
   */
  enrichDeclaration: (
    declaration: SIWxDeclaration,
    _transportContext?: TransportContext,
  ): SIWxDeclaration => {
    // Pass through - server explicitly declares SIWX requirements
    // Future: Could auto-derive domain from HTTP Host header
    return declaration;
  },
};
