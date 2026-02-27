import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactSvmScheme } from "../../src/exact/facilitator/scheme";
import type { FacilitatorSvmSigner } from "../../src/signer";
import type { PaymentRequirements, PaymentPayload } from "@x402/core/types";
import {
  USDC_DEVNET_ADDRESS,
  SOLANA_DEVNET_CAIP2,
  SWIG_PROGRAM_ADDRESS,
  SWIG_SIGN_V1_DISCRIMINATOR,
  SWIG_SIGN_V2_DISCRIMINATOR,
} from "../../src/constants";
import {
  decodeSwigCompactInstructions,
  isSwigSignInstruction,
  verifySwigTransfer,
} from "../../src/utils";
import type { Address } from "@solana/kit";

describe("ExactSvmScheme", () => {
  let mockSigner: FacilitatorSvmSigner;

  beforeEach(() => {
    mockSigner = {
      address: "FacilitatorAddress1111111111111111111" as never,
      getAddresses: vi
        .fn()
        .mockReturnValue([
          "FeePayer1111111111111111111111111111",
          "FacilitatorAddress1111111111111111111",
        ]) as never,
      signTransactions: vi.fn() as never,
      signMessages: vi.fn().mockResolvedValue([
        {
          // Mock signature dictionary
          FacilitatorAddress1111111111111111111: new Uint8Array(64),
        },
      ]) as never,
      getRpcForNetwork: vi.fn().mockReturnValue({
        getBalance: vi.fn().mockResolvedValue(BigInt(10000000)),
        getLatestBlockhash: vi.fn().mockResolvedValue({
          value: {
            blockhash: "mockBlockhash",
            lastValidBlockHeight: BigInt(100000),
          },
        }),
        simulateTransaction: vi.fn().mockResolvedValue({
          value: { err: null },
        }),
        sendTransaction: vi.fn().mockResolvedValue("mockSignature123"),
        getSignatureStatuses: vi.fn().mockResolvedValue({
          value: [{ confirmationStatus: "confirmed" }],
        }),
      }) as never,
    };
  });

  describe("constructor", () => {
    it("should create instance with correct scheme", () => {
      const facilitator = new ExactSvmScheme(mockSigner);
      expect(facilitator.scheme).toBe("exact");
    });
  });

  describe("verify", () => {
    it("should reject if scheme does not match", async () => {
      const facilitator = new ExactSvmScheme(mockSigner);

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://example.com/protected",
          description: "Test resource",
          mimeType: "application/json",
        },
        accepted: {
          scheme: "wrong", // Wrong scheme
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "PayToAddress11111111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: { feePayer: "FeePayer1111111111111111111111111111" },
        },
        payload: {
          transaction: "base64transaction==",
        },
      };

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: { feePayer: "FeePayer1111111111111111111111111111" },
      };

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("should reject if network does not match", async () => {
      const facilitator = new ExactSvmScheme(mockSigner);

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://example.com/protected",
          description: "Test resource",
          mimeType: "application/json",
        },
        accepted: {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", // Mainnet
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "PayToAddress11111111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: { feePayer: "FeePayer1111111111111111111111111111" },
        },
        payload: {
          transaction: "validbase64transaction==",
        },
      };

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2, // Devnet
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: { feePayer: "FeePayer1111111111111111111111111111" },
      };

      const result = await facilitator.verify(payload, requirements);

      // Network check happens early in Step 1 (before transaction parsing)
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("network_mismatch");
    });

    it("should reject if feePayer is missing", async () => {
      const facilitator = new ExactSvmScheme(mockSigner);

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://example.com/protected",
          description: "Test resource",
          mimeType: "application/json",
        },
        accepted: {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "PayToAddress11111111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: {},
        },
        payload: {
          transaction: "base64transaction==",
        },
      };

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: {}, // Missing feePayer
      };

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_svm_payload_missing_fee_payer");
    });

    it("should reject if transaction cannot be decoded", async () => {
      const facilitator = new ExactSvmScheme(mockSigner);

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://example.com/protected",
          description: "Test resource",
          mimeType: "application/json",
        },
        accepted: {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "PayToAddress11111111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: { feePayer: "FeePayer1111111111111111111111111111" },
        },
        payload: {
          transaction: "invalid!!!", // Invalid base64
        },
      };

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: { feePayer: "FeePayer1111111111111111111111111111" },
      };

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      // Transaction decoding or instruction validation fails
      expect(result.invalidReason).toContain("invalid_exact_svm_payload_transaction");
    });
  });

  // ─── Swig wallet utility tests ───────────────────────────────────────────

  describe("isSwigSignInstruction", () => {
    it("should return true for Swig program with V1 discriminator", () => {
      const data = new Uint8Array([SWIG_SIGN_V1_DISCRIMINATOR, 0, 0, 0]);
      expect(isSwigSignInstruction(SWIG_PROGRAM_ADDRESS, data)).toBe(true);
    });

    it("should return true for Swig program with V2 discriminator", () => {
      const data = new Uint8Array([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]);
      expect(isSwigSignInstruction(SWIG_PROGRAM_ADDRESS, data)).toBe(true);
    });

    it("should return false for a non-Swig program address", () => {
      const data = new Uint8Array([SWIG_SIGN_V1_DISCRIMINATOR, 0, 0, 0]);
      expect(isSwigSignInstruction("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data)).toBe(
        false,
      );
    });

    it("should return false for Swig program with unknown discriminator", () => {
      const data = new Uint8Array([99, 0, 0, 0]);
      expect(isSwigSignInstruction(SWIG_PROGRAM_ADDRESS, data)).toBe(false);
    });

    it("should return false when data is undefined", () => {
      expect(isSwigSignInstruction(SWIG_PROGRAM_ADDRESS, undefined)).toBe(false);
    });

    it("should return false when data is shorter than 2 bytes", () => {
      expect(isSwigSignInstruction(SWIG_PROGRAM_ADDRESS, new Uint8Array([4]))).toBe(false);
    });
  });

  describe("decodeSwigCompactInstructions", () => {
    // Helper: build a Swig signV1 instruction data buffer with the given compact instruction payload
    function buildSwigData(payload: Uint8Array): Uint8Array {
      const buf = new Uint8Array(8 + payload.length);
      buf[0] = SWIG_SIGN_V1_DISCRIMINATOR;
      buf[1] = 0;
      buf[2] = payload.length & 0xff;
      buf[3] = (payload.length >> 8) & 0xff;
      // bytes 4-7: roleId = 0
      buf.set(payload, 8);
      return buf;
    }

    // Helper: build a TransferChecked compact instruction entry
    function buildTransferCheckedCompact(
      programIdIndex: number,
      accountIndices: number[],
      amount: bigint,
      decimals = 6,
    ): Uint8Array {
      const instrData = new Uint8Array(10);
      instrData[0] = 12; // transferChecked discriminator
      new DataView(instrData.buffer).setBigUint64(1, amount, true);
      instrData[9] = decimals;

      const accounts = new Uint8Array(accountIndices);
      const entry = new Uint8Array(
        1 + 1 + accounts.length + 2 + instrData.length, // progId + numAccounts + accounts + dataLen + data
      );
      let off = 0;
      entry[off++] = programIdIndex;
      entry[off++] = accounts.length;
      entry.set(accounts, off);
      off += accounts.length;
      entry[off++] = instrData.length & 0xff;
      entry[off++] = (instrData.length >> 8) & 0xff;
      entry.set(instrData, off);
      return entry;
    }

    it("should return empty array when data is shorter than 4 bytes", () => {
      expect(decodeSwigCompactInstructions(new Uint8Array([1, 2, 3]))).toEqual([]);
    });

    it("should return empty array when instructionPayloadLen exceeds available data", () => {
      // instructionPayloadLen = 100 but only 8 bytes total
      const data = new Uint8Array([4, 0, 100, 0, 0, 0, 0, 0]);
      expect(decodeSwigCompactInstructions(data)).toEqual([]);
    });

    it("should correctly decode a single TransferChecked compact instruction", () => {
      // Build payload: programIdIndex=5, accounts=[1,2,3,0], amount=100000, decimals=6
      const compact = buildTransferCheckedCompact(5, [1, 2, 3, 0], 100000n);
      const data = buildSwigData(compact);

      const result = decodeSwigCompactInstructions(data);
      expect(result).toHaveLength(1);
      expect(result[0].programIdIndex).toBe(5);
      expect(result[0].accounts).toEqual([1, 2, 3, 0]);
      expect(result[0].data[0]).toBe(12); // transferChecked discriminator
      // Check amount (U64 LE at bytes 1-8)
      const amountBuf = new Uint8Array(8);
      amountBuf.set(result[0].data.slice(1, 9));
      const amount = new DataView(amountBuf.buffer).getBigUint64(0, true);
      expect(amount).toBe(100000n);
    });

    it("should return empty array when compact instruction data is truncated", () => {
      // payload length = 5 in header but actual payload is empty → truncated
      const data = new Uint8Array([4, 0, 5, 0, 0, 0, 0, 0]); // payloadLen=5 but no payload bytes
      expect(decodeSwigCompactInstructions(data)).toEqual([]);
    });
  });

  describe("verifySwigTransfer", () => {
    const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const SWIG_PDA = "swigPDA1111111111111111111111111111111111111" as Address;
    const signerAddresses = ["FacilitatorAddress1111111111111111111111111"];

    // staticAccounts: [swigPDA, TOKEN_PROGRAM, source, mint, destATA]
    const staticAccounts = [
      SWIG_PDA,
      TOKEN_PROGRAM as Address,
      "sourceAccount111111111111111111111111111" as Address,
      USDC_DEVNET_ADDRESS as Address,
      "destinationATA11111111111111111111111111" as Address,
    ];

    // Build a valid Swig signV1 instruction with embedded TransferChecked
    function buildIx(
      amount: bigint,
      programIdIndex = 1,
      accountIndices = [2, 3, 4, 0],
    ): { accounts: Array<{ address: Address }>; data: Uint8Array } {
      const instrData = new Uint8Array(10);
      instrData[0] = 12;
      new DataView(instrData.buffer).setBigUint64(1, amount, true);
      instrData[9] = 6;

      const accounts = new Uint8Array(accountIndices);
      const entry = new Uint8Array(1 + 1 + accounts.length + 2 + instrData.length);
      let off = 0;
      entry[off++] = programIdIndex;
      entry[off++] = accounts.length;
      entry.set(accounts, off);
      off += accounts.length;
      entry[off++] = instrData.length & 0xff;
      entry[off++] = (instrData.length >> 8) & 0xff;
      entry.set(instrData, off);

      const outerData = new Uint8Array(8 + entry.length);
      outerData[0] = SWIG_SIGN_V1_DISCRIMINATOR;
      outerData[1] = 0;
      outerData[2] = entry.length & 0xff;
      outerData[3] = (entry.length >> 8) & 0xff;
      outerData.set(entry, 8);

      return {
        accounts: [{ address: SWIG_PDA }],
        data: outerData,
      };
    }

    it("should throw invalid_exact_svm_payload_no_transfer_instruction when ix has no accounts", async () => {
      const ix = { accounts: [] as Array<{ address: Address }>, data: new Uint8Array(0) };
      await expect(
        verifySwigTransfer(ix, staticAccounts, { asset: USDC_DEVNET_ADDRESS, payTo: "x", amount: "100000" }, []),
      ).rejects.toBe("invalid_exact_svm_payload_no_transfer_instruction");
    });

    it("should throw invalid_exact_svm_payload_transaction_fee_payer_transferring_funds when Swig PDA is a facilitator signer", async () => {
      const ix = buildIx(100000n);
      await expect(
        verifySwigTransfer(
          ix,
          staticAccounts,
          { asset: USDC_DEVNET_ADDRESS, payTo: "PayTo11111111111111111111111111111111111", amount: "100000" },
          [SWIG_PDA.toString()],
        ),
      ).rejects.toBe("invalid_exact_svm_payload_transaction_fee_payer_transferring_funds");
    });

    it("should throw invalid_exact_svm_payload_no_transfer_instruction when compact instructions are empty", async () => {
      // data too short to contain any compact instruction
      const ix = { accounts: [{ address: SWIG_PDA }], data: new Uint8Array([4, 0, 0, 0, 0, 0, 0, 0]) };
      await expect(
        verifySwigTransfer(ix, staticAccounts, { asset: USDC_DEVNET_ADDRESS, payTo: "x", amount: "100000" }, signerAddresses),
      ).rejects.toBe("invalid_exact_svm_payload_no_transfer_instruction");
    });

    it("should throw invalid_exact_svm_payload_no_transfer_instruction when no SPL compact instruction found", async () => {
      // Build with programIdIndex=0 (Swig PDA, not TOKEN_PROGRAM)
      const ix = buildIx(100000n, 0, [2, 3, 4, 0]);
      await expect(
        verifySwigTransfer(ix, staticAccounts, { asset: USDC_DEVNET_ADDRESS, payTo: "x", amount: "100000" }, signerAddresses),
      ).rejects.toBe("invalid_exact_svm_payload_no_transfer_instruction");
    });

    it("should throw invalid_exact_svm_payload_mint_mismatch when compact instruction uses wrong mint", async () => {
      // accounts[1] points to index 0 (Swig PDA) instead of the correct mint at index 3
      const ix = buildIx(100000n, 1, [2, 0, 4, 0]);
      await expect(
        verifySwigTransfer(
          ix,
          staticAccounts,
          { asset: USDC_DEVNET_ADDRESS, payTo: "x", amount: "100000" },
          signerAddresses,
        ),
      ).rejects.toBe("invalid_exact_svm_payload_mint_mismatch");
    });
  });

  describe("settle", () => {
    it("should fail settlement if verification fails", async () => {
      const facilitator = new ExactSvmScheme(mockSigner);

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://example.com/protected",
          description: "Test resource",
          mimeType: "application/json",
        },
        accepted: {
          scheme: "wrong", // Wrong scheme
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "PayToAddress11111111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: { feePayer: "FeePayer1111111111111111111111111111" },
        },
        payload: {
          transaction: "base64transaction==",
        },
      };

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: { feePayer: "FeePayer1111111111111111111111111111" },
      };

      const result = await facilitator.settle(payload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("unsupported_scheme");
      expect(result.network).toBe(SOLANA_DEVNET_CAIP2);
    });
  });
});
