import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
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
import { normalizeTransaction } from "../../src/normalizer";
import { type Address, type Transaction, getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

// Derive the SwigWalletAddress PDA from the test SWIG_PDA at module level
const SWIG_PDA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
let SWIG_WALLET_ADDRESS: string;

beforeAll(async () => {
  const addressEncoder = getAddressEncoder();
  const [walletAddress] = await getProgramDerivedAddress({
    programAddress: SWIG_PROGRAM_ADDRESS as Address,
    seeds: [
      new TextEncoder().encode("swig-wallet-address"),
      addressEncoder.encode(SWIG_PDA as Address),
    ],
  });
  SWIG_WALLET_ADDRESS = walletAddress.toString();
});

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
    function buildSwigData(payload: Uint8Array, numInstructions = 1): Uint8Array {
      // Prepend numInstructions count byte
      const withCount = new Uint8Array(1 + payload.length);
      withCount[0] = numInstructions;
      withCount.set(payload, 1);
      const buf = new Uint8Array(8 + withCount.length);
      buf[0] = SWIG_SIGN_V2_DISCRIMINATOR;
      buf[1] = 0;
      buf[2] = withCount.length & 0xff;
      buf[3] = (withCount.length >> 8) & 0xff;
      // bytes 4-7: roleId = 0
      buf.set(withCount, 8);
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

    it("should throw when data is shorter than 4 bytes", () => {
      expect(() => decodeSwigCompactInstructions(new Uint8Array([1, 2, 3]))).toThrow(
        "swig instruction data too short",
      );
    });

    it("should throw when instructionPayloadLen exceeds available data", () => {
      // instructionPayloadLen = 100 but only 8 bytes total
      const data = new Uint8Array([4, 0, 100, 0, 0, 0, 0, 0]);
      expect(() => decodeSwigCompactInstructions(data)).toThrow(
        "swig instruction data truncated",
      );
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

    it("should throw when compact instruction data is truncated", () => {
      // payload length = 5 in header but actual payload is empty → truncated
      const data = new Uint8Array([4, 0, 5, 0, 0, 0, 0, 0]); // payloadLen=5 but no payload bytes
      expect(() => decodeSwigCompactInstructions(data)).toThrow(
        "swig instruction data truncated",
      );
    });
  });

  describe("parseSwigTransaction", () => {
    const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

    // SignV2 account list with SwigWalletAddress at index 1:
    // pos 0 → swigPDA, pos 1 → swigWalletAddress, pos 2 → dest, pos 3 → TOKEN_PROGRAM, pos 4 → mint, pos 5 → source
    function getSignV2Accounts() {
      return [
        { address: SWIG_PDA as Address },
        { address: SWIG_WALLET_ADDRESS as Address },
        { address: "destinationATA11111111111111111111111111" as Address },
        { address: TOKEN_PROGRAM as Address },
        { address: USDC_DEVNET_ADDRESS as Address },
        { address: "sourceAccount111111111111111111111111111" as Address },
      ];
    }

    function buildSwigV2Data(payload: Uint8Array, numInstructions = 1): Uint8Array {
      // Prepend numInstructions count byte
      const withCount = new Uint8Array(1 + payload.length);
      withCount[0] = numInstructions;
      withCount.set(payload, 1);
      const buf = new Uint8Array(8 + withCount.length);
      buf[0] = SWIG_SIGN_V2_DISCRIMINATOR;
      buf[1] = 0;
      buf[2] = withCount.length & 0xff;
      buf[3] = (withCount.length >> 8) & 0xff;
      buf.set(withCount, 8);
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

    it("should flatten a Swig transaction with embedded TransferChecked", async () => {
      const signV2Accounts = getSignV2Accounts();
      // compact indices reference signV2's account list:
      // programIdIndex=3 → signV2Accounts[3]=TOKEN_PROGRAM
      // accounts=[5,4,2,0] → signV2Accounts[5,4,2,0] = [source, mint, dest, swigPDA]
      const compact = buildTransferCheckedCompact(3, [5, 4, 2, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: signV2Accounts,
          data: signV2Data,
        },
      ];

      const result = await parseSwigTransaction(instructions, staticAccounts);

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

    it("should filter out secp256r1 precompile instructions", async () => {
      const signV2Accounts = getSignV2Accounts();
      const compact = buildTransferCheckedCompact(3, [5, 4, 2, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: SECP256R1_PRECOMPILE_ADDRESS as Address, data: new Uint8Array([]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: signV2Accounts,
          data: signV2Data,
        },
      ];

      const result = await parseSwigTransaction(instructions, staticAccounts);

      // Should have 3 instructions: 2 compute budgets + 1 TransferChecked (precompile filtered)
      expect(result.instructions).toHaveLength(3);
      expect(result.swigPda).toBe(SWIG_PDA);
    });

    it("should resolve compact instruction account indices to addresses", async () => {
      const signV2Accounts = getSignV2Accounts();
      // compact accounts=[5,4,2,0] → signV2Accounts[5,4,2,0] = [source, mint, dest, swigPDA]
      const compact = buildTransferCheckedCompact(3, [5, 4, 2, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: signV2Accounts,
          data: signV2Data,
        },
      ];

      const result = await parseSwigTransaction(instructions, staticAccounts);
      const transferIx = result.instructions[2];

      expect(transferIx.accounts).toHaveLength(4);
      expect(transferIx.accounts[0].address.toString()).toBe(staticAccounts[2].toString()); // source
      expect(transferIx.accounts[1].address.toString()).toBe(staticAccounts[3].toString()); // mint
      expect(transferIx.accounts[2].address.toString()).toBe(staticAccounts[4].toString()); // destATA
      expect(transferIx.accounts[3].address.toString()).toBe(staticAccounts[0].toString()); // swigPDA (authority)
    });

    it("should extract swigPda from first account of SignV2 instruction", async () => {
      const signV2Accounts = getSignV2Accounts();
      const compact = buildTransferCheckedCompact(3, [5, 4, 2, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: signV2Accounts,
          data: signV2Data,
        },
      ];

      const result = await parseSwigTransaction(instructions, staticAccounts);
      expect(result.swigPda).toBe(SWIG_PDA);
    });

    it("should throw when compact instruction index exceeds signV2 accounts", async () => {
      const signV2Accounts = getSignV2Accounts();
      // programIdIndex=6 is out of range for signV2Accounts (len 6, valid 0-5)
      const compact = buildTransferCheckedCompact(6, [0, 1, 2, 3], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: signV2Accounts,
          data: signV2Data,
        },
      ];

      await expect(parseSwigTransaction(instructions, staticAccounts)).rejects.toThrow(/out of range/);
    });

    it("should throw when SwigWalletAddress does not match expected derivation", async () => {
      // Use a wrong address at signV2Accounts[1] instead of the real derived address
      const badSignV2Accounts = [
        { address: SWIG_PDA as Address },
        { address: "WrongWalletAddr1111111111111111111111111111" as Address },
        { address: "destinationATA11111111111111111111111111" as Address },
        { address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address },
        { address: USDC_DEVNET_ADDRESS as Address },
        { address: "sourceAccount111111111111111111111111111" as Address },
      ];

      const compact = buildTransferCheckedCompact(3, [5, 4, 2, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: badSignV2Accounts,
          data: signV2Data,
        },
      ];

      await expect(parseSwigTransaction(instructions, staticAccounts)).rejects.toThrow(
        "invalid_swig_wallet_address_derivation",
      );
    });
  });

  describe("normalizeTransaction", () => {
    const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    const staticAccounts = [
      SWIG_PDA as Address,
      TOKEN_PROGRAM as Address,
      "sourceAccount111111111111111111111111111" as Address,
      USDC_DEVNET_ADDRESS as Address,
      "destinationATA11111111111111111111111111" as Address,
      SWIG_PROGRAM_ADDRESS as Address,
      COMPUTE_BUDGET_PROGRAM_ADDRESS as Address,
    ];

    function getSignV2Accounts() {
      return [
        { address: SWIG_PDA as Address },
        { address: SWIG_WALLET_ADDRESS as Address },
        { address: "destinationATA11111111111111111111111111" as Address },
        { address: TOKEN_PROGRAM as Address },
        { address: USDC_DEVNET_ADDRESS as Address },
        { address: "sourceAccount111111111111111111111111111" as Address },
      ];
    }

    function buildSwigV2Data(payload: Uint8Array, numInstructions = 1): Uint8Array {
      const withCount = new Uint8Array(1 + payload.length);
      withCount[0] = numInstructions;
      withCount.set(payload, 1);
      const buf = new Uint8Array(8 + withCount.length);
      buf[0] = SWIG_SIGN_V2_DISCRIMINATOR;
      buf[1] = 0;
      buf[2] = withCount.length & 0xff;
      buf[3] = (withCount.length >> 8) & 0xff;
      buf.set(withCount, 8);
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

    it("should dispatch to SwigNormalizer for Swig transactions", async () => {
      const signV2Accounts = getSignV2Accounts();
      const compact = buildTransferCheckedCompact(3, [5, 4, 2, 0], 100000n);
      const signV2Data = buildSwigV2Data(compact);

      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        {
          programAddress: SWIG_PROGRAM_ADDRESS as Address,
          accounts: signV2Accounts,
          data: signV2Data,
        },
      ];

      const result = await normalizeTransaction(instructions, staticAccounts, {} as Transaction);
      expect(result.payer).toBe(SWIG_PDA);
      expect(result.instructions).toHaveLength(3);
    });

    it("should dispatch to RegularNormalizer for non-Swig transactions", async () => {
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { programAddress: TOKEN_PROGRAM as Address, data: new Uint8Array([12, 0, 0, 0]) },
      ];

      // Build a minimal mock transaction whose messageBytes contain a token
      // TransferChecked so getTokenPayerFromTransaction can extract the payer.
      // We use the @solana/kit encoders to build valid bytes.
      const {
        getBase64Encoder,
        getTransactionDecoder,
        getTransactionEncoder,
        getCompiledTransactionMessageEncoder,
      } = require("@solana/kit");

      const compiledMessage = {
        version: 0,
        header: {
          numSignerAccounts: 1,
          numReadonlySignerAccounts: 0,
          numReadonlyNonSignerAccounts: 2,
        },
        staticAccounts: [
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address, // fee payer / authority
          "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as Address, // source
          TOKEN_PROGRAM as Address, // token program
          USDC_DEVNET_ADDRESS as Address, // mint
          "11111111111111111111111111111111" as Address, // dest
        ],
        lifetimeToken: "11111111111111111111111111111111",
        instructions: [
          {
            programAddressIndex: 2,
            accountIndices: [1, 3, 4, 0], // source, mint, dest, authority
            data: new Uint8Array([12, 160, 134, 1, 0, 0, 0, 0, 0, 6]), // transferChecked 100000, 6 decimals
          },
        ],
        addressTableLookups: [],
      };

      const messageEncoder = getCompiledTransactionMessageEncoder();
      const messageBytes = messageEncoder.encode(compiledMessage);

      const mockTransaction: Transaction = {
        signatures: [new Uint8Array(64)],
        messageBytes,
      } as Transaction;

      const result = await normalizeTransaction(instructions, [], mockTransaction);
      expect(result.payer).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      // Instructions are passed through from the input
      expect(result.instructions).toHaveLength(3);
    });

    it("should throw when no normalizer can handle the transaction", async () => {
      // RegularNormalizer always canHandle, so this test verifies it throws
      // when the regular path can't find a payer (empty transaction)
      const instructions = [
        { programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS as Address, data: new Uint8Array([2, 0, 0, 0, 0]) },
      ];

      // Mock transaction with no token instructions → getTokenPayerFromTransaction returns ""
      const compiledMessage = {
        version: 0,
        header: {
          numSignerAccounts: 1,
          numReadonlySignerAccounts: 0,
          numReadonlyNonSignerAccounts: 0,
        },
        staticAccounts: [
          COMPUTE_BUDGET_PROGRAM_ADDRESS as Address,
        ],
        lifetimeToken: "11111111111111111111111111111111",
        instructions: [
          {
            programAddressIndex: 0,
            accountIndices: [],
            data: new Uint8Array([2, 0, 0, 0, 0]),
          },
        ],
        addressTableLookups: [],
      };

      const { getCompiledTransactionMessageEncoder } = require("@solana/kit");
      const messageEncoder = getCompiledTransactionMessageEncoder();
      const messageBytes = messageEncoder.encode(compiledMessage);

      const mockTransaction: Transaction = {
        signatures: [new Uint8Array(64)],
        messageBytes,
      } as Transaction;

      await expect(normalizeTransaction(instructions, [], mockTransaction)).rejects.toThrow(
        "invalid_exact_svm_payload_no_transfer_instruction",
      );
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
