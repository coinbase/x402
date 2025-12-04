import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from "x402/types";

const LIGHTNING_NETWORKS = ["btc-lightning-signet", "btc-lightning-mainnet"] as const;
export type LightningNetwork = (typeof LIGHTNING_NETWORKS)[number];

/**
 * Checks if a given network string is one of the supported Lightning networks.
 *
 * @param network - Network identifier to check.
 * @returns True if the network is a supported Lightning network; otherwise false.
 */
export function isLightningNetwork(network: string): network is LightningNetwork {
  return (LIGHTNING_NETWORKS as readonly string[]).includes(network);
}

interface LndConfig {
  restUrl: string;
  macaroonHex: string;
  expectedNetwork: LightningNetwork;
}

/**
 * Loads and validates the LND configuration from environment variables.
 *
 * @returns An object containing the LND REST URL, macaroon hex, and expected Lightning network.
 * @throws Error if any required environment variable is missing or invalid.
 */
function getLndConfigFromEnv(): LndConfig {
  const restUrl = process.env.LND_REST_URL;
  const macaroonHex = process.env.LND_MACAROON_HEX;
  const expectedNetwork = process.env.LIGHTNING_NETWORK as LightningNetwork | undefined;

  if (!restUrl || !macaroonHex || !expectedNetwork) {
    throw new Error("Missing LND_REST_URL, LND_MACAROON_HEX, or LIGHTNING_NETWORK env vars");
  }

  if (!isLightningNetwork(expectedNetwork)) {
    throw new Error(`Unsupported Lightning network in env: ${expectedNetwork}`);
  }

  return { restUrl, macaroonHex, expectedNetwork };
}

interface LndDecodedInvoice {
  payment_hash: string;
  num_satoshis: string;
  timestamp: string;
  expiry: string;
  description?: string;
  network?: string;
}

interface LndInvoiceStatus {
  r_hash: string;
  payment_hash: string;
  settled: boolean;
  state?: string; // e.g. "SETTLED"
  amt_paid_sat: string;
}

/**
 * Decodes a BOLT11 invoice using LND's REST API.
 *
 * The invoice string is passed as part of the request path and treated as a query parameter
 * to LND's `decodepayreq` endpoint.
 *
 * @param bolt11 - The BOLT11 invoice string to decode.
 * @returns A promise that resolves to the decoded invoice information from LND.
 * @throws Error if the LND call fails or returns a non-OK HTTP status code.
 */
async function lndDecodePayReq(bolt11: string): Promise<LndDecodedInvoice> {
  const { restUrl, macaroonHex } = getLndConfigFromEnv();

  const res = await fetch(`${restUrl.replace(/\/$/, "")}/v1/payreq/${encodeURIComponent(bolt11)}`, {
    method: "GET",
    headers: {
      "Grpc-Metadata-macaroon": macaroonHex,
    },
  });

  if (!res.ok) {
    throw new Error(`LND decodepayreq failed with status ${res.status}`);
  }

  const decoded = (await res.json()) as LndDecodedInvoice;
  return decoded;
}

/**
 * Looks up the status of a Lightning invoice by its payment hash using LND's REST API.
 *
 * @param paymentHash - The payment hash of the invoice to look up.
 * @returns A promise that resolves to the invoice status object returned by LND.
 * @throws Error if the LND call fails or returns a non-OK HTTP status code.
 */
