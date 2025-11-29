// typescript/packages/x402/src/schemes/exact/btc_lightning/facilitator.ts

import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import { SCHEME } from "../../exact";
import { ExactBtcLightningPayload, LightningNetwork } from "./client";

/**
 * Networks supported by the `exact` BTC Lightning scheme.
 *
 * These must match the values defined in `types/network.ts`.
 */
const LIGHTNING_NETWORKS: LightningNetwork[] = ["btc-lightning-signet", "btc-lightning-mainnet"];

/**
 * Very lightweight structural check that a given string
 * *looks* like a BOLT11 invoice, without pulling in a full
 * Lightning/BOLT11 parsing library.
 *
 * NOTE: This is NOT a cryptographic or semantic validation.
 * Real validation is expected to happen in the Lightning backend
 * (LND, CLN, LNbits, etc.) during settlement.
 *
 * @param maybeInvoice - Candidate invoice string.
 * @returns `true` if it looks like a BOLT11 invoice, `false` otherwise.
 */
function looksLikeBolt11(maybeInvoice: string): boolean {
  if (typeof maybeInvoice !== "string") return false;
  if (maybeInvoice.length < 10) return false;
  const lower = maybeInvoice.toLowerCase();

  // Common human/bolt11 prefixes: lnbc (mainnet), lntb / lntbs / lntbs1 (test/signet),
  // lnjpy, lneuro, etc. We keep this deliberately permissive.
  if (!lower.startsWith("ln")) return false;

  // Very rough sanity check: base32 charset-ish
  return /^[0-9a-zA-Z]+$/.test(maybeInvoice.replace(/=/g, ""));
}

/**
 * Verifies a Lightning payment payload against the required payment details.
 *
 * For `exact` on BTC Lightning, verification is primarily:
 *  - x402-level checks (scheme + network + payload shape)
 *  - basic structural validation of the BOLT11 invoice string
 *
 * The *real* authoritative checks (invoice not expired, not already paid,
 * amount matching, etc.) are expected to happen inside the Lightning backend
 * (e.g. LND/CLN/LNbits) when the facilitator queries invoice status.
 *
 * @param _client - Placeholder to mirror the EVM verify signature; not used for Lightning.
 * @param paymentPayload - The Lightning payment payload containing the BOLT11 invoice.
 * @param paymentRequirements - The payment requirements that the payload must satisfy.
 * @returns A `VerifyResponse` describing whether the payload is structurally valid.
 */
export async function verify(
  _client: unknown,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Ensure we’re dealing with the `exact` scheme
  if (paymentPayload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
      // For Lightning we don’t have a clear on-chain payer address in the payload
      payer: "",
    };
  }

  // Ensure the network is one of our Lightning networks
  if (!LIGHTNING_NETWORKS.includes(paymentPayload.network as LightningNetwork)) {
    return {
      isValid: false,
      invalidReason: "invalid_network",
      payer: "",
    };
  }

  // Basic consistency: network in payload and requirements must match
  if (paymentPayload.network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: "invalid_network",
      payer: "",
    };
  }

  const lnPayload = paymentPayload.payload as unknown as ExactBtcLightningPayload;

  // Validate presence and shape of the BOLT11 invoice
  if (!lnPayload || typeof lnPayload.bolt11 !== "string") {
    return {
      isValid: false,
      invalidReason: "invalid_payload", // malformed Lightning payload
      payer: "",
    };
  }

  if (!looksLikeBolt11(lnPayload.bolt11)) {
    return {
      isValid: false,
      invalidReason: "invalid_payload", // invoice doesn’t look like BOLT11
      payer: "",
    };
  }

  // Optionally ensure the server actually asked to be paid *something*
  if (!paymentRequirements.maxAmountRequired) {
    return {
      isValid: false,
      invalidReason: "invalid_payment_requirements",
      payer: "",
    };
  }

  // NOTE:
  //  - We do NOT parse or enforce the BOLT11 expiry here.
  //  - A real implementation of the facilitator MUST:
  //      * Decode BOLT11
  //      * Check timestamp + expiry against current time
  //      * Optionally compare to paymentRequirements.maxTimeoutSeconds
  //    using the Lightning backend’s view of the invoice.
  //
  // At this level, we only assert that the payload is structurally sane
  // and that the scheme/network are correct.
  return {
    isValid: true,
    invalidReason: undefined,
    payer: "",
  };
}

/**
 * Settles a Lightning payment.
 *
 * Conceptually, settlement for BTC Lightning means:
 *  - The facilitator / merchant checks the status of the BOLT11 invoice
 *    in their Lightning backend (LND / CLN / LNbits / etc.)
 *  - If the invoice is settled for at least the required amount, settlement
 *    is considered successful.
 *
 * This function is intentionally backend-agnostic. It assumes that by the time
 * it’s called in a production deployment, an out-of-band Lightning node
 * has already received and processed the payment, and the facilitator can
 * verify invoice status before returning success.
 *
 * In this PoC:
 *  - We re-run `verify` for x402-level structure checks.
 *  - We *do not* call any specific Lightning backend.
 *  - We return a synthetic `transaction` identifier based on `invoiceId`
 *    (if present) or the BOLT11 invoice string.
 *
 * Integrators should replace the TODO section with real Lightning backend
 * calls (e.g. LNbits invoice lookup) and only return success when the
 * invoice is actually settled.
 *
 * @param _wallet - Placeholder to mirror the EVM settle signature; not used for Lightning.
 * @param paymentPayload - The Lightning payment payload containing the BOLT11 invoice.
 * @param paymentRequirements - The original payment details used to create the payload.
 * @returns A `SettleResponse` indicating success or failure from x402’s perspective.
 */
export async function settle(
  _wallet: unknown,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  const lnPayload = paymentPayload.payload as unknown as ExactBtcLightningPayload;

  // Re-verify structural + scheme/network sanity
  const verification = await verify(_wallet, paymentPayload, paymentRequirements);

  if (!verification.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: verification.invalidReason ?? "invalid_payload",
      payer: verification.payer,
    };
  }

  // TODO: REAL LIGHTNING INTEGRATION
  //
  // Here is where a production facilitator would:
  //  - Query the Lightning backend (e.g. LNbits / LND / CLN) for this invoice:
  //      * Using lnPayload.invoiceId if present, or
  //      * Using lnPayload.bolt11 as a lookup key
  //  - Check:
  //      * invoice.state == "SETTLED"
  //      * amount_received >= paymentRequirements.maxAmountRequired (sats)
  //      * invoice not expired / not cancelled
  //  - Map the Lightning payment hash or preimage to `transaction`
  //
  // For this PoC, we assume that if we’ve reached this point,
  // the invoice will either be settled out-of-band or the integrator
  // will extend this function to do the real check.

  const syntheticTxId = lnPayload.invoiceId ?? lnPayload.bolt11;

  return {
    success: true,
    transaction: syntheticTxId,
    network: paymentPayload.network,
    payer: verification.payer, // empty string for now; could later be node pubkey if desired
  };
}
