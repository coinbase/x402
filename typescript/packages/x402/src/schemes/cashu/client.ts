import {
  CashuPaymentRequirements,
  CashuPaymentRequirementsSchema,
  CashuPayload,
  CashuPayloadSchema,
  CashuProof,
  CashuProofSchema,
  PaymentPayload,
} from "../../types/verify";
import { encodePayment } from "../utils";

export type CashuProofInput = CashuProof;

export interface CashuPaymentArgs {
  x402Version: number;
  paymentRequirements: CashuPaymentRequirements;
  proofs: CashuProofInput[];
  memo?: string;
  keysetId?: string;
  payer?: string;
  expiry?: number;
}

function assertCashuRequirements(requirements: CashuPaymentRequirements): void {
  const result = CashuPaymentRequirementsSchema.safeParse(requirements);
  if (!result.success) {
    throw new Error(`Invalid Cashu payment requirements: ${result.error.message}`);
  }
  if (!requirements.extra?.mintUrl) {
    throw new Error("Cashu payment requirements must include extra.mintUrl");
  }
}

function normalizeProofs(proofs: CashuProofInput[]): CashuProof[] {
  return proofs.map(proof => {
    const normalized: CashuProof = {
      amount: Number(proof.amount),
      secret: proof.secret,
      C: proof.C,
      id: proof.id,
    };

    const result = CashuProofSchema.safeParse(normalized);
    if (!result.success) {
      throw new Error(`Invalid Cashu proof: ${result.error.message}`);
    }

    return normalized;
  });
}

function buildPayload(args: CashuPaymentArgs): CashuPayload {
  const { paymentRequirements, proofs, memo, keysetId, payer, expiry } = args;
  const normalizedProofs = normalizeProofs(proofs);
  const payload: CashuPayload = {
    mint: paymentRequirements.extra.mintUrl,
    proofs: normalizedProofs,
  };

  if (memo) {
    payload.memo = memo;
  }
  if (keysetId ?? paymentRequirements.extra?.keysetId) {
    payload.keysetId = keysetId ?? paymentRequirements.extra?.keysetId;
  }
  if (payer) {
    payload.payer = payer;
  }
  if (expiry) {
    payload.expiry = expiry;
  }

  const parsed = CashuPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid Cashu payload: ${parsed.error.message}`);
  }

  return parsed.data;
}

export function createPaymentPayload(args: CashuPaymentArgs): PaymentPayload {
  const { x402Version, paymentRequirements } = args;

  assertCashuRequirements(paymentRequirements);
  const payload = buildPayload(args);

  const totalAmount = payload.proofs.reduce((sum, proof) => sum + proof.amount, 0);
  const required = Number(paymentRequirements.maxAmountRequired);

  if (Number.isNaN(required)) {
    throw new Error("Cashu payment requirements amount must be numeric");
  }

  if (totalAmount < required) {
    throw new Error("Insufficient Cashu proof value to satisfy payment requirements");
  }

  return {
    x402Version,
    scheme: "cashu-token",
    network: paymentRequirements.network,
    payload,
  };
}

export function createPaymentHeader(args: CashuPaymentArgs): string {
  const payment = createPaymentPayload(args);
  return encodePayment(payment);
}