async function lndLookupInvoice(paymentHash: string): Promise<LndInvoiceStatus> {
  const { restUrl, macaroonHex } = getLndConfigFromEnv();

  const res = await fetch(
    `${restUrl.replace(/\/$/, "")}/v1/invoice/${encodeURIComponent(paymentHash)}`,
    {
      method: "GET",
      headers: {
        "Grpc-Metadata-macaroon": macaroonHex,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`LND lookupinvoice failed with status ${res.status}`);
  }

  const invoice = (await res.json()) as LndInvoiceStatus;
  return invoice;
}

/**
 * Performs a lightweight structural check that a value looks like a BOLT11 invoice.
 *
 * This does not replace semantic validation and is only a first-pass filter.
 *
 * @param maybeInvoice - Candidate BOLT11 invoice string.
 * @returns True if the value has a plausible BOLT11 shape; otherwise false.
 */
function looksLikeBolt11(maybeInvoice: string): boolean {
  if (typeof maybeInvoice !== "string") return false;
  if (maybeInvoice.length < 10) return false;

  const lower = maybeInvoice.toLowerCase();
  if (!lower.startsWith("ln")) return false;

  return /^[0-9a-zA-Z]+$/.test(maybeInvoice.replace(/=/g, ""));
}

/**
 * Verifies that a Lightning payment payload is structurally valid and consistent
 * with the payment requirements by using LND to decode the invoice.
 *
 * Error codes are restricted to the allowed ErrorReasons union:
 * - "invalid_network"
 * - "unsupported_scheme"
 * - "invalid_payload"
 * - "invalid_payment_requirements"
 * - "invalid_payment"
 * - "payment_expired"
 * - "unexpected_verify_error"
 *
 * @param paymentPayload - The decoded PaymentPayload from the X-PAYMENT header.
 * @param paymentRequirements - The PaymentRequirements object for the requested resource.
 * @returns A promise that resolves to a VerifyResponse indicating whether the payload is valid.
 */
export async function verifyLightningWithLnd(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  try {
    if (!isLightningNetwork(paymentPayload.network)) {
      return {
        isValid: false,
        invalidReason: "invalid_network",
        payer: "",
      };
    }

    if (paymentPayload.network !== paymentRequirements.network) {
      return {
        isValid: false,
        invalidReason: "invalid_network",
        payer: "",
      };
    }

    if (paymentRequirements.scheme !== "exact" || paymentPayload.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: "",
      };
    }

    const lnPayload = paymentPayload.payload as { bolt11?: string; invoiceId?: string };

    if (!lnPayload || typeof lnPayload.bolt11 !== "string") {
      return {
        isValid: false,
        invalidReason: "invalid_payload",
        payer: "",
      };
    }

    if (!looksLikeBolt11(lnPayload.bolt11)) {
      return {
        isValid: false,
        invalidReason: "invalid_payload",
        payer: "",
      };
    }

    if (!paymentRequirements.maxAmountRequired) {
      return {
        isValid: false,
        invalidReason: "invalid_payment_requirements",
        payer: "",
      };
    }

    const requiredSats = BigInt(paymentRequirements.maxAmountRequired);

    const decoded = await lndDecodePayReq(lnPayload.bolt11);
    const invoiceSats = BigInt(decoded.num_satoshis || "0");

    if (invoiceSats !== requiredSats) {
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: "",
      };
    }

    const createdAt = BigInt(decoded.timestamp || "0");
    const expiry = BigInt(decoded.expiry || "0");
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

    if (createdAt > 0n && expiry > 0n && nowSeconds > createdAt + expiry) {
      return {
        isValid: false,
        invalidReason: "payment_expired",
        payer: "",
      };
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer: "",
    };
  } catch {
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
      payer: "",
    };
  }
}

/**
 * Settles a Lightning payment by querying LND for the invoice status.
 *
 * It assumes verifyLightningWithLnd has already checked structural validity and
 * amount correctness. This function:
 * - Confirms the invoice is fully settled.
 * - Confirms the amount paid is at least maxAmountRequired.
 *
 * Error codes are restricted to the allowed ErrorReasons union:
 * - "invalid_network"
 * - "unsupported_scheme"
 * - "invalid_payload"
 * - "invalid_payment_requirements"
 * - "invalid_payment"
 * - "payment_expired"
 * - "insufficient_funds"
 * - "invalid_transaction_state"
 * - "unexpected_settle_error"
 *
 * @param paymentPayload - The decoded PaymentPayload from the X-PAYMENT header.
 * @param paymentRequirements - The PaymentRequirements object for the requested resource.
 * @returns A promise that resolves to a SettleResponse indicating whether the invoice is settled.
 */
export async function settleLightningWithLnd(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  try {
    const verification = await verifyLightningWithLnd(paymentPayload, paymentRequirements);

    if (!verification.isValid) {
      return {
        success: false,
        network: paymentPayload.network,
        transaction: "",
        errorReason: verification.invalidReason ?? "invalid_payment",
        payer: verification.payer,
      };
    }

    const lnPayload = paymentPayload.payload as { bolt11?: string; invoiceId?: string };

    if (!lnPayload?.bolt11) {
      return {
        success: false,
        network: paymentPayload.network,
        transaction: "",
        errorReason: "invalid_payload",
        payer: verification.payer,
      };
    }

    const decoded = await lndDecodePayReq(lnPayload.bolt11);
    const invoice = await lndLookupInvoice(decoded.payment_hash);

    const requiredSats = BigInt(paymentRequirements.maxAmountRequired);
    const paidSats = BigInt(invoice.amt_paid_sat || "0");
    const isSettled =
      invoice.settled === true || (invoice.state && invoice.state.toUpperCase() === "SETTLED");

    if (!isSettled) {
      return {
        success: false,
        network: paymentPayload.network,
        transaction: invoice.payment_hash,
        errorReason: "invalid_transaction_state",
        payer: verification.payer,
      };
    }

    if (paidSats < requiredSats) {
      return {
        success: false,
        network: paymentPayload.network,
        transaction: invoice.payment_hash,
        errorReason: "insufficient_funds",
        payer: verification.payer,
      };
    }

    return {
      success: true,
      network: paymentPayload.network,
      transaction: invoice.payment_hash,
      errorReason: undefined,
      payer: verification.payer,
    };
  } catch {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: "unexpected_settle_error",
      payer: "",
    };
  }
}
