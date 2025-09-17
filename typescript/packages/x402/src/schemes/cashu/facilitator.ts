import { createHash } from "crypto";
import {
  CashuPaymentRequirements,
  CashuPaymentRequirementsSchema,
  CashuPayload,
  CashuPayloadSchema,
  PaymentPayload,
  VerifyResponse,
  SettleResponse,
} from "../../types/verify";

function parseRequirements(requirements: CashuPaymentRequirements): CashuPaymentRequirements {
  const parsed = CashuPaymentRequirementsSchema.safeParse(requirements);
  if (!parsed.success) {
    throw new Error(`Invalid Cashu payment requirements: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parsePayload(payload: PaymentPayload): CashuPayload {
  if (payload.scheme !== "cashu-token") {
    throw new Error("Attempted to parse non-Cashu payload in Cashu facilitator");
  }

  const parsed = CashuPayloadSchema.safeParse(payload.payload);
  if (!parsed.success) {
    throw new Error(`Invalid Cashu payload: ${parsed.error.message}`);
  }
  return parsed.data;
}

function ensureAmountCoverage(
  cashuPayload: CashuPayload,
  requirements: CashuPaymentRequirements,
): void {
  const total = cashuPayload.proofs.reduce((sum, proof) => sum + proof.amount, 0);
  const required = Number(requirements.maxAmountRequired);

  if (Number.isNaN(required)) {
    throw new Error("Cashu payment requirements amount must be numeric");
  }

  if (total < required) {
    const err = new Error("Insufficient Cashu proof value to satisfy payment requirements");
    err.name = "invalid_cashu_payload_amount_mismatch";
    throw err;
  }
}

function ensureMintAlignment(
  cashuPayload: CashuPayload,
  requirements: CashuPaymentRequirements,
): void {
  if (cashuPayload.mint !== requirements.extra.mintUrl) {
    const err = new Error("Cashu payload mint does not match payment requirements");
    err.name = "invalid_cashu_payment_requirements_extra";
    throw err;
  }
}

export async function verify(
  _client: unknown,
  payload: PaymentPayload,
  paymentRequirements: CashuPaymentRequirements,
): Promise<VerifyResponse> {
  try {
    const requirements = parseRequirements(paymentRequirements);
    const cashuPayload = parsePayload(payload);

    ensureMintAlignment(cashuPayload, requirements);
    ensureAmountCoverage(cashuPayload, requirements);

    return {
      isValid: true,
      payer: cashuPayload.payer,
    };
  } catch (error) {
    const err = error as Error;
    const invalidReason = (err.name as VerifyResponse["invalidReason"]) ?? "invalid_payload";
    return {
      isValid: false,
      invalidReason,
    };
  }
}

export async function settle(
  _client: unknown,
  payload: PaymentPayload,
  paymentRequirements: CashuPaymentRequirements,
): Promise<SettleResponse> {
  const verifyResponse = await verify(_client, payload, paymentRequirements);

  if (!verifyResponse.isValid) {
    return {
      success: false,
      errorReason: verifyResponse.invalidReason,
      transaction: "",
      network: paymentRequirements.network,
      payer: verifyResponse.payer,
    };
  }

  const cashuPayload = parsePayload(payload);
  const transactionHash = createHash("sha256")
    .update(JSON.stringify(cashuPayload.proofs))
    .digest("hex");

  return {
    success: true,
    transaction: `cashu:${transactionHash}`,
    network: paymentRequirements.network,
    payer: cashuPayload.payer,
  };
}
