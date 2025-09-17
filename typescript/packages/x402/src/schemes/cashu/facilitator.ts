import { createHash } from "crypto";
import { TextEncoder } from "util";
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import { hashToCurve } from "@cashu/cashu-ts/crypto/common";
import {
  CashuPaymentRequirements,
  CashuPaymentRequirementsSchema,
  CashuPayload,
  CashuPayloadSchema,
  PaymentPayload,
  SettleResponse,
  VerifyResponse,
} from "../../types/verify";

const encoder = new TextEncoder();

type CashuPayloadToken = CashuPayload["tokens"][number];

type TokenProof = CashuPayloadToken["proofs"][number];

type CashuTokenSet = {
  token: CashuPayloadToken;
  encoded: string;
};

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

function ensureEncodingConsistency(
  tokenSets: CashuTokenSet[],
  requirements: CashuPaymentRequirements,
  payload: CashuPayload,
): void {
  const defaultUnit = payload.unit ?? requirements.extra.unit;

  tokenSets.forEach(({ token, encoded }, index) => {
    const clonedProofs = token.proofs.map(cloneProofForEncoding);
    const recomputed = getEncodedToken({
      mint: token.mint,
      proofs: clonedProofs,
      memo: token.memo,
      unit: token.unit ?? defaultUnit,
    });

    if (recomputed !== encoded) {
      const err = new Error(`Encoded Cashu token mismatch at index ${index}`);
      err.name = "invalid_cashu_payload_proofs";
      throw err;
    }
  });
}

function ensureMintAlignment(tokenSets: CashuTokenSet[], requirements: CashuPaymentRequirements): void {
  const allowedMints = new Set(requirements.extra.mints);
  tokenSets.forEach(({ token }) => {
    if (!allowedMints.has(token.mint)) {
      const err = new Error(`Cashu mint ${token.mint} is not accepted by the payment requirements`);
      err.name = "invalid_cashu_payment_requirements_extra";
      throw err;
    }
  });
}

function ensureUnitAlignment(payload: CashuPayload, requirements: CashuPaymentRequirements): void {
  if (!requirements.extra.unit) {
    return;
  }

  const targetUnit = requirements.extra.unit;
  if (payload.unit && payload.unit !== targetUnit) {
    const err = new Error(`Cashu payload unit ${payload.unit} does not match required unit ${targetUnit}`);
    err.name = "invalid_cashu_payment_requirements_extra";
    throw err;
  }

  payload.tokens.forEach(token => {
    if (token.unit && token.unit !== targetUnit) {
      const err = new Error(
        `Cashu token unit ${token.unit} does not match required unit ${targetUnit}`,
      );
      err.name = "invalid_cashu_payment_requirements_extra";
      throw err;
    }
  });
}

function ensureLocks(payload: CashuPayload, requirements: CashuPaymentRequirements): void {
  const requiredLocks = requirements.extra.nut10;
  if (!requiredLocks) {
    return;
  }

  if (!payload.locks) {
    const err = new Error("Cashu payload missing required NUT-10 locks");
    err.name = "invalid_cashu_payload_proofs";
    throw err;
  }

  if (JSON.stringify(requiredLocks) !== JSON.stringify(payload.locks)) {
    const err = new Error("Cashu payload locks do not satisfy required NUT-10 constraints");
    err.name = "invalid_cashu_payload_proofs";
    throw err;
  }
}

function ensureKeysets(tokenSets: CashuTokenSet[], requirements: CashuPaymentRequirements): void {
  const allowedKeysets = requirements.extra.keysetIds;
  if (!allowedKeysets?.length) {
    return;
  }

  tokenSets.forEach(({ token }) => {
    token.proofs.forEach(proof => {
      const matches = allowedKeysets.some(keyset =>
        proof.id === keyset || proof.id.startsWith(keyset),
      );
      if (!matches) {
        const err = new Error(`Proof keyset ${proof.id} is not permitted by requirements`);
        err.name = "invalid_cashu_payment_requirements_extra";
        throw err;
      }
    });
  });
}

