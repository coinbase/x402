import { SettleResponse, VerifyResponse } from "./facilitator";
import { PaymentRequired } from "./payments";
import type {
  PaymentRequiredContext,
  VerifyResultContext,
  SettleResultContext,
} from "../server/x402ResourceServer";

// Re-export context types from x402ResourceServer for convenience
export type { PaymentRequiredContext, VerifyResultContext, SettleResultContext };

export interface ResourceServerExtension {
  key: string;
  /**
   * Enrich extension declaration with extension-specific data.
   * Only allowed to modify declaration field, preserving all core fields.
   *
   * @param declaration - Extension declaration from route config
   * @param transportContext - Transport-specific context (HTTP, A2A, MCP, etc.)
   * @returns Enriched extension declaration
   */
  enrichDeclaration?: (declaration: unknown, transportContext: unknown) => unknown;
  /**
   * Enrich PaymentRequired response with extension-specific data.
   * Only allowed to modify extensions[key] field, preserving all core fields.
   *
   * @param declaration - Extension declaration from route config
   * @param context - PaymentRequired context containing response and requirements
   * @returns Enriched payment required response
   */
  enrichPaymentRequiredResponse?: (
    declaration: unknown,
    context: PaymentRequiredContext,
  ) => Promise<PaymentRequired>;
  /**
   * Enrich verification response with extension-specific data.
   * Only allowed to modify extensions[key] field, preserving all core fields.
   *
   * @param declaration - Extension declaration from route config
   * @param context - Verification result context containing payment payload, requirements, and result
   * @returns Enriched verification response
   */
  enrichVerificationResponse?: (
    declaration: unknown,
    context: VerifyResultContext,
  ) => Promise<VerifyResponse>;
  /**
   * Enrich settlement response with extension-specific data.
   * Only allowed to modify extensions[key] field, preserving all core fields.
   *
   * @param declaration - Extension declaration from route config
   * @param context - Settlement result context containing payment payload, requirements, and result
   * @returns Enriched settlement response
   */
  enrichSettlementResponse?: (
    declaration: unknown,
    context: SettleResultContext,
  ) => Promise<SettleResponse>;
}
