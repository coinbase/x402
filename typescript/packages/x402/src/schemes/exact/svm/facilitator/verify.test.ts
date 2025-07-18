/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifySchemesAndNetworks,
  getValidatedTransferInstruction,
  verifyTransferDetails,
  verify,
} from "./verify";
import {
  KeyPairSigner,
  assertIsInstructionWithData,
  assertIsInstructionWithAccounts,
  decompileTransactionMessageFetchingLookupTables,
  fetchEncodedAccounts,
} from "@solana/kit";
import { PaymentPayload, PaymentRequirements, ExactSvmPayload } from "../../../../types/verify";
import { Network } from "../../../../types";
import { SCHEME } from "../../";
import * as SvmShared from "../../../../shared/svm";
import {
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
  identifyTokenInstruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstructionToken,
} from "@solana-program/token";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  Token2022Instruction,
  identifyToken2022Instruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstruction2022,
  findAssociatedTokenPda,
} from "@solana-program/token-2022";
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from "@solana-program/compute-budget";

vi.mock("@solana/kit", async () => {
  const actual = await vi.importActual("@solana/kit");
  return {
    ...actual,
    getBase64Encoder: vi.fn(),
    getTransactionDecoder: vi.fn(),
    assertIsInstructionWithData: vi.fn(),
    assertIsInstructionWithAccounts: vi.fn(),
    getCompiledTransactionMessageDecoder: vi.fn().mockReturnValue({ decode: vi.fn() }),
    decompileTransactionMessageFetchingLookupTables: vi.fn(),
    fetchEncodedAccounts: vi.fn(),
  };
});

vi.mock("@solana-program/token", async () => {
  const actual = await vi.importActual("@solana-program/token");
  return {
    ...actual,
    identifyTokenInstruction: vi.fn(),
    parseTransferCheckedInstruction: vi.fn(),
  };
});

vi.mock("@solana-program/token-2022", async () => {
  const actual = await vi.importActual("@solana-program/token-2022");
  return {
    ...actual,
    identifyToken2022Instruction: vi.fn(),
    parseTransferCheckedInstruction: vi.fn(),
    findAssociatedTokenPda: vi.fn(),
  };
});

vi.mock("@solana-program/compute-budget", async () => {
  const actual = await vi.importActual("@solana-program/compute-budget");
  return {
    ...actual,
    parseSetComputeUnitLimitInstruction: vi.fn(),
    parseSetComputeUnitPriceInstruction: vi.fn(),
  };
});

vi.mock("../../../../shared/svm", async () => {
  const actual = await vi.importActual("../../../../shared/svm");
  return {
    ...actual,
    decodeTransactionFromPayload: vi.fn(),
    getRpcClient: vi.fn(),
    signAndSimulateTransaction: vi.fn(),
  };
});

const devnetUSDCAddress = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

