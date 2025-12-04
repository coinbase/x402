import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Networks as StellarNetworks, rpc, Account } from "@stellar/stellar-sdk";

import type { PaymentPayload, PaymentRequirements } from "../../../../types/verify";
import type { Ed25519Signer } from "../../../../shared/stellar/signer";
import { getNetworkPassphrase, getRpcUrl, getRpcClient } from "../../../../shared/stellar/rpc";
import { createStellarSigner } from "../../../../shared/stellar/signer";

import { createAndSignPayment } from "../client";
import { settle } from "./settle";
import * as verifyModule from "./verify";
import { Api } from "@stellar/stellar-sdk/rpc";

vi.mock("../../../../shared/stellar/rpc", () => ({
  getNetworkPassphrase: vi.fn(),
  getRpcUrl: vi.fn(),
  getRpcClient: vi.fn(),
}));

vi.mock("./verify", async () => {
  const actual = await vi.importActual<typeof verifyModule>("./verify");
  return {
    ...actual,
    verify: vi.fn(),
  };
});

describe("Stellar Facilitator Settle", () => {
  const CLIENT_SECRET = "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK";
  const CLIENT_PUBLIC = "GBBO4ZDDZTSM2IUKQYBAST3CFHNPFXECGEFTGWTA2WELR2BIWDK57UVE";
  const FACILITATOR_PUBLIC = "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W";
  const ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

  const validRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "stellar-testnet",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test payment",
    mimeType: "application/json",
    payTo: FACILITATOR_PUBLIC,
    maxTimeoutSeconds: 60,
    asset: ASSET,
  };

  let validPayload: PaymentPayload;
  let facilitatorSigner: Ed25519Signer;
  let mockSignedTxXdr: string;
  let mockServer: rpc.Server;

  beforeAll(async () => {
    vi.mocked(getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");

    const clientSigner = createStellarSigner(CLIENT_SECRET, "stellar-testnet");
    validPayload = await createAndSignPayment(clientSigner, 1, validRequirements);

    // Extract XDR from validPayload to use as mock signed transaction
    if ("transaction" in validPayload.payload) {
      mockSignedTxXdr = validPayload.payload.transaction;
    }

    // Create mock facilitator signer
    facilitatorSigner = {
      address: FACILITATOR_PUBLIC,
      signAuthEntry: vi.fn(),
      signTransaction: vi.fn().mockResolvedValue({
        signedTxXdr: mockSignedTxXdr,
        error: undefined,
      }),
    };
  });

  beforeEach(() => {
    // Create a fresh mock server for each test
    mockServer = {
      getAccount: vi.fn().mockResolvedValue(new Account(FACILITATOR_PUBLIC, "100")),
      sendTransaction: vi.fn().mockResolvedValue({
        status: "PENDING",
        hash: "test-tx-hash-123",
      } as Api.SendTransactionResponse),
      getTransaction: vi
        .fn()
        .mockResolvedValue({ status: "SUCCESS" } as Api.GetTransactionResponse),
    } as unknown as rpc.Server;

    vi.clearAllMocks();

    vi.mocked(getRpcClient).mockReturnValue(mockServer);
    vi.mocked(verifyModule.verify).mockResolvedValue({
      isValid: true,
      payer: CLIENT_PUBLIC,
    });
    vi.mocked(facilitatorSigner.signTransaction).mockResolvedValue({
      signedTxXdr: mockSignedTxXdr,
      error: undefined,
    });
  });

  describe("settlement failures", () => {
    it("should return error when verify fails", async () => {
      vi.mocked(verifyModule.verify).mockResolvedValue({
        isValid: false,
        invalidReason: "invalid_exact_stellar_payload_wrong_amount",
        payer: CLIENT_PUBLIC,
      });

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "invalid_exact_stellar_payload_wrong_amount",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
        transaction: "",
      });
      expect(mockServer.sendTransaction).not.toHaveBeenCalled();
    });

    it("should return error when signing fails", async () => {
      vi.mocked(facilitatorSigner.signTransaction).mockResolvedValue({
        signedTxXdr: "",
        error: { code: 1, message: "Signing failed" },
      });

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_signing_failed",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
        transaction: "",
      });
    });

    it("should return error when transaction submission returns non-PENDING status", async () => {
      vi.mocked(mockServer.sendTransaction).mockResolvedValue({
        status: "TRY_AGAIN_LATER",
        hash: "",
      } as Api.SendTransactionResponse);

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_submission_failed",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
        transaction: "",
      });
    });

    it("should return error when transaction confirmation fails", async () => {
      vi.mocked(mockServer.sendTransaction).mockResolvedValue({
        status: "PENDING",
        hash: "test-tx-hash-123",
      } as Api.SendTransactionResponse);
      vi.mocked(mockServer.getTransaction).mockResolvedValue({
        status: "FAILED",
      } as Api.GetTransactionResponse);

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_failed",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
        transaction: "test-tx-hash-123",
      });
    });

    it("should return error when transaction confirmation times out", async () => {
      vi.mocked(mockServer.sendTransaction).mockResolvedValue({
        status: "PENDING",
        hash: "test-tx-hash-123",
      } as Api.SendTransactionResponse);
      vi.mocked(mockServer.getTransaction).mockResolvedValue({
        status: "NOT_FOUND",
      } as Api.GetTransactionResponse);

      const result = await settle(facilitatorSigner, validPayload, {
        ...validRequirements,
        maxTimeoutSeconds: 1,
      });

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_failed",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
        transaction: "test-tx-hash-123",
      });
    });

    it("should handle unexpected errors during account fetch", async () => {
      vi.mocked(mockServer.getAccount).mockRejectedValue(new Error("Network error"));

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "unexpected_settle_error",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
        transaction: "",
      });
    });
  });

  describe("successful settlement", () => {
    it("should successfully settle valid payment", async () => {
      vi.mocked(mockServer.sendTransaction).mockResolvedValue({
        status: "PENDING",
        hash: "test-tx-hash-123",
      } as Api.SendTransactionResponse);
      vi.mocked(mockServer.getTransaction).mockResolvedValue({
        status: "SUCCESS",
      } as Api.GetTransactionResponse);

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result).toEqual({
        success: true,
        transaction: "test-tx-hash-123",
        payer: CLIENT_PUBLIC,
        network: "stellar-testnet",
      });

      expect(verifyModule.verify).toHaveBeenCalledWith(
        facilitatorSigner,
        validPayload,
        validRequirements,
        undefined,
      );
      expect(mockServer.getAccount).toHaveBeenCalledWith(FACILITATOR_PUBLIC);
      expect(mockServer.sendTransaction).toHaveBeenCalled();
      expect(mockServer.getTransaction).toHaveBeenCalledWith("test-tx-hash-123");
    });

    it("should poll until transaction succeeds", async () => {
      let callCount = 0;
      vi.mocked(mockServer.getTransaction).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return { status: "NOT_FOUND" } as Api.GetTransactionResponse;
        }
        return { status: "SUCCESS" } as Api.GetTransactionResponse;
      });

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result.success).toBe(true);
      expect(mockServer.getTransaction).toHaveBeenCalledTimes(3);
    });

    it("should continue polling on errors", async () => {
      let callCount = 0;
      vi.mocked(mockServer.getTransaction).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary network error");
        }
        return { status: "SUCCESS" } as Api.GetTransactionResponse;
      });

      const result = await settle(facilitatorSigner, validPayload, validRequirements);

      expect(result.success).toBe(true);
      expect(mockServer.getTransaction).toHaveBeenCalledTimes(2);
    });
  });
});