function ensureAmountCoverage(
  tokenSets: CashuTokenSet[],
  requirements: CashuPaymentRequirements,
): void {
  const total = tokenSets.reduce((sum, { token }) => {
    return (
      sum + token.proofs.reduce((tokenSum, proof) => tokenSum + Number(proof.amount), 0)
    );
  }, 0);

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

async function ensureTokensUnspent(tokenSets: CashuTokenSet[]): Promise<void> {
  await Promise.all(tokenSets.map(({ token }) => ensureProofsUnspent(token)));
}

async function ensureProofsUnspent(token: CashuPayloadToken): Promise<void> {
  if (!token.proofs.length) {
    const err = new Error("Cashu token contains no proofs");
    err.name = "invalid_cashu_payload_proofs";
    throw err;
  }

  const Ys = token.proofs.map(proof => hashToCurve(encoder.encode(proof.secret)).toHex(true));

  try {
    const { states } = await CashuMint.check(token.mint, { Ys });
    if (!Array.isArray(states) || states.length !== Ys.length) {
      const err = new Error("Mint returned an invalid response when checking proofs");
      err.name = "unexpected_verify_error";
      throw err;
    }

    const invalidState = states.find(state => state.state !== "UNSPENT");
    if (invalidState) {
      const err = new Error(`Proof ${invalidState.Y} is ${invalidState.state}`);
      err.name = "invalid_cashu_payload_proofs";
      throw err;
    }
  } catch (error) {
    if ((error as Error).name) {
      throw error;
    }
    const err = new Error(
      `Failed to verify proofs with mint ${token.mint}: ${(error as Error).message}`,
    );
    err.name = "unexpected_verify_error";
    throw err;
  }
}

function cloneProofForEncoding(proof: TokenProof): TokenProof {
  return {
    amount: Number(proof.amount),
    secret: proof.secret,
    C: proof.C,
    id: proof.id,
    ...(proof.dleq ? { dleq: { ...proof.dleq } } : {}),
    ...(proof.witness
      ? {
          witness:
            typeof proof.witness === "string"
              ? proof.witness
              : JSON.parse(JSON.stringify(proof.witness)),
        }
      : {}),
  } as TokenProof;
}

async function receiveTokens(
  tokenSets: CashuTokenSet[],
  requirements: CashuPaymentRequirements,
  payload: CashuPayload,
): Promise<void> {
  const defaultUnit = payload.unit ?? requirements.extra.unit ?? "sat";
  const perMint = new Map<string, { wallet: CashuWallet; encoded: string[] }>();

  tokenSets.forEach(({ token, encoded }) => {
    const existing = perMint.get(token.mint);
    if (existing) {
      existing.encoded.push(encoded);
      return;
    }

    const mint = new CashuMint(token.mint);
    const wallet = new CashuWallet(mint, {
      unit: token.unit ?? defaultUnit,
    });
    perMint.set(token.mint, { wallet, encoded: [encoded] });
  });

  for (const { wallet, encoded } of perMint.values()) {
    for (const token of encoded) {
      await wallet.receive(token);
    }
  }
}

function toTokenSets(payload: CashuPayload): CashuTokenSet[] {
  if (payload.tokens.length !== payload.encoded.length) {
    const err = new Error("Cashu payload tokens and encoded arrays differ in length");
    err.name = "invalid_cashu_payload_proofs";
    throw err;
  }

  return payload.tokens.map((token, index) => ({ token, encoded: payload.encoded[index] }));
}

function buildTransactionId(payload: CashuPayload): string {
  return createHash("sha256").update(JSON.stringify(payload.encoded)).digest("hex");
}

export async function verify(
  _client: unknown,
  payload: PaymentPayload,
  paymentRequirements: CashuPaymentRequirements,
): Promise<VerifyResponse> {
  try {
    const requirements = parseRequirements(paymentRequirements);
    const cashuPayload = parsePayload(payload);
    const tokenSets = toTokenSets(cashuPayload);

    ensureLocks(cashuPayload, requirements);
    ensureUnitAlignment(cashuPayload, requirements);
    ensureMintAlignment(tokenSets, requirements);
    ensureKeysets(tokenSets, requirements);
    ensureEncodingConsistency(tokenSets, requirements, cashuPayload);
    ensureAmountCoverage(tokenSets, requirements);
    await ensureTokensUnspent(tokenSets);

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

  const requirements = parseRequirements(paymentRequirements);
  const cashuPayload = parsePayload(payload);
  const tokenSets = toTokenSets(cashuPayload);

  try {
    await receiveTokens(tokenSets, requirements, cashuPayload);
    const transactionHash = buildTransactionId(cashuPayload);

    return {
      success: true,
      transaction: `cashu:${transactionHash}`,
      network: requirements.network,
      payer: cashuPayload.payer,
    };
  } catch (error) {
    return {
      success: false,
      errorReason: (error as Error).name || "unexpected_settle_error",
      transaction: "",
      network: requirements.network,
      payer: cashuPayload.payer ?? verifyResponse.payer,
    };
  }
}
