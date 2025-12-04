import { describe, it, expect, vi, beforeAll } from "vitest";
import { generateKeyPairSigner, type TransactionSigner } from "@solana/kit";
import { createPaymentHeader } from "./createPaymentHeader";
import { PaymentRequirements } from "../types/verify";
import * as exactSvmClient from "../schemes/exact/svm/client";
import * as exactStellarClient from "../schemes/exact/stellar/client";
import { createStellarSigner, type Ed25519Signer } from "../shared/stellar/signer";

vi.mock("../schemes/exact/svm/client", () => ({
  createPaymentHeader: vi.fn(),
}));

vi.mock("../schemes/exact/stellar/client", () => ({
  createPaymentHeader: vi.fn(),
}));

describe("createPaymentHeader", () => {
  let svmSigner: TransactionSigner;
  let paymentRequirements: PaymentRequirements;

  beforeAll(async () => {
    svmSigner = await generateKeyPairSigner();
    const payToAddress = (await generateKeyPairSigner()).address;
    const assetAddress = (await generateKeyPairSigner()).address;

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
        feePayer: svmSigner.address,
      },
    };
  });

  describe("Custom RPC Configuration", () => {
    it("should propagate config to exact SVM client", async () => {
      // Arrange
      const customRpcUrl = "http://localhost:8899";
      const config = { svmConfig: { rpcUrl: customRpcUrl } };
      vi.mocked(exactSvmClient.createPaymentHeader).mockResolvedValue("mock_payment_header");

      // Act
      await createPaymentHeader(svmSigner, 1, paymentRequirements, config);

      // Assert
      expect(exactSvmClient.createPaymentHeader).toHaveBeenCalledWith(
        svmSigner,
        1,
        paymentRequirements,
        config,
      );
    });

    it("should call exact SVM client without config when not provided", async () => {
      // Arrange
      vi.mocked(exactSvmClient.createPaymentHeader).mockResolvedValue("mock_payment_header");

      // Act
      await createPaymentHeader(svmSigner, 1, paymentRequirements);

      // Assert
      expect(exactSvmClient.createPaymentHeader).toHaveBeenCalledWith(
        svmSigner,
        1,
        paymentRequirements,
        undefined,
      );
    });

    it("should call exact SVM client with empty config object", async () => {
      // Arrange
      const config = {};
      vi.mocked(exactSvmClient.createPaymentHeader).mockResolvedValue("mock_payment_header");

      // Act
      await createPaymentHeader(svmSigner, 1, paymentRequirements, config);

      // Assert
      expect(exactSvmClient.createPaymentHeader).toHaveBeenCalledWith(
        svmSigner,
        1,
        paymentRequirements,
        config,
      );
    });
  });
});

describe("createPaymentHeader - Stellar", () => {
  let stellarSigner: Ed25519Signer;
  let stellarPaymentRequirements: PaymentRequirements;

  beforeAll(() => {
    const stellarSecret = "SBV2U36KUM4S36MMQKMAATHKVRWPPXEH7QHEOSMVS5734VSINOBA7XWF";
    stellarSigner = createStellarSigner(stellarSecret, "stellar-testnet");
    const stellarPayToAddress = "GANA6NKADSJ5URCKWMHVH6IL6PU6ISVSOYBXJU625TB4UH35JR2ZUZNU";
    const stellarAssetAddress = "GC25XI5OZQ5HZCNI37JPNFMYLXI3DLCJ4RG4FC6LARGOMDERQ2RLCSIU";

    stellarPaymentRequirements = {
      scheme: "exact",
      network: "stellar-testnet",
      payTo: stellarPayToAddress,
      asset: stellarAssetAddress,
      maxAmountRequired: "1000000",
      resource: "http://example.com/resource",
      description: "Test description",
      mimeType: "text/plain",
      maxTimeoutSeconds: 60,
    };
  });

  describe("Custom RPC Configuration", () => {
    it("should propagate config to exact Stellar client", async () => {
      // Arrange
      const customRpcUrl = "http://localhost:8000";
      const config = { stellarConfig: { rpcUrl: customRpcUrl } };
      vi.mocked(exactStellarClient.createPaymentHeader).mockResolvedValue("mock_payment_header");

      // Act
      await createPaymentHeader(stellarSigner, 1, stellarPaymentRequirements, config);

      // Assert
      expect(exactStellarClient.createPaymentHeader).toHaveBeenCalledWith(
        stellarSigner,
        1,
        stellarPaymentRequirements,
        config,
      );
    });

    it("should call exact Stellar client without config when not provided", async () => {
      // Arrange
      vi.mocked(exactStellarClient.createPaymentHeader).mockResolvedValue("mock_payment_header");

      // Act
      await createPaymentHeader(stellarSigner, 1, stellarPaymentRequirements);

      // Assert
      expect(exactStellarClient.createPaymentHeader).toHaveBeenCalledWith(
        stellarSigner,
        1,
        stellarPaymentRequirements,
        undefined,
      );
    });

    it("should call exact Stellar client with empty config object", async () => {
      // Arrange
      const config = {};
      vi.mocked(exactStellarClient.createPaymentHeader).mockResolvedValue("mock_payment_header");

      // Act
      await createPaymentHeader(stellarSigner, 1, stellarPaymentRequirements, config);

      // Assert
      expect(exactStellarClient.createPaymentHeader).toHaveBeenCalledWith(
        stellarSigner,
        1,
        stellarPaymentRequirements,
        config,
      );
    });
  });
});
