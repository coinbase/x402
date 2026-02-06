import type { PaymentRequiredContext, SettleResultContext } from "../server/x402ResourceServer";

// Re-export context types from x402ResourceServer for convenience
export type { PaymentRequiredContext, SettleResultContext };

export interface ResourceServerExtension {
  key: string;
  /**
   * Enrich extension declaration with extension-specific data.
   *
   * @param declaration - Extension declaration from route config
   * @param transportContext - Transport-specific context (HTTP, A2A, MCP, etc.)
   * @returns Enriched extension declaration
   */
  enrichDeclaration?: (declaration: unknown, transportContext: unknown) => unknown;
  /**
   * Called when generating a 402 PaymentRequired response.
   * Return extension data to add to extensions[key], or undefined to skip.
   *
   * @param declaration - Extension declaration from route config
   * @param context - PaymentRequired context containing response and requirements
   * @returns Extension data to add to response.extensions[key]
   */
  enrichPaymentRequiredResponse?: (
    declaration: unknown,
    context: PaymentRequiredContext,
  ) => Promise<unknown>;
  /**
   * Called after successful payment settlement.
   * Return extension data to add to response.extensions[key], or undefined to skip.
   *
   * @param declaration - Extension declaration from route config
   * @param context - Settlement result context containing payment payload, requirements, result and optional transportContext
   * @returns Extension data to add to response.extensions[key]
   */
  enrichSettlementResponse?: (
    declaration: unknown,
    context: SettleResultContext,
  ) => Promise<unknown>;
}
