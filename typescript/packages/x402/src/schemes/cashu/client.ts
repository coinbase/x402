import { getEncodedToken } from "@cashu/cashu-ts";
import {
  CashuPaymentRequirements,
  CashuPaymentRequirementsSchema,
  CashuPayload,
  CashuPayloadSchema,
  CashuProof,
  CashuProofSchema,
  CashuTokenEntrySchema,
  PaymentPayload,
} from "../../types/verify";
import { encodePayment } from "../utils";

export type CashuProofInput = CashuProof;

export interface CashuTokenInput {
  mint: string;
  proofs: CashuProofInput[];
  memo?: string;
  unit?: string;
}

export interface CashuPaymentArgs {
  x402Version: number;
  paymentRequirements: CashuPaymentRequirements;
  tokens: CashuTokenInput[];
  memo?: string;
  payer?: string;
  expiry?: number;
  locks?: unknown;
}

function assertCashuRequirements(requirements: CashuPaymentRequirements): void {
  const result = CashuPaymentRequirementsSchema.safeParse(requirements);
  if (!result.success) {
    throw new Error(`Invalid Cashu payment requirements: ${result.error.message}`);
  }
  if (!requirements.extra?.mints?.length) {
    throw new Error("Cashu payment requirements must include extra.mints");
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

    if (proof.dleq) {
      normalized.dleq = proof.dleq;
    }
    if (proof.witness) {
      normalized.witness = proof.witness;
    }

    const result = CashuProofSchema.safeParse(normalized);
    if (!result.success) {
      throw new Error(`Invalid Cashu proof: ${result.error.message}`);
    }

    return result.data;
  });
}

function normalizeToken(
  token: CashuTokenInput,
  requirements: CashuPaymentRequirements,
): CashuPayload["tokens"][number] {
  if (!requirements.extra.mints.includes(token.mint)) {
    throw new Error(`Cashu mint ${token.mint} is not accepted by the payment requirements`);
  }

  const normalizedProofs = normalizeProofs(token.proofs);
  const normalizedToken: CashuPayload["tokens"][number] = {
    mint: token.mint,
    proofs: normalizedProofs,
  };

  if (token.memo) {
    normalizedToken.memo = token.memo;
  }
  if (token.unit) {
    normalizedToken.unit = token.unit;
  }

  const parsedToken = CashuTokenEntrySchema.safeParse(normalizedToken);
  if (!parsedToken.success) {
    throw new Error(`Invalid Cashu token: ${parsedToken.error.message}`);
  }

  return parsedToken.data;
}

function buildPayload(args: CashuPaymentArgs): CashuPayload {
  const { paymentRequirements, tokens, memo, payer, expiry, locks } = args;

  if (!tokens.length) {
    throw new Error("Cashu payment requires at least one token");
  }

  const normalizedTokens = tokens.map(token => normalizeToken(token, paymentRequirements));
  const encodedTokens = normalizedTokens.map(token =>
    getEncodedToken({
      mint: token.mint,
      proofs: token.proofs.map(proof => ({
        ...proof,
        ...(proof.dleq ? { dleq: { ...proof.dleq } } : {}),
        ...(proof.witness
          ? {
              witness: typeof proof.witness === "string"
                ? proof.witness
                : JSON.parse(JSON.stringify(proof.witness)),
            }
          : {}),
      })),
      memo: token.memo,
      unit: token.unit ?? paymentRequirements.extra.unit,
    }),
  );

  const payload: CashuPayload = {
    tokens: normalizedTokens,
    encoded: encodedTokens,
  };

  if (memo) {
    payload.memo = memo;
  }
  if (paymentRequirements.extra.unit) {
    payload.unit = paymentRequirements.extra.unit;
  } else if (normalizedTokens[0]?.unit) {
    payload.unit = normalizedTokens[0].unit;
  }
  if (locks ?? paymentRequirements.extra.nut10) {
    payload.locks = locks ?? paymentRequirements.extra.nut10;
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

  const totalAmount = payload.tokens.reduce((sum, token) => {
    return sum + token.proofs.reduce((tokenSum, proof) => tokenSum + proof.amount, 0);
  }, 0);
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
