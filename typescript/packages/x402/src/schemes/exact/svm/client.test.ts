/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi, beforeEach } from "vitest";
import { type Address, type KeyPairSigner, generateKeyPairSigner, lamports } from "@solana/kit";
import * as solanaKit from "@solana/kit";
import * as token2022 from "@solana-program/token-2022";
import * as token from "@solana-program/token";
import * as computeBudget from "@solana-program/compute-budget";
import * as paymentUtils from "../../utils/paymentUtils";
import { PaymentRequirements } from "../../../types/verify";
import * as rpc from "../../../shared/svm/rpc";
import { createAndSignPayment, createPaymentHeader } from "./client";

// Mocking dependencies
vi.mock("../../../shared/svm/rpc");
vi.mock("../../utils/paymentUtils");
vi.mock("@solana-program/token-2022", async importOriginal => {
  const actual = await importOriginal<typeof token2022>();
  return {
    ...actual,
    findAssociatedTokenPda: vi.fn(),
    getTransferCheckedInstruction: vi.fn().mockReturnValue({ instruction: "mock" }),
    fetchMint: vi.fn(),
  };
});
vi.mock("@solana-program/token", async importOriginal => {
  const actual = await importOriginal<typeof token>();
  return {
    ...actual,
    findAssociatedTokenPda: vi.fn(),
    getTransferCheckedInstruction: vi.fn().mockReturnValue({ instruction: "mock" }),
  };
});
vi.mock("@solana/kit", async importOriginal => {
  const actual = await importOriginal<typeof solanaKit>();
  return {
    ...actual,
    createTransactionMessage: vi.fn().mockReturnValue({ version: 0, instructions: [] }),
    setTransactionMessageFeePayer: vi.fn().mockImplementation((_payer, tx) => tx),
    setTransactionMessageLifetimeUsingBlockhash: vi.fn().mockImplementation((_bh, tx) => tx),
    appendTransactionMessageInstructions: vi.fn().mockImplementation((_ixs, tx) => tx),
    prependTransactionMessageInstruction: vi.fn().mockImplementation((_ix, tx) => tx),
    partiallySignTransactionMessageWithSigners: vi.fn().mockResolvedValue("signed_tx_message"),
    getBase64EncodedWireTransaction: vi.fn().mockReturnValue("base64_encoded_tx"),
  };
});
vi.mock("@solana-program/compute-budget", async importOriginal => {
  const actual = await importOriginal<typeof computeBudget>();
  return {
    ...actual,
    getSetComputeUnitLimitInstruction: vi.fn().mockReturnValue({ instruction: "mock" }),
    setTransactionMessageComputeUnitPrice: vi.fn().mockImplementation((_price, tx) => tx),
    estimateComputeUnitLimitFactory: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(1000)),
  };
});

