import { PaymentPayload, PaymentRequirements } from "../../../types/verify";

/**
 * Networks supported by the `exact` BTC Lightning scheme.
 *
 * These correspond to the x402 Network identifiers defined in `shared/network.ts`.
 */
export const LIGHTNING_NETWORKS = ["btc-lightning-signet", "btc-lightning-mainnet"] as const;

export type LightningNetwork = (typeof LIGHTNING_NETWORKS)[number];

/**
 * Type guard to check whether a given network string is one of the supported
 * BTC Lightning networks for the `exact` scheme.
 *
 * This narrows the type of `network` to {@link LightningNetwork} when it
 * returns `true`, which is useful when routing on `(scheme, network)` pairs.
 *
 * @param network - The network identifier to check (e.g. `"btc-lightning-signet"`).
 * @returns `true` if the network is a supported Lightning network, otherwise `false`.
 */
export function isLightningNetwork(network: string): network is LightningNetwork {
  return (LIGHTNING_NETWORKS as readonly string[]).includes(network);
}

/**
 * Payload shape for the `exact` BTC Lightning scheme.
 *
 * This is deliberately backend-agnostic:
 *  - `bolt11` is the canonical Lightning invoice string.
 *  - `invoiceId` is optional and can be used to carry an internal ID
 *    (e.g. LNbits payment hash / DB primary key) to simplify lookups.
 */
export interface ExactBtcLightningPayload {
  /**
   * BOLT11 Lightning invoice string.
   */
  bolt11: string;

  /**
   * Optional internal identifier for the invoice on the facilitator side.
   *
   * This is NOT required by x402 and is not interpreted by the core
   * protocol; it is simply passed through to the facilitator for
   * correlation and easier lookups.
   */
  invoiceId?: string;
}

/**
 * Prepares a Lightning `PaymentPayload` from a BOLT11 invoice.
 *
 * Unlike the EVM flow, there is no extra “unsigned” form here; the
 * Lightning payload is already complete once we have a valid invoice.
 *
 * @param bolt11 - The BOLT11 Lightning invoice string representing the payment request.
 * @param x402Version - The x402 protocol version to use (e.g. 1).
 * @param paymentRequirements - The server-provided payment requirements for this resource.
 * @param invoiceId - Optional internal invoice identifier for the facilitator backend.
 * @returns A fully-formed `PaymentPayload` suitable for encoding into an X-PAYMENT header.
 * @throws If the invoice string is invalid, the scheme is not `"exact"`,
 *         or the network is not one of the supported Lightning networks.
 */
export function preparePaymentHeader(
  bolt11: string,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  invoiceId?: string,
): PaymentPayload {
  if (!bolt11 || typeof bolt11 !== "string") {
    throw new Error("bolt11 invoice string is required");
  }

  if (paymentRequirements.scheme !== "exact") {
    throw new Error(
      `btc_lightning client only supports scheme "exact", got "${paymentRequirements.scheme}"`,
    );
  }

  if (!LIGHTNING_NETWORKS.includes(paymentRequirements.network as LightningNetwork)) {
    throw new Error(
      `btc_lightning client only supports Lightning networks (${LIGHTNING_NETWORKS.join(
        ", ",
      )}), got "${paymentRequirements.network}"`,
    );
  }

  const lightningPayload: ExactBtcLightningPayload = {
    bolt11,
    ...(invoiceId ? { invoiceId } : {}),
  };

  const paymentPayload: PaymentPayload = {
    x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: lightningPayload,
  };

  return paymentPayload;
}

/**
 * "Signs" a Lightning payment header.
 *
 * For BTC Lightning, there is no additional client-side cryptographic
 * signature over the payload. The authorization and trust model is:
 *
 *  - The facilitator / merchant controls an LN backend (LND, CLN, LNbits, …).
 *  - The client pays the BOLT11 invoice with their Lightning wallet.
 *  - The facilitator verifies invoice status with the LN backend.
 *
 * This function exists primarily to mirror the EVM flow shape; it simply
 * returns the prepared payload unchanged.
 *
 * @param _client - Placeholder for compatibility with the EVM API; not used.
 * @param _paymentRequirements - Payment requirements; currently unused here but
 *                               kept for future flexibility.
 * @param paymentPayload - The Lightning payment payload created by {@link preparePaymentHeader}.
 * @returns The same payload, as a `PaymentPayload`.
 */
export async function signPaymentHeader(
  // kept for symmetry with EVM; currently unused
  _client: unknown,
  _paymentRequirements: PaymentRequirements,
  paymentPayload: PaymentPayload,
): Promise<PaymentPayload> {
  return paymentPayload;
}

/**
 * Creates a complete Lightning payment payload from a BOLT11 invoice.
 *
 * This mirrors the EVM `createPayment` helper conceptually, but is much
 * simpler: there is no `from` address and no EIP-3009 signature, only the
 * invoice string and optional invoiceId.
 *
 * @param _client - Placeholder for compatibility with the EVM API; not used.
 * @param x402Version - The x402 protocol version to use (e.g. 1).
 * @param paymentRequirements - The server-provided payment requirements for this resource.
 * @param bolt11 - The BOLT11 Lightning invoice string.
 * @param invoiceId - Optional internal invoice identifier for the facilitator backend.
 * @returns A fully formed `PaymentPayload` that can be encoded into the X-PAYMENT header.
 */
export async function createPayment(
  // kept for signature compatibility; currently unused
  _client: unknown,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  bolt11: string,
  invoiceId?: string,
): Promise<PaymentPayload> {
  const prepared = preparePaymentHeader(bolt11, x402Version, paymentRequirements, invoiceId);
  return signPaymentHeader(_client, paymentRequirements, prepared);
}

/**
 * Creates and encodes a Lightning payment header for use as an `X-PAYMENT` header.
 *
 * The result of this function is intended to be set directly as:
 *
 *   X-PAYMENT: <base64-json>
 *
 * where the base64 decodes to a `PaymentPayload` JSON object.
 *
 * NOTE:
 *  - For EVM, encoding is done by a shared `encodePayment` helper under
 *    `evm/utils/paymentUtils.ts`.
 *  - To keep this Lightning client backend-agnostic and free of EVM deps,
 *    we encode explicitly via `Buffer.from(JSON.stringify(payload), "utf8")`.
 *
 * If you later move `encodePayment` into a shared, non-EVM-specific module,
 * you can swap the body to call that instead.
 *
 * @param _client - Placeholder for compatibility with the EVM API; not used.
 * @param x402Version - The x402 protocol version to use (e.g. 1).
 * @param paymentRequirements - The server-provided payment requirements for this resource.
 * @param bolt11 - The BOLT11 Lightning invoice string.
 * @param invoiceId - Optional internal invoice identifier for the facilitator backend.
 * @returns A base64-encoded JSON string representing the `PaymentPayload`.
 */
export async function createPaymentHeader(
  // kept for signature compatibility; currently unused
  _client: unknown,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  bolt11: string,
  invoiceId?: string,
): Promise<string> {
  const payment = await createPayment(_client, x402Version, paymentRequirements, bolt11, invoiceId);

  // TODO (future): consider switching to shared base64 helpers for
  // browser/edge compatibility instead of relying on Node's Buffer.
  return Buffer.from(JSON.stringify(payment), "utf8").toString("base64");
}
