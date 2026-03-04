import type { Address, Instruction, Transaction } from "@solana/kit";
import {
  isSwigTransaction,
  parseSwigTransaction,
  getTokenPayerFromTransaction,
} from "./utils";

export interface NormalizedTransaction {
  instructions: Array<{
    programAddress: Address;
    accounts: Array<{ address: Address; role: number }>;
    data: Uint8Array;
  }>;
  payer: string;
}

export interface TransactionNormalizer {
  canHandle(instructions: ReadonlyArray<Instruction>): boolean;
  normalize(
    instructions: ReadonlyArray<Instruction>,
    staticAccounts: ReadonlyArray<Address>,
    transaction: Transaction,
  ): Promise<NormalizedTransaction>;
}

class SwigNormalizer implements TransactionNormalizer {
  canHandle(instructions: ReadonlyArray<Instruction>): boolean {
    return isSwigTransaction(instructions);
  }

  async normalize(
    instructions: ReadonlyArray<Instruction>,
    staticAccounts: ReadonlyArray<Address>,
  ): Promise<NormalizedTransaction> {
    const result = await parseSwigTransaction(instructions, staticAccounts);
    return {
      instructions: result.instructions,
      payer: result.swigPda,
    };
  }
}

class RegularNormalizer implements TransactionNormalizer {
  canHandle(): boolean {
    return true;
  }

  async normalize(
    instructions: ReadonlyArray<Instruction>,
    _staticAccounts: ReadonlyArray<Address>,
    transaction: Transaction,
  ): Promise<NormalizedTransaction> {
    const payer = getTokenPayerFromTransaction(transaction);
    if (!payer) {
      throw new Error("invalid_exact_svm_payload_no_transfer_instruction");
    }

    return {
      // The caller already decompiled the instructions; pass them through.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instructions: instructions as any,
      payer,
    };
  }
}

const defaultNormalizers: TransactionNormalizer[] = [
  new SwigNormalizer(),
  new RegularNormalizer(),
];

export async function normalizeTransaction(
  instructions: ReadonlyArray<Instruction>,
  staticAccounts: ReadonlyArray<Address>,
  transaction: Transaction,
): Promise<NormalizedTransaction> {
  for (const n of defaultNormalizers) {
    if (n.canHandle(instructions)) {
      return await n.normalize(instructions, staticAccounts, transaction);
    }
  }
  throw new Error("no normalizer found for transaction");
}