describe("SVM Client", () => {
  let clientSigner: KeyPairSigner;
  let paymentRequirements: PaymentRequirements;
  const mockRpcClient = {
    getLatestBlockhash: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue({
        value: {
          blockhash: "mockBlockhash",
          lastValidBlockHeight: 1234,
        },
      }),
    }),
    getRecentPrioritizationFees: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue([]),
    }),
    getAccountInfo: vi.fn(),
  };

  beforeAll(async () => {
    clientSigner = await generateKeyPairSigner();
    const payToAddress = (await generateKeyPairSigner()).address;
    const assetAddress = (await generateKeyPairSigner()).address;
    const feePayerAddress = (await generateKeyPairSigner()).address;
    paymentRequirements = {
      scheme: "exact",
      network: "solana-devnet",
      payTo: payToAddress,
      asset: assetAddress,
      maxAmountRequired: "1000",
      resource: "http://example.com/resource",
      description: "Test description",
      mimeType: "text/plain",
      maxTimeoutSeconds: 60,
      extra: {
        feePayer: feePayerAddress,
      },
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock RPC client
    vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);

    // Mock fetchMint to determine token program
    vi.spyOn(token2022, "fetchMint").mockImplementation(async (_rpc, address) => {
      if (address === paymentRequirements.asset) {
        return {
          address: address,
          programAddress: token.TOKEN_PROGRAM_ADDRESS,
          executable: false,
          lamports: lamports(1000n),
          space: 165n,
          data: {
            mintAuthority: null,
            supply: 0n,
            decimals: 6,
            isInitialized: true,
            freezeAuthority: null,
            extensions: [],
          },
        } as any;
      }
      throw new Error("Mint not found");
    });

    // Mock ATAs for both token programs
    vi.spyOn(token, "findAssociatedTokenPda").mockResolvedValue(["sourceATA" as Address, 1 as any]);
    vi.spyOn(token2022, "findAssociatedTokenPda").mockResolvedValue([
      "sourceATA" as Address,
      1 as any,
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createAndSignPayment", () => {
    it("should create and sign a payment for a spl-token token", async () => {
      // Arrange
      const mockedPartiallySign = vi.spyOn(solanaKit, "partiallySignTransactionMessageWithSigners");
      const mockedToBase64 = vi.spyOn(solanaKit, "getBase64EncodedWireTransaction");

      // Act
      const paymentPayload = await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(rpc.getRpcClient).toHaveBeenCalledWith("solana-devnet");
      expect(mockRpcClient.getLatestBlockhash).toHaveBeenCalledOnce(); // blockhash required for tx
      expect(mockRpcClient.getRecentPrioritizationFees).toHaveBeenCalledOnce(); // get compute unit price
      expect(token.findAssociatedTokenPda).toHaveBeenCalledTimes(2); // find sender and receiver ATA
      expect(token.getTransferCheckedInstruction).toHaveBeenCalledOnce(); // transfer instruction
      expect(mockedPartiallySign).toHaveBeenCalledOnce(); // partially sign tx
      expect(mockedToBase64).toHaveBeenCalledWith("signed_tx_message"); // base64 encode tx
      expect(paymentPayload).toEqual({
        scheme: "exact",
        network: "solana-devnet",
        x402Version: 1,
        payload: {
          transaction: "base64_encoded_tx",
        },
      });
    });

    it("should create and sign a payment for a token-2022 token", async () => {
      // Arrange
      // Override the default fetchMint mock for this test
      vi.spyOn(token2022, "fetchMint").mockResolvedValue({
        address: paymentRequirements.asset as Address,
        programAddress: token2022.TOKEN_2022_PROGRAM_ADDRESS,
        executable: false,
        lamports: lamports(1000n),
        space: 165n,
        data: {
          mintAuthority: null,
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          freezeAuthority: null,
          extensions: [],
        },
      } as any);

      const mockedPartiallySign = vi.spyOn(solanaKit, "partiallySignTransactionMessageWithSigners");
      const mockedToBase64 = vi.spyOn(solanaKit, "getBase64EncodedWireTransaction");

      // Act
      const paymentPayload = await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(rpc.getRpcClient).toHaveBeenCalledWith("solana-devnet");
      expect(mockRpcClient.getLatestBlockhash).toHaveBeenCalledOnce();
      expect(mockRpcClient.getRecentPrioritizationFees).toHaveBeenCalledOnce();
      expect(token2022.findAssociatedTokenPda).toHaveBeenCalledTimes(2);
      expect(token2022.getTransferCheckedInstruction).toHaveBeenCalledOnce();
      expect(mockedPartiallySign).toHaveBeenCalledOnce();
      expect(mockedToBase64).toHaveBeenCalledWith("signed_tx_message");
      expect(paymentPayload).toEqual({
        scheme: "exact",
        network: "solana-devnet",
        x402Version: 1,
        payload: {
          transaction: "base64_encoded_tx",
        },
      });
    });

    it("should throw an error if asset is not from a known token program", async () => {
      // Arrange
      // Override the default fetchMint mock for this test
      vi.spyOn(token2022, "fetchMint").mockResolvedValue({
        address: paymentRequirements.asset as Address,
        programAddress: "someotherprogram" as any,
        executable: false,
        lamports: lamports(1000n),
        space: 165n,
        data: {} as any,
      });

      // Act & Assert
      await expect(createAndSignPayment(clientSigner, 1, paymentRequirements)).rejects.toThrow(
        "Asset was not created by a known token program",
      );
    });
  });

  describe("createPaymentHeader", () => {
    it("should create a payment header string", async () => {
      // Arrange
      vi.spyOn(paymentUtils, "encodePayment").mockReturnValue("encoded_payment_header");

      // Act
      const header = await createPaymentHeader(clientSigner, 1, paymentRequirements);

      // Assert
      expect(paymentUtils.encodePayment).toHaveBeenCalledOnce();
      expect(header).toBe("encoded_payment_header");
    });

    it("should handle different x402 versions", async () => {
      // Arrange
      const encodePaymentSpy = vi
        .spyOn(paymentUtils, "encodePayment")
        .mockReturnValue("encoded_payment_header");

      // Act
      await createPaymentHeader(clientSigner, 2, paymentRequirements);

      // Assert
      expect(encodePaymentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          x402Version: 2,
        }),
      );
    });

    it("should throw an error if signing fails", async () => {
      // Arrange
      vi.spyOn(solanaKit, "partiallySignTransactionMessageWithSigners").mockRejectedValue(
        new Error("Signing failed"),
      );

      // Act & Assert
      await expect(createPaymentHeader(clientSigner, 1, paymentRequirements)).rejects.toThrow(
        "Signing failed",
      );
    });

    it("should throw an error if encoding fails", async () => {
      // Arrange
      vi.spyOn(solanaKit, "partiallySignTransactionMessageWithSigners").mockResolvedValue(
        "signed_tx_message" as any,
      );
      vi.spyOn(paymentUtils, "encodePayment").mockImplementation(() => {
        throw new Error("Encoding failed");
      });

      // Act & Assert
      await expect(createPaymentHeader(clientSigner, 1, paymentRequirements)).rejects.toThrow(
        "Encoding failed",
      );
    });
  });

  describe("getComputeUnitLimit", () => {
    it("should estimate and set the compute unit limit", async () => {
      // Arrange
      const estimateComputeUnitLimitMock = vi.fn().mockResolvedValue(200000);
      vi.spyOn(computeBudget, "estimateComputeUnitLimitFactory").mockReturnValue(
        estimateComputeUnitLimitMock,
      );
      const setComputeUnitLimitSpy = vi.spyOn(computeBudget, "getSetComputeUnitLimitInstruction");

      // Act
      await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(estimateComputeUnitLimitMock).toHaveBeenCalledOnce();
      expect(setComputeUnitLimitSpy).toHaveBeenCalledWith({ units: 200000 });
    });
  });

  describe("getComputeUnitPrice", () => {
    it("should return default price when no recent fees are available", async () => {
      // Arrange
      mockRpcClient.getRecentPrioritizationFees.mockReturnValue({
        send: vi.fn().mockResolvedValue([]),
      });
      const computePriceSpy = vi.spyOn(computeBudget, "setTransactionMessageComputeUnitPrice");

      // Act
      await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(mockRpcClient.getRecentPrioritizationFees).toHaveBeenCalledOnce();
      expect(computePriceSpy).toHaveBeenCalledWith(10_000_000, expect.any(Object));
    });

    it("should calculate the 90th percentile price correctly", async () => {
      // Arrange
      const fees = [
        { prioritizationFee: 1000, slot: 1 },
        { prioritizationFee: 2000, slot: 2 },
        { prioritizationFee: 3000, slot: 3 },
        { prioritizationFee: 4000, slot: 4 },
        { prioritizationFee: 5000, slot: 5 },
        { prioritizationFee: 6000, slot: 6 },
        { prioritizationFee: 7000, slot: 7 },
        { prioritizationFee: 8000, slot: 8 },
        { prioritizationFee: 9000, slot: 9 },
        { prioritizationFee: 10000, slot: 10 },
      ];
      mockRpcClient.getRecentPrioritizationFees.mockReturnValue({
        send: vi.fn().mockResolvedValue(fees),
      });
      const computePriceSpy = vi.spyOn(computeBudget, "setTransactionMessageComputeUnitPrice");

      // Act
      await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(mockRpcClient.getRecentPrioritizationFees).toHaveBeenCalledOnce();
      expect(computePriceSpy).toHaveBeenCalledWith(9000, expect.any(Object));
    });

    it("should return default price when calculated percentile is zero", async () => {
      // Arrange
      const fees = [{ prioritizationFee: 0, slot: 1 }];
      mockRpcClient.getRecentPrioritizationFees.mockReturnValue({
        send: vi.fn().mockResolvedValue(fees),
      });
      const computePriceSpy = vi.spyOn(computeBudget, "setTransactionMessageComputeUnitPrice");

      // Act
      await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(mockRpcClient.getRecentPrioritizationFees).toHaveBeenCalledOnce();
      expect(computePriceSpy).toHaveBeenCalledWith(10_000_000, expect.any(Object));
    });
  });

  describe("createTransferInstruction", () => {
    it("should use token program for spl-token", async () => {
      // Arrange
      vi.spyOn(token, "getTransferCheckedInstruction").mockReturnValue({} as any);

      // Act
      await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(token.getTransferCheckedInstruction).toHaveBeenCalledOnce();
      expect(token2022.getTransferCheckedInstruction).not.toHaveBeenCalled();
    });

    it("should use token-2022 program for token-2022 token", async () => {
      // Arrange
      vi.spyOn(token2022, "fetchMint").mockResolvedValue({
        address: paymentRequirements.asset as Address,
        programAddress: token2022.TOKEN_2022_PROGRAM_ADDRESS,
        data: { decimals: 6 },
      } as any);
      vi.spyOn(token2022, "getTransferCheckedInstruction").mockReturnValue({} as any);

      // Act
      await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(token2022.getTransferCheckedInstruction).toHaveBeenCalledOnce();
      expect(token.getTransferCheckedInstruction).not.toHaveBeenCalled();
    });
  });
});
