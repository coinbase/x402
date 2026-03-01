import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactSvmScheme } from "../../src/exact/facilitator/scheme";
import type { FacilitatorSvmSigner } from "../../src/signer";
import type { PaymentRequirements, PaymentPayload } from "@x402/core/types";
import {
  USDC_DEVNET_ADDRESS,
  SOLANA_DEVNET_CAIP2,
  SWIG_PROGRAM_ADDRESS,
  SWIG_SIGN_V2_DISCRIMINATOR,
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SECP256R1_PRECOMPILE_ADDRESS,
} from "../../src/constants";
import {
  decodeSwigCompactInstructions,
  isSwigTransaction,
  parseSwigTransaction,
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

  describe("isSwigTransaction", () => {
    it("should return true for a valid Swig transaction (2 compute budgets + SignV2)", () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: SWIG_PROGRAM_ADDRESS, data: new Uint8Array([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]) },
      ];
      expect(isSwigTransaction(instructions)).toBe(true);
    });

    it("should return true when secp256r1 precompile instructions are present", () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: SECP256R1_PRECOMPILE_ADDRESS, data: new Uint8Array([]) },
        { programAddress: SWIG_PROGRAM_ADDRESS, data: new Uint8Array([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]) },
      ];
      expect(isSwigTransaction(instructions)).toBe(true);
    });

    it("should return false when last instruction is not Swig program", () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: new Uint8Array([12, 0, 0, 0]) },
      ];
      expect(isSwigTransaction(instructions)).toBe(false);
    });

    it("should return false when a non-allowed instruction precedes the last", () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: new Uint8Array([12, 0, 0, 0]) },
        { programAddress: SWIG_PROGRAM_ADDRESS, data: new Uint8Array([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]) },
      ];
      expect(isSwigTransaction(instructions)).toBe(false);
    });

    it("should return false for unknown discriminator (only V2 supported)", () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: SWIG_PROGRAM_ADDRESS, data: new Uint8Array([4, 0, 0, 0]) }, // V1 discriminator
      ];
      expect(isSwigTransaction(instructions)).toBe(false);
    });

    it("should return false for empty instructions", () => {
      expect(isSwigTransaction([])).toBe(false);
    });

    it("should return false when Swig instruction data is too short", () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: SWIG_PROGRAM_ADDRESS, data: new Uint8Array([11]) }, // only 1 byte
      ];
      expect(isSwigTransaction(instructions)).toBe(false);
    });
  });

  describe("decodeSwigCompactInstructions", () => {
    // Helper: build a Swig signV2 instruction data buffer with the given compact instruction payload
    function buildSwigData(payload: Uint8Array): Uint8Array {
      const buf = new Uint8Array(8 + payload.length);
      buf[0] = SWIG_SIGN_V2_DISCRIMINATOR;
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

  describe("parseSwigTransaction", () => {
    const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const SWIG_PDA = "swigPDA1111111111111111111111111111111111111";

    // staticAccounts: [swigPDA, TOKEN_PROGRAM, source, mint, destATA, SWIG_PROGRAM, COMPUTE_BUDGET]
    const staticAccounts = [
      SWIG_PDA as Address,
      TOKEN_PROGRAM as Address,
      "sourceAccount111111111111111111111111111" as Address,
      USDC_DEVNET_ADDRESS as Address,
      "destinationATA11111111111111111111111111" as Address,
      SWIG_PROGRAM_ADDRESS as Address,
      COMPUTE_BUDGET_PROGRAM_ADDRESS as Address,
    ];

    function buildSwigV2Data(payload: Uint8Array): Uint8Array {
      const buf = new Uint8Array(8 + payload.length);
      buf[0] = SWIG_SIGN_V2_DISCRIMINATOR;
      buf[1] = 0;
      buf[2] = payload.length & 0xff;
      buf[3] = (payload.length >> 8) & 0xff;
      buf.set(payload, 8);
      return buf;
    }

    function buildTransferCheckedCompact(
      programIdIndex: number,
      accountIndices: number[],
      amount: bigint,
      decimals = 6,
    ): Uint8Array {
      const instrData = new Uint8Array(10);
      instrData[0] = 12;
      new DataView(instrData.buffer).setBigUint64(1, amount, true);
      instrData[9] = decimals;
      const accounts = new Uint8Array(accountIndices);
      const entry = new Uint8Array(1 + 1 + accounts.length + 2 + instrData.length);
      let off = 0;
      entry[off++] = programIdIndex;
      entry[off++] = accounts.length;
      entry.set(accounts, off); off += accounts.length;
      entry[off++] = instrData.length & 0xff;
      entry[off++] = (instrData.length >> 8) & 0xff;
      entry.set(instrData, off);
      return entry;
    }

    it("should flatten a Swig transaction with embedded TransferChecked", () => {
      const compact = buildTransferCheckedCompact(1, [2, 3, 4, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: [{ address: SWIG_PDA as Address }],
          data: signV2Data,
        },
      ];

      const result = parseSwigTransaction(instructions, staticAccounts);

      // Should have 3 instructions: 2 compute budgets + 1 TransferChecked
      expect(result.instructions).toHaveLength(3);
      expect(result.swigPda).toBe(SWIG_PDA);

      // First two are compute budget (unchanged)
      expect(result.instructions[0].programAddress.toString()).toBe(COMPUTE_BUDGET_PROGRAM_ADDRESS);
      expect(result.instructions[1].programAddress.toString()).toBe(COMPUTE_BUDGET_PROGRAM_ADDRESS);

      // Third is the resolved TransferChecked
      expect(result.instructions[2].programAddress.toString()).toBe(TOKEN_PROGRAM);
      expect(result.instructions[2].data[0]).toBe(12); // transferChecked discriminator
    });

    it("should filter out secp256r1 precompile instructions", () => {
      const compact = buildTransferCheckedCompact(1, [2, 3, 4, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: SECP256R1_PRECOMPILE_ADDRESS as Address, data: new Uint8Array([]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: [{ address: SWIG_PDA as Address }],
          data: signV2Data,
        },
      ];

      const result = parseSwigTransaction(instructions, staticAccounts);

      // Should have 3 instructions: 2 compute budgets + 1 TransferChecked (precompile filtered)
      expect(result.instructions).toHaveLength(3);
      expect(result.swigPda).toBe(SWIG_PDA);
    });

    it("should resolve compact instruction account indices to addresses", () => {
      // accounts=[2, 3, 4, 0] → [source, mint, destATA, swigPDA]
      const compact = buildTransferCheckedCompact(1, [2, 3, 4, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: [{ address: SWIG_PDA as Address }],
          data: signV2Data,
        },
      ];

      const result = parseSwigTransaction(instructions, staticAccounts);
      const transferIx = result.instructions[2];

      expect(transferIx.accounts).toHaveLength(4);
      expect(transferIx.accounts[0].address.toString()).toBe(staticAccounts[2].toString()); // source
      expect(transferIx.accounts[1].address.toString()).toBe(staticAccounts[3].toString()); // mint
      expect(transferIx.accounts[2].address.toString()).toBe(staticAccounts[4].toString()); // destATA
      expect(transferIx.accounts[3].address.toString()).toBe(staticAccounts[0].toString()); // swigPDA (authority)
    });

    it("should extract swigPda from first account of SignV2 instruction", () => {
      const compact = buildTransferCheckedCompact(1, [2, 3, 4, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: [{ address: SWIG_PDA as Address }],
          data: signV2Data,
        },
      ];

      const result = parseSwigTransaction(instructions, staticAccounts);
      expect(result.swigPda).toBe(SWIG_PDA);
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
