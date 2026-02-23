import { getBase64Encoder, type Address } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SOLANA_MAGIC_OK } from "../../constants";
import type { FacilitatorSvmSigner } from "../../signer";
import { createRpcClient } from "../../utils";

type SimulatedAccountInfo = {
  lamports?: number;
  data?: unknown;
};

type SimulateTransactionResult = {
  value: {
    err: unknown;
    logs?: string[] | null;
    returnData?: {
      programId: string;
      data: [string, string];
    } | null;
    accounts?: (SimulatedAccountInfo | null)[] | null;
  };
};

/**
 * Parse a bigint-like value from mixed runtime inputs (RPC responses, config, etc).
 *
 * @param value - Value to parse.
 * @returns Parsed bigint or null.
 */
function parseBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

/**
 * Extract token amount (smallest units) from a jsonParsed token account payload.
 *
 * @param data - The `value.data` field from a jsonParsed account response.
 * @returns Token amount as bigint, or null when unavailable.
 */
function parseTokenAmountFromParsedAccount(data: unknown): bigint | null {
  if (!data || typeof data !== "object") return null;

  const parsed = (data as { parsed?: unknown }).parsed;
  if (!parsed || typeof parsed !== "object") return null;

  const info = (parsed as { info?: unknown }).info;
  if (!info || typeof info !== "object") return null;

  const tokenAmount = (info as { tokenAmount?: unknown }).tokenAmount;
  if (!tokenAmount || typeof tokenAmount !== "object") return null;

  return parseBigInt((tokenAmount as { amount?: unknown }).amount);
}

/**
 * Count how many times a program was invoked in simulation logs.
 *
 * @param logs - Simulation log messages.
 * @param programId - Program id to count.
 * @returns Number of invocations found.
 */
function countProgramInvocations(logs: string[] | null | undefined, programId: string): number {
  if (!logs) return 0;
  const needle = `Program ${programId} invoke`;
  return logs.reduce((count, line) => (line.includes(needle) ? count + 1 : count), 0);
}

/**
 * Validate the simulation returnData matches the expected program and magic value.
 *
 * @param returnData - Simulation returnData object.
 * @param expectedProgramId - Program expected to set the returnData.
 * @returns The check result.
 */
function checkMagicOk(
  returnData: SimulateTransactionResult["value"]["returnData"] | null | undefined,
  expectedProgramId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!returnData) return { ok: false, reason: "missing_return_data" };
  if (returnData.programId !== expectedProgramId) {
    return { ok: false, reason: "return_data_program_mismatch" };
  }

  const [data, encoding] = returnData.data;
  if (encoding !== "base64") return { ok: false, reason: "return_data_encoding_not_base64" };

  const decoded = getBase64Encoder().encode(data);
  const expected = new TextEncoder().encode(SOLANA_MAGIC_OK);
  if (decoded.length !== expected.length)
    return { ok: false, reason: "return_data_length_mismatch" };

  for (let i = 0; i < expected.length; i += 1) {
    if (decoded[i] !== expected[i]) return { ok: false, reason: "return_data_value_mismatch" };
  }

  return { ok: true };
}

/**
 * Parse optional timelock bounds from `PaymentRequirements.extra`.
 *
 * @param extra - The `extra` object from `PaymentRequirements`.
 * @returns Parsed bounds, when present and numeric.
 */
function parseTimelock(extra: Record<string, unknown> | undefined): {
  validAfter?: bigint;
  validBefore?: bigint;
} {
  if (!extra) return {};

  const validAfter = parseBigInt(extra.validAfter);
  const validBefore = parseBigInt(extra.validBefore);

  return {
    ...(validAfter !== null ? { validAfter } : {}),
    ...(validBefore !== null ? { validBefore } : {}),
  };
}

export type VerifyAgenticProgramArgs = {
  signer: FacilitatorSvmSigner;
  network: string;
  transaction: string;
  feePayer: Address;
  payerProgram: Address;
  assetMint: Address;
  payTo: Address;
  minAmount: bigint;
  extra?: Record<string, unknown>;
};

export type VerifyAgenticProgramResult =
  | { ok: true }
  | { ok: false; invalidReason: string; invalidMessage?: string };

/**
 * Verify an agentic program wallet payment by simulating the transaction and enforcing invariants.
 *
 * @param args - Agentic verification arguments.
 * @returns Verification result.
 */
