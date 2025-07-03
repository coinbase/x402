/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Address, type KeyPairSigner, generateKeyPairSigner } from "@solana/kit";
import * as solanaKit from "@solana/kit";
import * as token2022 from "@solana-program/token-2022";
import * as token from "@solana-program/token";
import * as paymentUtils from "../../utils/paymentUtils";
import { PaymentRequirements } from "../../../types/verify";
import * as rpc from "../../../shared/svm/rpc";
import { createAndSignPayment, createPaymentHeader } from "./client";
import { NetworkEnum } from "../../../types/shared";

// Mocking dependencies
vi.mock("../../../shared/svm/rpc");
vi.mock("../../utils/paymentUtils");
vi.mock("@solana-program/token-2022", async importOriginal => {
  const actual = await importOriginal<typeof token2022>();
  return {
    ...actual,
    findAssociatedTokenPda: vi.fn(),
    getTransferCheckedInstruction: vi.fn().mockReturnValue({ instruction: "mock" }),
    fetchMint: vi.fn().mockResolvedValue({ data: { decimals: 9 } }),
  };
});
vi.mock("@solana-program/token", async importOriginal => {
  const actual = await importOriginal<typeof token>();
  return {
    ...actual,
    findAssociatedTokenPda: vi.fn(),
    getTransferCheckedInstruction: vi.fn().mockReturnValue({ instruction: "mock" }),
    fetchMint: vi.fn().mockResolvedValue({ data: { decimals: 9 } }),
  };
});
vi.mock("@solana/kit", async importOriginal => {
  const actual = await importOriginal<typeof solanaKit>();
  return {
    ...actual,
    partiallySignTransactionMessageWithSigners: vi.fn().mockResolvedValue("signed_tx_message"),
    getBase64EncodedWireTransaction: vi.fn().mockReturnValue("base64_encoded_tx"),
  };
});

describe("SVM Client", () => {
  let clientSigner: KeyPairSigner;
  let paymentRequirements: PaymentRequirements;

  beforeAll(async () => {
    clientSigner = await generateKeyPairSigner();
    const payToAddress = (await generateKeyPairSigner()).address;
    const assetAddress = (await generateKeyPairSigner()).address;
    const feePayerAddress = (await generateKeyPairSigner()).address;
    paymentRequirements = {
      scheme: "exact",
      network: NetworkEnum.SOLANA_DEVNET,
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createAndSignPayment", () => {
    it("should create and sign a payment payload correctly", async () => {
      // Arrange
      const mockRpcClient = {
        getLatestBlockhash: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              blockhash: "mockBlockhash",
              lastValidBlockHeight: 1234,
            },
          }),
        }),
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: token.TOKEN_PROGRAM_ADDRESS,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);
      vi.spyOn(token, "findAssociatedTokenPda")
        .mockResolvedValueOnce(["sourceATA" as Address, 1 as any])
        .mockResolvedValueOnce(["destinationATA" as Address, 1 as any]);

      const mockedPartiallySign = vi.spyOn(solanaKit, "partiallySignTransactionMessageWithSigners");
      const mockedToBase64 = vi.spyOn(solanaKit, "getBase64EncodedWireTransaction");

      // Act
      const paymentPayload = await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(rpc.getRpcClient).toHaveBeenCalledWith("solana-devnet");
      expect(mockRpcClient.getLatestBlockhash).toHaveBeenCalledOnce();
      expect(token.findAssociatedTokenPda).toHaveBeenCalledTimes(2);
      expect(token.getTransferCheckedInstruction).toHaveBeenCalledOnce();
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

    it("should create and sign a payment for a token-2022 token", async () => {
      // Arrange
      const mockRpcClient = {
        getLatestBlockhash: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              blockhash: "mockBlockhash",
              lastValidBlockHeight: 1234,
            },
          }),
        }),
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: token2022.TOKEN_2022_PROGRAM_ADDRESS,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);
      vi.spyOn(token2022, "findAssociatedTokenPda")
        .mockResolvedValueOnce(["sourceATA" as Address, 1 as any])
        .mockResolvedValueOnce(["destinationATA" as Address, 1 as any]);

      const mockedPartiallySign = vi.spyOn(solanaKit, "partiallySignTransactionMessageWithSigners");
      const mockedToBase64 = vi.spyOn(solanaKit, "getBase64EncodedWireTransaction");

      // Act
      const paymentPayload = await createAndSignPayment(clientSigner, 1, paymentRequirements);

      // Assert
      expect(rpc.getRpcClient).toHaveBeenCalledWith("solana-devnet");
      expect(mockRpcClient.getLatestBlockhash).toHaveBeenCalledOnce();
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
      const mockRpcClient = {
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: "someotherprogram" as any,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);

      // Act & Assert
      await expect(createAndSignPayment(clientSigner, 1, paymentRequirements)).rejects.toThrow(
        "Asset was not created by a known token program",
      );
    });
  });

  describe("createPaymentHeader", () => {
    it("should create a payment header string", async () => {
      // Arrange
      const mockRpcClient = {
        getLatestBlockhash: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              blockhash: "mockBlockhash",
              lastValidBlockHeight: 1234,
            },
          }),
        }),
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: token.TOKEN_PROGRAM_ADDRESS,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);
      vi.spyOn(token, "findAssociatedTokenPda")
        .mockResolvedValueOnce(["sourceATA" as Address, 1 as any])
        .mockResolvedValueOnce(["destinationATA" as Address, 1 as any]);
      vi.spyOn(paymentUtils, "encodePayment").mockReturnValue("encoded_payment_header");

      // Act
      const header = await createPaymentHeader(clientSigner, 1, paymentRequirements);

      // Assert
      expect(paymentUtils.encodePayment).toHaveBeenCalledOnce();
      expect(header).toBe("encoded_payment_header");
    });

    it("should handle different x402 versions", async () => {
      // Arrange
      const mockRpcClient = {
        getLatestBlockhash: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              blockhash: "mockBlockhash",
              lastValidBlockHeight: 1234,
            },
          }),
        }),
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: token.TOKEN_PROGRAM_ADDRESS,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);
      vi.spyOn(token, "findAssociatedTokenPda")
        .mockResolvedValueOnce(["sourceATA" as Address, 1 as any])
        .mockResolvedValueOnce(["destinationATA" as Address, 1 as any]);
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
      const mockRpcClient = {
        getLatestBlockhash: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              blockhash: "mockBlockhash",
              lastValidBlockHeight: 1234,
            },
          }),
        }),
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: token.TOKEN_PROGRAM_ADDRESS,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);
      vi.spyOn(token, "findAssociatedTokenPda")
        .mockResolvedValueOnce(["sourceATA" as Address, 1 as any])
        .mockResolvedValueOnce(["destinationATA" as Address, 1 as any]);
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
      const mockRpcClient = {
        getLatestBlockhash: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              blockhash: "mockBlockhash",
              lastValidBlockHeight: 1234,
            },
          }),
        }),
        getAccountInfo: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: token.TOKEN_PROGRAM_ADDRESS,
            },
          }),
        }),
      };
      vi.spyOn(rpc, "getRpcClient").mockReturnValue(mockRpcClient as any);
      vi.spyOn(token, "findAssociatedTokenPda")
        .mockResolvedValueOnce(["sourceATA" as Address, 1 as any])
        .mockResolvedValueOnce(["destinationATA" as Address, 1 as any]);
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
});
