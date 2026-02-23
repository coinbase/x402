/**
 * @module @x402/xrp - x402 Payment Protocol XRP Implementation
 *
 * This module provides the XRP (Ripple Ledger) specific implementation
 * of the x402 payment protocol using native Payment transactions.
 *
 * @example
 * ```typescript
 * import { createXrpClient } from "@x402/xrp/exact/client";
 * import { Wallet } from "xrpl";
 *
 * const wallet = Wallet.fromSeed("sn3nxiW7v8KXzPzAqzwHXhSSKNyN");
 * const client = createXrpClient({ signer: toClientXrpSigner(wallet) });
 * ```
 */

// Exact scheme implementations
export { ExactXrpScheme as ExactXrpClientScheme } from "./exact/client/scheme";
export { ExactXrpScheme as ExactXrpServerScheme } from "./exact/server/scheme";
export { ExactXrpScheme as ExactXrpFacilitatorScheme } from "./exact/facilitator/scheme";

// Convenience builders
export { createXrpClient } from "./exact/client";
export { createXrpServer } from "./exact/server";
export { createXrpFacilitator } from "./exact/facilitator";

// Signers
export {
  toClientXrpSigner,
  toFacilitatorXrpSigner,
  FacilitatorXrpClient,
  type FacilitatorXrpClientConfig,
} from "./signer";
export type { ClientXrpSigner, FacilitatorXrpSigner } from "./types";

// Types
export type {
  ExactXrpPayloadV1,
  ExactXrpPayloadV2,
  XrpPaymentTransaction,
  XrpMemo,
  XrpNetwork,
  XrpPaymentExtra,
} from "./types";
export { isXrpPayload, type XrpVerifyContext, type XrpSettleContext } from "./types";

// Utilities
export * from "./utils";

// Re-export xrpl utilities that are commonly needed
export { dropsToXrp, xrpToDrops, isValidAddress, xAddressToClassicAddress } from "xrpl";
