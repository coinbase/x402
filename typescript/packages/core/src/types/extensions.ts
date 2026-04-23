import type { VerifyResponse, SettleResponse } from "./facilitator";
import type {
  PaymentRequiredContext,
  SettleResultContext,
  VerifyContext,
  VerifyResultContext,
  VerifyFailureContext,
  SettleContext,
  SettleFailureContext,
} from "../server/x402ResourceServer";

export type {
  PaymentRequiredContext,
  SettleResultContext,
  VerifyContext,
  VerifyResultContext,
  VerifyFailureContext,
  SettleContext,
  SettleFailureContext,
};

export interface FacilitatorExtension {
  key: string;
}

export interface ResourceServerExtensionHooks {
  onBeforeVerify?: (
    declaration: unknown,
    context: VerifyContext,
  ) => Promise<void | { abort: true; reason: string; message?: string }>;
  onAfterVerify?: (declaration: unknown, context: VerifyResultContext) => Promise<void>;
  onVerifyFailure?: (
    declaration: unknown,
    context: VerifyFailureContext,
  ) => Promise<void | { recovered: true; result: VerifyResponse }>;
  onBeforeSettle?: (
    declaration: unknown,
    context: SettleContext,
  ) => Promise<void | { abort: true; reason: string; message?: string }>;
  onAfterSettle?: (declaration: unknown, context: SettleResultContext) => Promise<void>;
  onSettleFailure?: (
    declaration: unknown,
    context: SettleFailureContext,
  ) => Promise<void | { recovered: true; result: SettleResponse }>;
}

export interface ResourceServerExtension {
  key: string;
  enrichDeclaration?: (declaration: unknown, transportContext: unknown) => unknown;
  /** Return value merges into `extensions[key]`; may mutate `context.paymentRequiredResponse.accepts` entries. */
  enrichPaymentRequiredResponse?: (
    declaration: unknown,
    context: PaymentRequiredContext,
  ) => Promise<unknown>;
  enrichSettlementResponse?: (
    declaration: unknown,
    context: SettleResultContext,
  ) => Promise<unknown>;
  /** Installed on `registerExtension`; runs only when `declaredExtensions[key]` is defined. */
  hooks?: ResourceServerExtensionHooks;
}
