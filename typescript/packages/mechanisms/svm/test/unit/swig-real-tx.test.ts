import { describe, it, expect, vi } from "vitest";
import {
  getBase64Encoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessage,
  type Address,
} from "@solana/kit";
import { isSwigTransaction, parseSwigTransaction } from "../../src/utils";
import { normalizeTransaction } from "../../src/normalizer";
import { ExactSvmScheme } from "../../src/exact/facilitator/scheme";
import type { FacilitatorSvmSigner } from "../../src/signer";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS } from "../../src/constants";

// Real confirmed Swig smart wallet USDC transfer on devnet
// tx: 2TAkeCETVcsbtmK1UMdgk2BZVdWQjnv7s2s7QUYv3Ynaqh36iXVdwM1ong8hmRw4Za3Yw8CkjgVwiyUpGR6SQP1g
const REAL_SWIG_TX_BASE64 =
  "AkiVWpmnwCMi7VKkTgzdR2vqY1fOSr14KPzUnzCNQpeOMif5NskDc4uS+gOp8RgsErjrnGLEYL1N" +
  "268w+qF+dge3oCdndWRM1K0yufH+fFvkZZ4Bs3zo54vRPaX9frRvVfnjAvIaF+LrUcesSgDzelLub" +
  "NZgz/xTZpMF+M73W2QBgAIBBAqZaoBA6PatAWpRvzksIlZIPBdwhETOtNqkgD0atmy0InVOnwjWNA" +
  "xK9dVi7s3ExZUKIESvFVgLxy2EuifanfHXNuKlxHOPekji0xlP2QWZWAXWe2Waz6nHvKl8rEzDOBW" +
  "YZE9jRaDJ3Di+pFN1xwc5xnR4DB9Ie84lQHbJaXPMB+psglirF8mTyZ49SOemjo+02LMohN2jyoK" +
  "VBiPYUEFBZOwM3pq0f7lZsDDur9i+ue/ujyUjQwUnXvJRe7/+3hMDBkZv5SEXMv/srbpyw5vnvIz" +
  "lu8X3EmssQ5s6QAAAAA0M6ULh58UG4hjfDX3xxS+v3DUp5I1nTR2yTHW1TMy+Bt324ddloZPZy+F" +
  "Gzut5rBy0he1fWzeROoz1hX7/AKk7RCyzkSFX8TqTPQE0KC0DK1/+zQGi2/G3eQYI3wAup78zWM" +
  "i4yXOAY9JrFqsFFkNRq8dONAlh9AOdsB99f/m6AwYACQNkAAAAAAAAAAYABQKAGgYABwcCAwEIBA" +
  "kFHAsAEwAAAAAAAQMEBAUGAQoADAEAAAAAAAAABgIA";

const FEE_PAYER = "BKsZvzPUY6VT2GpLMxx6fA6fuC8MK3hVxwdjK8yqmqSR";
const SWIG_PDA = "4hFTuZxrMbZciAxA9DcLYYC9vupNuw89v527ys6PvRo2";
const PAY_TO = "EkkpfzUdwwgeqWb25hWcSi2c5gquELLUB3Z2asr1Xroo";

function decodeRealTx() {
  const base64Encoder = getBase64Encoder();
  const transactionBytes = base64Encoder.encode(REAL_SWIG_TX_BASE64);
  const transactionDecoder = getTransactionDecoder();
  return transactionDecoder.decode(transactionBytes);
}

function decompileRealTx() {
  const transaction = decodeRealTx();
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const decompiled = decompileTransactionMessage(compiled);
  return { transaction, compiled, decompiled, instructions: decompiled.instructions ?? [], staticAccounts: compiled.staticAccounts ?? [] };
}

describe("Real Swig devnet transaction", () => {
  describe("isSwigTransaction", () => {
    it("should detect real devnet tx as Swig", () => {
      const { instructions } = decompileRealTx();
      expect(isSwigTransaction(instructions)).toBe(true);
    });
  });

  describe("parseSwigTransaction", () => {
    it("should flatten to 3 instructions", async () => {
      const { instructions, staticAccounts } = decompileRealTx();
      const result = await parseSwigTransaction(instructions, staticAccounts);
      expect(result.instructions).toHaveLength(3);
    });

    it("should extract correct swig PDA", async () => {
      const { instructions, staticAccounts } = decompileRealTx();
      const result = await parseSwigTransaction(instructions, staticAccounts);
      expect(result.swigPda).toBe(SWIG_PDA);
    });

    it("should have TransferChecked discriminator (12) on third instruction", async () => {
      const { instructions, staticAccounts } = decompileRealTx();
      const result = await parseSwigTransaction(instructions, staticAccounts);
      expect(result.instructions[2].data[0]).toBe(12);
    });

    it("should have amount=1 and decimals=6", async () => {
      const { instructions, staticAccounts } = decompileRealTx();
      const result = await parseSwigTransaction(instructions, staticAccounts);
      const transferData = result.instructions[2].data;
      const amount = new DataView(
        transferData.buffer,
        transferData.byteOffset,
      ).getBigUint64(1, true);
      const decimals = transferData[9];
      expect(amount).toBe(1n);
      expect(decimals).toBe(6);
    });

    it("should sort compute budget instructions correctly", async () => {
      const { instructions, staticAccounts } = decompileRealTx();
      const result = await parseSwigTransaction(instructions, staticAccounts);
      // First instruction should be SetComputeUnitLimit (disc=2)
      expect(result.instructions[0].data[0]).toBe(2);
      // Second instruction should be SetComputeUnitPrice (disc=3)
      expect(result.instructions[1].data[0]).toBe(3);
    });
  });

  describe("normalizeTransaction", () => {
    it("should return swig PDA as payer", async () => {
      const { transaction, instructions, staticAccounts } = decompileRealTx();
      const normalized = await normalizeTransaction(instructions, staticAccounts, transaction);
      expect(normalized.payer).toBe(SWIG_PDA);
    });

    it("should return 3 instructions", async () => {
      const { transaction, instructions, staticAccounts } = decompileRealTx();
      const normalized = await normalizeTransaction(instructions, staticAccounts, transaction);
      expect(normalized.instructions).toHaveLength(3);
    });
  });

  describe("verify pipeline", () => {
    it("should verify as valid with mock signer", async () => {
      const mockSigner: FacilitatorSvmSigner = {
        getAddresses: vi.fn().mockReturnValue([FEE_PAYER]) as never,
        signTransaction: vi.fn().mockResolvedValue(REAL_SWIG_TX_BASE64) as never,
        simulateTransaction: vi.fn().mockResolvedValue(undefined) as never,
        sendTransaction: vi.fn().mockResolvedValue("mockSignature123") as never,
        confirmTransaction: vi.fn().mockResolvedValue(undefined) as never,
      };

      const scheme = new ExactSvmScheme(mockSigner);

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "1",
        payTo: PAY_TO,
        maxTimeoutSeconds: 3600,
        extra: { feePayer: FEE_PAYER },
      };

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://example.com/protected",
          description: "Test resource",
          mimeType: "application/json",
        },
        accepted: requirements,
        payload: { transaction: REAL_SWIG_TX_BASE64 },
      };

      const result = await scheme.verify(payload, requirements);
      expect(result.isValid).toBe(true);
      expect(result.payer).toBe(SWIG_PDA);
    });
  });
});
