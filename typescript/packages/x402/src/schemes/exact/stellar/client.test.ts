import { describe, it, expect, vi, beforeEach } from "vitest";
import { nativeToScVal, Networks as StellarNetworks } from "@stellar/stellar-sdk";
import { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import {
  createPaymentHeader,
  createAndSignPayment,
  validateCreateAndSignPaymentInput,
} from "./client";
import * as stellarShared from "../../../shared/stellar";
import type { PaymentRequirements } from "../../../types/verify";
import type { Ed25519Signer } from "../../../shared/stellar";
import { X402Config } from "../../../types";

vi.mock("@stellar/stellar-sdk/contract", () => ({
  AssembledTransaction: {
    build: vi.fn(),
  },
}));

vi.mock("../../../shared/stellar", async () => {
  const actual = await vi.importActual<typeof stellarShared>("../../../shared/stellar");
  return {
    ...actual,
    getRpcUrl: vi.fn(),
    getNetworkPassphrase: vi.fn(),
    isStellarSigner: vi.fn(),
  };
});

describe("Stellar Exact Client", () => {
  const mockSigner: Ed25519Signer = {
    address: "GBBO4ZDDZTSM2IUKQYBAST3CFHNPFXECGEFTGWTA2WELR2BIWDK57UVE",
    signAuthEntry: vi.fn().mockResolvedValue({ signedAuthEntry: "signed" }),
    signTransaction: vi.fn().mockResolvedValue("signed-tx"),
  };

  const validPaumentReq: PaymentRequirements = {
    scheme: "exact",
    network: "stellar-testnet",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test payment",
    mimeType: "application/json",
    payTo: "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W",
    maxTimeoutSeconds: 60,
    asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  };

  const mockTransaction = {
    simulation: {},
    needsNonInvokerSigningBy: vi.fn(),
    signAuthEntries: vi.fn(),
    simulate: vi.fn(),
    built: { toXDR: vi.fn().mockReturnValue("mock-xdr") },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stellarShared.isStellarSigner).mockReturnValue(true);
    vi.mocked(stellarShared.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");
    vi.mocked(stellarShared.getNetworkPassphrase).mockReturnValue(
      "Test SDF Network ; September 2015",
    );
    vi.mocked(AssembledTransaction.build).mockResolvedValue(
      mockTransaction as unknown as AssembledTransaction<unknown>,
    );
    mockTransaction.needsNonInvokerSigningBy.mockReturnValue([mockSigner.address]);
  });

  describe("validateCreateAndSignPaymentInput", () => {
    it("should throw for invalid signer", () => {
      vi.mocked(stellarShared.isStellarSigner).mockReturnValue(false);
      expect(() => validateCreateAndSignPaymentInput(mockSigner, validPaumentReq)).toThrow(
        "Invalid Stellar signer provided",
      );
    });

    it("should throw for unsupported scheme", () => {
      const invalidScheme = {
        ...validPaumentReq,
        scheme: "invalid",
      } as unknown as PaymentRequirements;
      expect(() => validateCreateAndSignPaymentInput(mockSigner, invalidScheme)).toThrow(
        "Unsupported scheme: invalid",
      );
    });

    it("should throw for unsupported network", () => {
      const invalidNetwork = {
        ...validPaumentReq,
        network: "base-sepolia",
      } as PaymentRequirements;
      expect(() => validateCreateAndSignPaymentInput(mockSigner, invalidNetwork)).toThrow(
        "Unsupported Stellar network: base-sepolia",
      );
    });

    it("should throw for invalid payTo address", () => {
      const invalidPayTo = { ...validPaumentReq, payTo: "invalid-address" };
      expect(() => validateCreateAndSignPaymentInput(mockSigner, invalidPayTo)).toThrow(
        "Invalid Stellar destination address: invalid-address",
      );
    });

    it("should throw for invalid asset address", () => {
      const invalidAsset = { ...validPaumentReq, asset: "invalid-asset" };
      expect(() => validateCreateAndSignPaymentInput(mockSigner, invalidAsset)).toThrow(
        "Invalid Stellar asset address: invalid-asset",
      );
    });

    it("should pass with both TESTNET and MAINNET networks", () => {
      expect(() => validateCreateAndSignPaymentInput(mockSigner, validPaumentReq)).not.toThrow();

      const mainnetReq = { ...validPaumentReq, network: "stellar" as const };
      expect(() => validateCreateAndSignPaymentInput(mockSigner, mainnetReq)).not.toThrow();
    });

    it("should pass with payTo being either a G,C, or M address", () => {
      expect(() => validateCreateAndSignPaymentInput(mockSigner, validPaumentReq)).not.toThrow();

      const validCAddress = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
      let pReq = { ...validPaumentReq, payTo: validCAddress };
      expect(() => validateCreateAndSignPaymentInput(mockSigner, pReq)).not.toThrow();

      const validMAddress = "MA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KAAAAAAAAAAAAFKBA";
      pReq = { ...validPaumentReq, payTo: validMAddress };
      expect(() => validateCreateAndSignPaymentInput(mockSigner, pReq)).not.toThrow();
    });
  });

  describe("createPaymentHeader", () => {
    it("should create and base64-encode payment header", async () => {
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([mockSigner.address]);
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([]);

      const result = await createPaymentHeader(mockSigner, 1, validPaumentReq);
      const decoded = JSON.parse(Buffer.from(result, "base64").toString());

      expect(decoded).toEqual({
        x402Version: 1,
        scheme: "exact",
        network: "stellar-testnet",
        payload: { transaction: "mock-xdr" },
      });
    });

    it("should propagate validation errors", async () => {
      vi.mocked(stellarShared.isStellarSigner).mockReturnValue(false);
      await expect(createPaymentHeader(mockSigner, 1, validPaumentReq)).rejects.toThrow(
        "Invalid input parameters for creating Stellar payment",
      );
    });
  });

  describe("createAndSignPayment", () => {
    it("should throw for invalid input parameters", async () => {
      vi.mocked(stellarShared.isStellarSigner).mockReturnValue(false);
      await expect(createAndSignPayment(mockSigner, 1, validPaumentReq)).rejects.toThrow(
        "Invalid input parameters",
      );
    });

    it("should use custom RPC URL from config", async () => {
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([mockSigner.address]);
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([]);

      const config: X402Config = { stellarConfig: { rpcUrl: "https://custom-rpc.example.com" } };
      vi.mocked(stellarShared.getRpcUrl).mockReturnValue("https://custom-rpc.example.com");

      await createAndSignPayment(mockSigner, 1, validPaumentReq, config);

      expect(stellarShared.getRpcUrl).toHaveBeenCalledWith("stellar-testnet", config);
    });

    it("should throw for MAINNET without custom RPC URL", async () => {
      const mainnetReq = { ...validPaumentReq, network: "stellar" as const };
      vi.mocked(stellarShared.getRpcUrl).mockImplementation((network, config) => {
        if (network === "stellar" && !config?.stellarConfig?.rpcUrl) {
          throw new Error(
            "Stellar mainnet requires a custom RPC URL. Please provide stellarConfig.rpcUrl in your X402Config",
          );
        }
        return "https://soroban-testnet.stellar.org";
      });

      await expect(createAndSignPayment(mockSigner, 1, mainnetReq)).rejects.toThrow(
        /Stellar mainnet requires a custom RPC URL/,
      );
    });

    it("should throw if wrong or multiple signers are needed", async () => {
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce(["DIFFERENT_ADDRESS"]);
      await expect(createAndSignPayment(mockSigner, 1, validPaumentReq)).rejects.toThrow(
        /Expected to sign with/,
      );

      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([
        mockSigner.address,
        "ANOTHER_ADDRESS",
      ]);
      await expect(createAndSignPayment(mockSigner, 1, validPaumentReq)).rejects.toThrow(
        /Expected to sign with/,
      );
    });

    it("should throw if signers still missing after signing", async () => {
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([mockSigner.address]);
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce(["STILL_MISSING"]);

      await expect(createAndSignPayment(mockSigner, 1, validPaumentReq)).rejects.toThrow(
        /unexpected signer\(s\) required/,
      );
    });

    it("should build, sign, and return correct payment for TESTNET", async () => {
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([mockSigner.address]);
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([]);

      const result = await createAndSignPayment(mockSigner, 1, validPaumentReq);

      expect(AssembledTransaction.build).toHaveBeenCalledWith({
        contractId: validPaumentReq.asset,
        method: "transfer",
        args: [
          nativeToScVal(mockSigner.address, { type: "address" }),
          nativeToScVal(validPaumentReq.payTo, { type: "address" }),
          nativeToScVal(validPaumentReq.maxAmountRequired, { type: "i128" }),
        ],
        networkPassphrase: StellarNetworks.TESTNET,
        rpcUrl: "https://soroban-testnet.stellar.org",
        parseResultXdr: expect.any(Function),
      });

      expect(mockTransaction.signAuthEntries).toHaveBeenCalledWith({
        address: mockSigner.address,
        signAuthEntry: mockSigner.signAuthEntry,
      });
      expect(mockTransaction.simulate).toHaveBeenCalled();

      expect(result).toEqual({
        x402Version: 1,
        scheme: "exact",
        network: "stellar-testnet",
        payload: { transaction: "mock-xdr" },
      });
    });

    it("should build, sign, and return correct payment for MAINNET", async () => {
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([mockSigner.address]);
      mockTransaction.needsNonInvokerSigningBy.mockReturnValueOnce([]);

      const mainnetReq = { ...validPaumentReq, network: "stellar" as const };
      const config: X402Config = { stellarConfig: { rpcUrl: "https://mainnet-rpc.example.com" } };
      vi.mocked(stellarShared.getRpcUrl).mockReturnValue("https://mainnet-rpc.example.com");
      vi.mocked(stellarShared.getNetworkPassphrase).mockReturnValue(StellarNetworks.PUBLIC);

      const result = await createAndSignPayment(mockSigner, 1, mainnetReq, config);

      expect(AssembledTransaction.build).toHaveBeenCalledWith({
        contractId: mainnetReq.asset,
        method: "transfer",
        args: [
          nativeToScVal(mockSigner.address, { type: "address" }),
          nativeToScVal(mainnetReq.payTo, { type: "address" }),
          nativeToScVal(mainnetReq.maxAmountRequired, { type: "i128" }),
        ],
        networkPassphrase: StellarNetworks.PUBLIC,
        rpcUrl: "https://mainnet-rpc.example.com",
        parseResultXdr: expect.any(Function),
      });

      expect(mockTransaction.signAuthEntries).toHaveBeenCalledWith({
        address: mockSigner.address,
        signAuthEntry: mockSigner.signAuthEntry,
      });
      expect(mockTransaction.simulate).toHaveBeenCalled();

      expect(result).toEqual({
        x402Version: 1,
        scheme: "exact",
        network: "stellar",
        payload: { transaction: "mock-xdr" },
      });
    });
  });
});
