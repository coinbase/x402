import type { Address, Transaction } from "@solana/kit";
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
  canHandle(
    instructions: ReadonlyArray<{
      programAddress: { toString(): string };
      data?: Readonly<Uint8Array>;
    }>,
  ): boolean;
  normalize(
    instructions: ReadonlyArray<{
      programAddress: { toString(): string };
      accounts?: ReadonlyArray<{ address: { toString(): string } }>;
      data?: Readonly<Uint8Array>;
    }>,
    staticAccounts: ReadonlyArray<Address>,
    transaction: Transaction,
  ): NormalizedTransaction;
}

class SwigNormalizer implements TransactionNormalizer {
  canHandle(
    instructions: ReadonlyArray<{
      programAddress: { toString(): string };
      data?: Readonly<Uint8Array>;
    }>,
  ): boolean {
    return isSwigTransaction(instructions);
  }

  normalize(
    instructions: ReadonlyArray<{
      programAddress: { toString(): string };
      accounts?: ReadonlyArray<{ address: { toString(): string } }>;
      data?: Readonly<Uint8Array>;
    }>,
    staticAccounts: ReadonlyArray<Address>,
  ): NormalizedTransaction {
    const result = parseSwigTransaction(instructions, staticAccounts);
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

  normalize(
    instructions: ReadonlyArray<{
      programAddress: { toString(): string };
      accounts?: ReadonlyArray<{ address: { toString(): string } }>;
      data?: Readonly<Uint8Array>;
    }>,
    _staticAccounts: ReadonlyArray<Address>,
    transaction: Transaction,
  ): NormalizedTransaction {
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

export function normalizeTransaction(
  instructions: ReadonlyArray<{
    programAddress: { toString(): string };
    accounts?: ReadonlyArray<{ address: { toString(): string } }>;
    data?: Readonly<Uint8Array>;
  }>,
  staticAccounts: ReadonlyArray<Address>,
  transaction: Transaction,
): NormalizedTransaction {
  for (const n of defaultNormalizers) {
    if (n.canHandle(instructions)) {
      return n.normalize(instructions, staticAccounts, transaction);
    }
  }
  throw new Error("no normalizer found for transaction");
}