describe("verify", () => {
  describe("verifySchemesAndNetworks", () => {
    const validPayload: PaymentPayload = {
      scheme: SCHEME,
      network: "solana-devnet",
      x402Version: 1,
      payload: {
        transaction: "valid_transaction_string",
      } as ExactSvmPayload,
    };

    const validRequirements: PaymentRequirements = {
      scheme: SCHEME,
      network: "solana-devnet",
      payTo: "someAddress",
      maxAmountRequired: "1000",
      resource: "resource",
      description: "description",
      mimeType: "mimeType",
      maxTimeoutSeconds: 60,
      asset: "USDC",
    };

    it("should not throw an error for valid schemes and networks", () => {
      expect(() => verifySchemesAndNetworks(validPayload, validRequirements)).not.toThrow();
    });

    it("should throw an error for unsupported scheme in payload", () => {
      const invalidPayload = { ...validPayload, scheme: "unsupported" as "exact" };
      expect(() => verifySchemesAndNetworks(invalidPayload, validRequirements)).toThrow(
        "unsupported_scheme",
      );
    });

    it("should throw an error for unsupported scheme in requirements", () => {
      const invalidRequirements = { ...validRequirements, scheme: "unsupported" as "exact" };
      expect(() => verifySchemesAndNetworks(validPayload, invalidRequirements)).toThrow(
        "unsupported_scheme",
      );
    });

    it("should throw an error for mismatched networks", () => {
      const invalidPayload = { ...validPayload, network: "solana-mainnet" as Network };
      expect(() => verifySchemesAndNetworks(invalidPayload, validRequirements)).toThrow(
        "invalid_network",
      );
    });

    it("should throw an error for unsupported network in requirements", () => {
      const invalidRequirements = {
        ...validRequirements,
        network: "unsupported-network" as Network,
      };
      const invalidPayload = {
        ...validPayload,
        network: "unsupported-network" as Network,
      };
      expect(() => verifySchemesAndNetworks(invalidPayload, invalidRequirements)).toThrow(
        "invalid_network",
      );
    });
  });

  describe("getValidatedTransferInstruction", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(assertIsInstructionWithData).mockReturnValue(undefined);
      vi.mocked(assertIsInstructionWithAccounts).mockReturnValue(undefined);
    });

    it("should throw an error if instruction validation fails for data", () => {
      const mockInstruction = {};
      vi.mocked(assertIsInstructionWithData).mockImplementation(() => {
        throw new Error("Invalid instruction data");
      });
      expect(() => getValidatedTransferInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions",
      );
    });

    it("should throw an error if instruction validation fails for accounts", () => {
      const mockInstruction = {};
      vi.mocked(assertIsInstructionWithAccounts).mockImplementation(() => {
        throw new Error("Invalid instruction accounts");
      });
      expect(() => getValidatedTransferInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions",
      );
    });

    it("should throw an error for a non-transfer instruction", () => {
      const mockInstruction = { programAddress: { toString: () => "some_other_program" } };

      expect(() => getValidatedTransferInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_not_a_transfer_instruction",
      );
    });

    it("should throw if spl-token instruction is not TransferChecked", () => {
      const mockInstruction = {
        programAddress: { toString: () => TOKEN_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array(),
      };
      vi.mocked(identifyTokenInstruction).mockReturnValue("some_other_instruction" as any);

      expect(() => getValidatedTransferInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked",
      );
    });

    it("should throw if token-2022 instruction is not TransferChecked", () => {
      const mockInstruction = {
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array(),
      };
      vi.mocked(identifyToken2022Instruction).mockReturnValue("some_other_instruction" as any);

      expect(() => getValidatedTransferInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked",
      );
    });

    it("should return a valid tokenInstruction for a spl-token transfer", () => {
      const mockInstruction = {
        programAddress: { toString: () => TOKEN_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array(),
      };
      const mockParsedInstruction = { instruction: "parsed" };
      vi.mocked(identifyTokenInstruction).mockReturnValue(TokenInstruction.TransferChecked);
      vi.mocked(parseTransferCheckedInstructionToken).mockReturnValue(mockParsedInstruction as any);

      const result = getValidatedTransferInstruction(mockInstruction as any);

      expect(result).toEqual(mockParsedInstruction);
      expect(parseTransferCheckedInstructionToken).toHaveBeenCalledWith({
        ...mockInstruction,
        data: new Uint8Array(mockInstruction.data),
      });
    });

    it("should return a valid tokenInstruction for a token-2022 transfer", () => {
      const mockInstruction = {
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array(),
      };
      const mockParsedInstruction = { instruction: "parsed" };
      vi.mocked(identifyToken2022Instruction).mockReturnValue(Token2022Instruction.TransferChecked);
      vi.mocked(parseTransferCheckedInstruction2022).mockReturnValue(mockParsedInstruction as any);

      const result = getValidatedTransferInstruction(mockInstruction as any);

      expect(result).toEqual(mockParsedInstruction);
      expect(parseTransferCheckedInstruction2022).toHaveBeenCalledWith({
        ...mockInstruction,
        data: new Uint8Array(mockInstruction.data),
      });
    });
  });

  describe("verifyTransferDetails", () => {
    let mockTokenInstruction: any;
    let mockPaymentRequirements: PaymentRequirements;
    let mockRpc: any;

    beforeEach(() => {
      vi.clearAllMocks();
      mockTokenInstruction = {
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        accounts: {
          mint: { address: "mintAddress" },
          destination: { address: "destinationAta" },
          source: { address: "sourceAta" },
        },
        data: {
          amount: 1000n,
        },
      };
      mockPaymentRequirements = {
        scheme: SCHEME,
        network: "solana-devnet",
        payTo: "payToAddress",
        maxAmountRequired: "1000",
        resource: "resource",
        description: "description",
        mimeType: "mimeType",
        maxTimeoutSeconds: 60,
        asset: devnetUSDCAddress,
      };
      mockRpc = {}; // Mock rpc object

      vi.mocked(findAssociatedTokenPda).mockResolvedValue(["destinationAta"] as any);
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: true },
      ] as any);
    });

    it("should not throw for valid transfer details", async () => {
      await expect(
        verifyTransferDetails(mockTokenInstruction, mockPaymentRequirements, mockRpc),
      ).resolves.not.toThrow();
    });

    it("should throw for incorrect destination ATA", async () => {
      vi.mocked(findAssociatedTokenPda).mockResolvedValue(["incorrectAta"] as any);
      await expect(
        verifyTransferDetails(mockTokenInstruction, mockPaymentRequirements, mockRpc),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata");
    });

    it("should throw if receiver ATA is not found", async () => {
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: false },
      ] as any);
      await expect(
        verifyTransferDetails(mockTokenInstruction, mockPaymentRequirements, mockRpc),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_receiver_ata_not_found");
    });

    it("should throw if sender ATA is not found", async () => {
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: false },
        { address: "destinationAta", exists: true },
      ] as any);
      await expect(
        verifyTransferDetails(mockTokenInstruction, mockPaymentRequirements, mockRpc),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_sender_ata_not_found");
    });

    it("should throw for amount mismatch", async () => {
      mockPaymentRequirements.maxAmountRequired = "1001";
      await expect(
        verifyTransferDetails(mockTokenInstruction, mockPaymentRequirements, mockRpc),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_amount_mismatch");
    });
  });

  describe("verify high level flow", () => {
    let mockSigner: KeyPairSigner;
    let mockPayload: PaymentPayload;
    let mockRequirements: PaymentRequirements;
    let mockComputeLimitInstruction: any;
    let mockComputePriceInstruction: any;
    let mockTransferInstruction: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockSigner = {} as any;
      mockPayload = {
        scheme: SCHEME,
        network: "solana-devnet",
        x402Version: 1,
        payload: { transaction: "..." } as ExactSvmPayload,
      };
      mockRequirements = {
        scheme: SCHEME,
        network: "solana-devnet",
        payTo: "payToAddress",
        maxAmountRequired: "1000",
        asset: devnetUSDCAddress,
      } as any;
      mockComputeLimitInstruction = {
        programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array([2, 100, 25, 0, 0]),
      };
      mockComputePriceInstruction = {
        programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array([3, 232, 3, 0, 0, 0, 0, 0, 0]),
      };
      mockTransferInstruction = {
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array([TokenInstruction.TransferChecked, 1, 2, 3, 4, 5, 6, 7, 8, 1, 1]), // needs to be valid transfer checked data
        accounts: {
          mint: { address: "mintAddress" },
          destination: { address: "destinationAta" },
          source: { address: "sourceAta" },
        },
      };

      // mocks for happy path
      vi.mocked(SvmShared.decodeTransactionFromPayload).mockReturnValue({
        signatures: {},
        messageBytes: new Uint8Array(),
      } as any);
      vi.mocked(SvmShared.getRpcClient).mockReturnValue({} as any);
      vi.mocked(decompileTransactionMessageFetchingLookupTables).mockResolvedValue({
        instructions: [
          mockComputeLimitInstruction,
          mockComputePriceInstruction,
          mockTransferInstruction,
        ],
      } as any);
      vi.mocked(SvmShared.signAndSimulateTransaction).mockResolvedValue({
        value: { err: null },
      } as any);
      vi.mocked(findAssociatedTokenPda).mockResolvedValue(["destinationAta"] as any);
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: true },
      ] as any);
      vi.mocked(parseTransferCheckedInstruction2022).mockReturnValue({
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        accounts: {
          mint: { address: "mintAddress" },
          destination: { address: "destinationAta" },
          source: { address: "sourceAta" },
        },
        data: {
          amount: 1000n,
        },
      } as any);
      vi.mocked(identifyToken2022Instruction).mockReturnValue(Token2022Instruction.TransferChecked);
    });

    it("should return isValid: true for a valid transaction", async () => {
      const result = await verify(mockSigner, mockPayload, mockRequirements);
      expect(result.isValid).toBe(true);
    });

    it("should return isValid: false if schemes or networks are invalid", async () => {
      const invalidPayload = { ...mockPayload, scheme: "invalid" as "exact" };
      const result = await verify(mockSigner, invalidPayload, mockRequirements);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("should return isValid: false if transaction decoding fails", async () => {
      const error = new Error("invalid_exact_svm_payload_transaction");
      vi.mocked(SvmShared.decodeTransactionFromPayload).mockImplementation(() => {
        throw error;
      });
      const result = await verify(mockSigner, mockPayload, mockRequirements);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_svm_payload_transaction");
    });

    it("should return isValid: false if instruction validation fails", async () => {
      vi.mocked(decompileTransactionMessageFetchingLookupTables).mockResolvedValue({
        instructions: [mockTransferInstruction, mockTransferInstruction],
      } as any);
      const result = await verify(mockSigner, mockPayload, mockRequirements);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(
        "invalid_exact_svm_payload_transaction_instructions_length",
      );
    });

    it("should return isValid: false if transfer details verification fails", async () => {
      vi.mocked(findAssociatedTokenPda).mockResolvedValue(["incorrectAta"] as any);
      const result = await verify(mockSigner, mockPayload, mockRequirements);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(
        "invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata",
      );
    });

    it("should return isValid: false if simulation fails", async () => {
      vi.mocked(SvmShared.signAndSimulateTransaction).mockResolvedValue({
        value: { err: "simulation_error" },
      } as any);
      const result = await verify(mockSigner, mockPayload, mockRequirements);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_svm_payload_transaction_simulation_failed");
    });
  });
});
