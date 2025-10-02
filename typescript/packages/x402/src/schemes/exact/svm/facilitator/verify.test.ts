/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifySchemesAndNetworks,
  getValidatedTransferCheckedInstruction,
  verifyTransferCheckedInstruction,
  verify,
  verifyTransactionInstructions,
  verifyComputeLimitInstruction,
  verifyComputePriceInstruction,
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
  parseCreateAssociatedTokenInstruction,
} from "@solana-program/token-2022";
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from "@solana-program/compute-budget";
import {
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";

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
    parseCreateAssociatedTokenInstruction: vi.fn(),
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
      const invalidPayload = { ...validPayload, network: "solana" as Network };
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

  describe("getValidatedTransferCheckedInstruction", () => {
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
      expect(() => getValidatedTransferCheckedInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions",
      );
    });

    it("should throw an error if instruction validation fails for accounts", () => {
      const mockInstruction = {};
      vi.mocked(assertIsInstructionWithAccounts).mockImplementation(() => {
        throw new Error("Invalid instruction accounts");
      });
      expect(() => getValidatedTransferCheckedInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions",
      );
    });

    it("should throw an error for a non-transfer instruction", () => {
      const mockInstruction = { programAddress: { toString: () => "some_other_program" } };

      expect(() => getValidatedTransferCheckedInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_not_a_transfer_instruction",
      );
    });

    it("should throw if spl-token instruction is not TransferChecked", () => {
      const mockInstruction = {
        programAddress: { toString: () => TOKEN_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array(),
      };
      vi.mocked(identifyTokenInstruction).mockReturnValue("some_other_instruction" as any);

      expect(() => getValidatedTransferCheckedInstruction(mockInstruction as any)).toThrow(
        "invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked",
      );
    });

    it("should throw if token-2022 instruction is not TransferChecked", () => {
      const mockInstruction = {
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array(),
      };
      vi.mocked(identifyToken2022Instruction).mockReturnValue("some_other_instruction" as any);

      expect(() => getValidatedTransferCheckedInstruction(mockInstruction as any)).toThrow(
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

      const result = getValidatedTransferCheckedInstruction(mockInstruction as any);

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

      const result = getValidatedTransferCheckedInstruction(mockInstruction as any);

      expect(result).toEqual(mockParsedInstruction);
      expect(parseTransferCheckedInstruction2022).toHaveBeenCalledWith({
        ...mockInstruction,
        data: new Uint8Array(mockInstruction.data),
      });
    });
  });

  describe("verifyTransferCheckedInstruction", () => {
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
      vi.mocked(SvmShared.getRpcClient).mockReturnValue(mockRpc);
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: true },
      ] as any);
    });

    it("should not throw for valid transfer details", async () => {
      await expect(
        verifyTransferCheckedInstruction(mockTokenInstruction, mockPaymentRequirements, {
          txHasCreateDestATAInstruction: false,
        }),
      ).resolves.not.toThrow();
    });

    it("should throw for incorrect destination ATA", async () => {
      vi.mocked(findAssociatedTokenPda).mockResolvedValue(["incorrectAta"] as any);
      await expect(
        verifyTransferCheckedInstruction(mockTokenInstruction, mockPaymentRequirements, {
          txHasCreateDestATAInstruction: false,
        }),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata");
    });

    it("should throw if receiver ATA is not found", async () => {
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: false },
      ] as any);
      await expect(
        verifyTransferCheckedInstruction(mockTokenInstruction, mockPaymentRequirements, {
          txHasCreateDestATAInstruction: false,
        }),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_receiver_ata_not_found");
    });

    it("should throw if sender ATA is not found", async () => {
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: false },
        { address: "destinationAta", exists: true },
      ] as any);
      await expect(
        verifyTransferCheckedInstruction(mockTokenInstruction, mockPaymentRequirements, {
          txHasCreateDestATAInstruction: false,
        }),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_sender_ata_not_found");
    });

    it("should throw for amount mismatch", async () => {
      mockPaymentRequirements.maxAmountRequired = "1001";
      await expect(
        verifyTransferCheckedInstruction(mockTokenInstruction, mockPaymentRequirements, {
          txHasCreateDestATAInstruction: false,
        }),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_amount_mismatch");
    });

    it("should not throw if receiver ATA is not found but tx has create ATA instruction", async () => {
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: false },
      ] as any);
      await expect(
        verifyTransferCheckedInstruction(mockTokenInstruction, mockPaymentRequirements, {
          txHasCreateDestATAInstruction: true,
        }),
      ).resolves.not.toThrow();
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
        data: new Uint8Array([3, 1, 0, 0, 0, 0, 0, 0, 0]),
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
      vi.mocked(parseSetComputeUnitPriceInstruction).mockReturnValue({
        data: {
          discriminator: 3,
          microLamports: 1n,
        },
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

  describe("verifyTransactionInstructions", () => {
    let mockTransactionMessage: any;
    let mockPaymentRequirements: PaymentRequirements;
    let mockComputeLimitInstruction: any;
    let mockComputePriceInstruction: any;
    let mockTransferInstruction: any;
    let mockCreateATAInstruction: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockPaymentRequirements = {
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
        data: new Uint8Array([3, 1, 0, 0, 0, 0, 0, 0, 0]),
      };
      mockTransferInstruction = {
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array([3, 1, 2, 3, 4, 5, 6, 7, 8, 1, 1]), // TransferChecked is 3
        accounts: {
          mint: { address: devnetUSDCAddress },
          destination: { address: "destinationAta" },
          source: { address: "sourceAta" },
        },
      };
      mockCreateATAInstruction = {
        programAddress: { toString: () => "AssociatedTokenAccountProgram" },
        accounts: {
          owner: { address: "payToAddress" },
          mint: { address: devnetUSDCAddress },
        },
        data: new Uint8Array(),
      };

      vi.mocked(parseTransferCheckedInstruction2022).mockReturnValue({
        programAddress: { toString: () => TOKEN_2022_PROGRAM_ADDRESS.toString() },
        accounts: {
          mint: { address: devnetUSDCAddress },
          destination: { address: "destinationAta" },
          source: { address: "sourceAta" },
        },
        data: { amount: 1000n },
      } as any);
      vi.mocked(identifyToken2022Instruction).mockReturnValue(Token2022Instruction.TransferChecked);
      vi.mocked(findAssociatedTokenPda).mockResolvedValue(["destinationAta"] as any);
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: true },
      ] as any);
      vi.mocked(SvmShared.getRpcClient).mockReturnValue({} as any);
      vi.mocked(parseCreateAssociatedTokenInstruction).mockReturnValue({
        accounts: {
          owner: { address: "payToAddress" },
          mint: { address: devnetUSDCAddress },
        },
      } as any);
    });

    it("should throw an error if the transaction has less than 3 instructions", async () => {
      mockTransactionMessage = {
        instructions: [mockComputeLimitInstruction, mockComputePriceInstruction],
      };

      await expect(
        verifyTransactionInstructions(mockTransactionMessage, mockPaymentRequirements),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_instructions_length");
    });

    it("should throw an error if the transaction has more than 4 instructions", async () => {
      mockTransactionMessage = {
        instructions: [
          mockComputeLimitInstruction,
          mockComputePriceInstruction,
          mockCreateATAInstruction,
          mockTransferInstruction,
          mockTransferInstruction,
        ],
      };

      await expect(
        verifyTransactionInstructions(mockTransactionMessage, mockPaymentRequirements),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_instructions_length");
    });

    it("should throw an error if the tx has 3 instructions and the destination ATA does not exist", async () => {
      mockTransactionMessage = {
        instructions: [
          mockComputeLimitInstruction,
          mockComputePriceInstruction,
          mockTransferInstruction,
        ],
      };

      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: false },
      ] as any);

      await expect(
        verifyTransactionInstructions(mockTransactionMessage, mockPaymentRequirements),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_receiver_ata_not_found");
    });

    it("should throw if the 3rd instruction in a 4-instruction tx is not a create ATA instruction", async () => {
      mockTransactionMessage = {
        instructions: [
          mockComputeLimitInstruction,
          mockComputePriceInstruction,
          mockTransferInstruction,
          mockTransferInstruction,
        ],
      };

      vi.mocked(parseCreateAssociatedTokenInstruction).mockImplementation(() => {
        throw new Error("not a create ata ix");
      });

      await expect(
        verifyTransactionInstructions(mockTransactionMessage, mockPaymentRequirements),
      ).rejects.toThrow("invalid_exact_svm_payload_transaction_create_ata_instruction");
    });

    it("should not throw if the tx has 4 instructions and the 3rd is a create ATA instruction", async () => {
      vi.mocked(fetchEncodedAccounts).mockResolvedValue([
        { address: "sourceAta", exists: true },
        { address: "destinationAta", exists: false },
      ] as any);

      mockTransactionMessage = {
        instructions: [
          mockComputeLimitInstruction,
          mockComputePriceInstruction,
          mockCreateATAInstruction,
          mockTransferInstruction,
        ],
      };

      await expect(
        verifyTransactionInstructions(mockTransactionMessage, mockPaymentRequirements),
      ).resolves.not.toThrow();
    });
  });

  describe("verifyComputeLimitInstruction", () => {
    let mockInstruction: any;

    beforeEach(() => {
      vi.clearAllMocks();
      mockInstruction = {
        programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array([2, 100, 25, 0, 0]),
      };
      vi.mocked(parseSetComputeUnitLimitInstruction).mockReturnValue({} as any);
    });

    it("should not throw for a valid compute limit instruction", () => {
      expect(() => verifyComputeLimitInstruction(mockInstruction)).not.toThrow();
    });

    it("should throw if the program address is incorrect", () => {
      mockInstruction.programAddress = { toString: () => "incorrect_program_address" };
      expect(() => verifyComputeLimitInstruction(mockInstruction)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
      );
    });

    it("should throw if the instruction discriminator is incorrect", () => {
      mockInstruction.data = new Uint8Array([99, 100, 25, 0, 0]);
      expect(() => verifyComputeLimitInstruction(mockInstruction)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
      );
    });

    it("should throw if parseSetComputeUnitLimitInstruction throws", () => {
      vi.mocked(parseSetComputeUnitLimitInstruction).mockImplementation(() => {
        throw new Error("parsing failed");
      });
      expect(() => verifyComputeLimitInstruction(mockInstruction)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
      );
    });
  });

  describe("verifyComputePriceInstruction", () => {
    let mockInstruction: any;

    beforeEach(() => {
      vi.clearAllMocks();
      mockInstruction = {
        programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() },
        data: new Uint8Array([3, 1, 0, 0, 0, 0, 0, 0, 0]),
      };
      vi.mocked(parseSetComputeUnitPriceInstruction).mockReturnValue({
        data: {
          discriminator: 3,
          microLamports: 1n,
        },
      } as any);
    });

    it("should not throw for a valid compute price instruction", () => {
      expect(() => verifyComputePriceInstruction(mockInstruction)).not.toThrow();
    });

    it("should throw if the program address is incorrect", () => {
      mockInstruction.programAddress = { toString: () => "incorrect_program_address" };
      expect(() => verifyComputePriceInstruction(mockInstruction)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
      );
    });

    it("should throw if the instruction discriminator is incorrect", () => {
      mockInstruction.data = new Uint8Array([99, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(() => verifyComputePriceInstruction(mockInstruction)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
      );
    });

    it("should throw if parseSetComputeUnitPriceInstruction throws", () => {
      vi.mocked(parseSetComputeUnitPriceInstruction).mockImplementation(() => {
        throw new Error("parsing failed");
      });
      expect(() => verifyComputePriceInstruction(mockInstruction)).toThrow("parsing failed");
    });

    it("should throw if the compute unit price is greater than 5 lamports", () => {
      // Arrange
      vi.mocked(parseSetComputeUnitPriceInstruction).mockReturnValue({
        data: {
          discriminator: 3,
          microLamports: 5_000_001n,
        },
      } as any);

      // Act & Assert
      expect(() => verifyComputePriceInstruction(mockInstruction)).toThrow(
        "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
      );
    });
  });
});
