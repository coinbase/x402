/**
 * @x402/kaspa — x402 payment protocol support for Kaspa.
 *
 * Kaspa is a UTXO-based blockchain with Schnorr signatures and
 * 10 BPS (blocks per second) throughput. This package implements
 * the x402 payment protocol for native KAS payments.
 *
 * Architecture:
 *   Client:      Constructs and signs a Kaspa UTXO transaction
 *   Facilitator: Verifies the transaction and broadcasts it
 *   Server:      Parses prices (KAS → sompi) and builds requirements
 *
 * Usage:
 *
 *   // Client
 *   import { ExactKaspaScheme } from "@x402/kaspa/client";
 *   const client = new ExactKaspaScheme(signer);
 *   const payload = await client.createPaymentPayload(1, requirements);
 *
 *   // Facilitator
 *   import { ExactKaspaScheme } from "@x402/kaspa/facilitator";
 *   const facilitator = new ExactKaspaScheme(signer);
 *   const result = await facilitator.verify(payload, requirements);
 *   const settled = await facilitator.settle(payload, requirements);
 *
 *   // Server
 *   import { ExactKaspaScheme } from "@x402/kaspa/server";
 *   const server = new ExactKaspaScheme();
 *   const amount = await server.parsePrice(0.5, "kaspa:mainnet");
 */

// Types
export type {
  KaspaNetwork,
  KaspaAddress,
  TransactionId,
  UtxoEntry,
  TransactionOutput,
  ExactKaspaPayloadV2,
  ParsedTransaction,
  KaspaPaymentExtra,
} from "./types.js";

// Signer interfaces
export type { ClientKaspaSigner, FacilitatorKaspaSigner } from "./signer.js";

// Constants
export {
  SOMPI_PER_KAS,
  MIN_FEE_SOMPI,
  DEFAULT_CONFIRMATION_TIMEOUT_MS,
  KASPA_CAIP_FAMILY,
  KASPA_NETWORKS,
  KAS_NATIVE_ASSET,
  COVENANT_ID_REGEX,
  isCovenantAsset,
  validateAsset,
} from "./constants.js";

// Scheme implementations
export { ExactKaspaScheme as ExactKaspaClientScheme } from "./exact/client/scheme.js";
export { ExactKaspaScheme as ExactKaspaFacilitatorScheme } from "./exact/facilitator/scheme.js";
export { ExactKaspaScheme as ExactKaspaServerScheme } from "./exact/server/scheme.js";

// Utilities
export { addressToScriptPublicKey, decodeBech32Payload, bigIntToNumberReplacer } from "./utils.js";
export type { SerializedTransaction } from "./utils.js";

// UTXO selection utility
export { selectUtxos } from "./exact/client/scheme.js";

// Reference signer implementations (require kaspa-wasm peer dependency)
export { createKaspaClientSigner } from "./signers/client.js";
export type { KaspaClientSignerOptions } from "./signers/client.js";
export { createKaspaFacilitatorSigner } from "./signers/facilitator.js";
export type { KaspaFacilitatorSignerOptions } from "./signers/facilitator.js";