export async function verifyAgenticProgram(
  args: VerifyAgenticProgramArgs,
): Promise<VerifyAgenticProgramResult> {
  const rpc = createRpcClient(args.network as never);

  const programInfo = await rpc
    .getAccountInfo(args.payerProgram as never, { encoding: "base64" })
    .send();
  if (!programInfo.value || programInfo.value.executable !== true) {
    return { ok: false, invalidReason: "invalid_exact_svm_agentic_payer_not_program" };
  }

  const { validAfter, validBefore } = parseTimelock(args.extra);
  if (validAfter !== undefined || validBefore !== undefined) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (validAfter !== undefined && now < validAfter) {
      return { ok: false, invalidReason: "invalid_exact_svm_agentic_timelock_not_started" };
    }
    if (validBefore !== undefined && now >= validBefore) {
      return { ok: false, invalidReason: "invalid_exact_svm_agentic_timelock_expired" };
    }
  }

  const mintInfo = await rpc.getAccountInfo(args.assetMint as never, { encoding: "base64" }).send();
  const tokenProgramOwner = mintInfo.value?.owner?.toString();
  if (
    tokenProgramOwner !== TOKEN_PROGRAM_ADDRESS.toString() &&
    tokenProgramOwner !== TOKEN_2022_PROGRAM_ADDRESS.toString()
  ) {
    return { ok: false, invalidReason: "invalid_exact_svm_payload_mint_unknown_program" };
  }

  const tokenProgram =
    tokenProgramOwner === TOKEN_PROGRAM_ADDRESS.toString()
      ? (TOKEN_PROGRAM_ADDRESS as Address)
      : (TOKEN_2022_PROGRAM_ADDRESS as Address);

  const [expectedDestATA] = await findAssociatedTokenPda({
    mint: args.assetMint,
    owner: args.payTo,
    tokenProgram,
  });

  const preDest = await rpc
    .getAccountInfo(expectedDestATA as never, { encoding: "jsonParsed" })
    .send();
  const preDestAmount = preDest.value
    ? (parseTokenAmountFromParsedAccount(preDest.value.data) ?? BigInt(0))
    : BigInt(0);

  const preFeePayer = await rpc
    .getAccountInfo(args.feePayer as never, { encoding: "base64" })
    .send();
  const preFeePayerLamports = parseBigInt(preFeePayer.value?.lamports) ?? BigInt(0);

  let fullySignedTransaction: string;
  try {
    fullySignedTransaction = await args.signer.signTransaction(
      args.transaction,
      args.feePayer,
      args.network,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, invalidReason: "transaction_signing_failed", invalidMessage: message };
  }

  const simulation = (await rpc
    .simulateTransaction(fullySignedTransaction as never, {
      sigVerify: true,
      replaceRecentBlockhash: false,
      commitment: "confirmed",
      encoding: "base64",
      accounts: {
        encoding: "jsonParsed",
        addresses: [expectedDestATA.toString(), args.feePayer.toString()],
      },
    })
    .send()) as SimulateTransactionResult;

  if (simulation.value.err) {
    const errStr = JSON.stringify(simulation.value.err, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    return {
      ok: false,
      invalidReason: "transaction_simulation_failed",
      invalidMessage: errStr,
    };
  }

  const magic = checkMagicOk(simulation.value.returnData, args.payerProgram.toString());
  if (!magic.ok) {
    return {
      ok: false,
      invalidReason: "invalid_svm_agentic_signature",
      invalidMessage: magic.reason,
    };
  }

  const invocations = countProgramInvocations(simulation.value.logs, args.payerProgram.toString());
  if (invocations !== 1) {
    return { ok: false, invalidReason: "invalid_exact_svm_agentic_reentrancy" };
  }

  const [postDestAccount, postFeePayerAccount] = simulation.value.accounts ?? [];
  const postDestAmount = postDestAccount
    ? (parseTokenAmountFromParsedAccount(postDestAccount.data) ?? null)
    : null;
  if (postDestAmount === null) {
    return { ok: false, invalidReason: "invalid_exact_svm_agentic_missing_recipient_account" };
  }

  if (postFeePayerAccount) {
    const postLamports = parseBigInt(postFeePayerAccount.lamports) ?? preFeePayerLamports;
    if (postLamports !== preFeePayerLamports) {
      return { ok: false, invalidReason: "invalid_exact_svm_agentic_lamport_conservation" };
    }
  }

  const delta = postDestAmount - preDestAmount;
  if (delta < args.minAmount) {
    return { ok: false, invalidReason: "invalid_exact_svm_payload_amount_insufficient" };
  }

  return { ok: true };
}
