/**
 * Sign-In-With-X Extension for x402 v2
 *
 * CAIP-122 compliant wallet authentication for payment-protected resources.
 * Allows clients to prove control of a wallet that may have previously paid
 * for a resource, enabling servers to grant access without requiring repurchase.
 *
 * ## Server Usage (auth-only)
 *
 * ```typescript
 * import { declareSIWxExtension, verifySIWxHeader } from '@x402/extensions/sign-in-with-x';
 *
 * // Declare challenge (nonce/issuedAt generated automatically)
 * const extensions = declareSIWxExtension({
 *   domain: 'api.example.com',
 *   resourceUri: 'https://api.example.com/data',
 *   network: 'eip155:8453',
 * });
 *
 * // Verify incoming proof (parse + validate + verify in one call)
 * const result = await verifySIWxHeader(header, 'https://api.example.com/data');
 * if (result.valid) {
 *   // result.address is the verified wallet
 * }
 * ```
 *
 * ## Client Usage
 *
 * ```typescript
 * import { signSIWxChallenge } from '@x402/extensions/sign-in-with-x';
 *
 * // Get extension from 402 response, sign it, send header
 * const ext = body.extensions['sign-in-with-x'];
 * const header = await signSIWxChallenge(ext, wallet);
 * fetch(url, { headers: { 'sign-in-with-x': header } });
 * ```
 *
 * @module sign-in-with-x
 */

// Constants
export { SIGN_IN_WITH_X, SIWxPayloadSchema } from "./types";
export { SOLANA_MAINNET, SOLANA_DEVNET, SOLANA_TESTNET } from "./solana";

// Types
export type {
  SIWxExtension,
  SIWxExtensionInfo,
  SIWxExtensionSchema,
  SIWxPayload,
  DeclareSIWxOptions,
  SignatureScheme,
  SignatureType,
  SIWxValidationResult,
  SIWxValidationOptions,
  SIWxVerifyResult,
  EVMMessageVerifier,
  SIWxVerifyOptions,
  SupportedChain,
} from "./types";
export type { CompleteSIWxInfo } from "./client";

// Server
export { declareSIWxExtension } from "./declare";
export { siwxResourceServerExtension } from "./server";
export { parseSIWxHeader } from "./parse";
export { validateSIWxMessage } from "./validate";
export { verifySIWxSignature } from "./verify";
export { buildSIWxSchema } from "./schema";

// Client
export { createSIWxMessage } from "./message";
export { createSIWxPayload, signSIWxChallenge } from "./client";
export { encodeSIWxHeader } from "./encode";
export { wrapFetchWithSIWx } from "./fetch";
export {
  getEVMAddress,
  getSolanaAddress,
  signEVMMessage,
  signSolanaMessage,
  type SIWxSigner,
  type EVMSigner,
  type SolanaSigner,
} from "./sign";

// Chain utilities - EVM
export { formatSIWEMessage, verifyEVMSignature, extractEVMChainId, isEVMSigner } from "./evm";

// Chain utilities - Solana
export {
  formatSIWSMessage,
  verifySolanaSignature,
  decodeBase58,
  encodeBase58,
  extractSolanaChainReference,
  isSolanaSigner,
} from "./solana";

// Convenience
export { verifySIWxHeader } from "./header";

// Storage
export { type SIWxStorage, InMemorySIWxStorage } from "./storage";

// Hooks
export {
  createSIWxSettleHook,
  createSIWxRequestHook,
  createSIWxClientHook,
  type CreateSIWxHookOptions,
  type SIWxHookEvent,
} from "./hooks";
