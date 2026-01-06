import { Buffer } from "buffer";
import {
  Networks as StellarNetworks,
  rpc,
  Account,
  SorobanDataBuilder,
} from "@stellar/stellar-sdk";
import { Api } from "@stellar/stellar-sdk/rpc";
import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import { STELLAR_TESTNET_CAIP2 } from "../../src/constants";
import { ExactStellarScheme } from "../../src/exact/facilitator/scheme";
import { createEd25519Signer } from "../../src/signer";
import * as stellarUtils from "../../src/utils";
import type { FacilitatorStellarSigner } from "../../src/signer";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

vi.mock("../../src/utils", async () => {
  const actual = await vi.importActual<typeof stellarUtils>("../../src/utils");
  return {
    ...actual,
    getNetworkPassphrase: vi.fn(),
    getRpcUrl: vi.fn(),
    getRpcClient: vi.fn(),
  };
});

describe("ExactStellarScheme - Settle", () => {
  const CLIENT_PUBLIC = "GBBO4ZDDZTSM2IUKQYBAST3CFHNPFXECGEFTGWTA2WELR2BIWDK57UVE";
  const FACILITATOR_SECRET = "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK";
  const FACILITATOR_PUBLIC = "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W";
  const ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

  const validRequirements: PaymentRequirements = {
    scheme: "exact",
    network: STELLAR_TESTNET_CAIP2,
    amount: "10000", // Extracted from transaction XDR
    payTo: FACILITATOR_PUBLIC,
    maxTimeoutSeconds: 60,
    asset: ASSET,
    extra: {
      maxLedgerOffset: 12,
    },
  };

  let validPayload: PaymentPayload;
  let facilitatorSigner: FacilitatorStellarSigner;
  let facilitator: ExactStellarScheme;
  let mockSignedTxXdr: string;
  let mockServer: rpc.Server;

  // Use a real transaction XDR from shared test (base64 encoded JSON with tx field)
  const signedTxJson =
    "eyJtZXRob2QiOiJ0cmFuc2ZlciIsInR4IjoiQUFBQUFnQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQURsM0lBQUFBQUFBQUFBUUFBQUFFQUFBQUFBQUFBQUFBQUFBQnBGcEdGQUFBQUFBQUFBQUVBQUFBQUFBQUFHQUFBQUFBQUFBQUJVRVhOWHNCeW1uYVAxYTBDVUZoUzMwOENqYzZERGxyRklnbTZTRWc3THdFQUFBQUlkSEpoYm5ObVpYSUFBQUFEQUFBQUVnQUFBQUFBQUFBQVF1NWtZOHprelNLS2hnSUpUMklwMnZMY2dqRUxNMXBnMVlpNDZDaXcxZDhBQUFBU0FBQUFBQUFBQUFDT1JISHdJVkxnYSt4dVl2ZzFacVJsNVFKVy82L2FaRlRLTGljbGFyNEZkd0FBQUFvQUFBQUFBQUFBQUFBQUFBQUFBQ2NRQUFBQUFRQUFBQUVBQUFBQUFBQUFBRUx1WkdQTTVNMGlpb1lDQ1U5aUtkcnkzSUl4Q3pOYVlOV0l1T2dvc05YZlh4amsrOHlZOGhnQUk4ck9BQUFBRUFBQUFBRUFBQUFCQUFBQUVRQUFBQUVBQUFBQ0FBQUFEd0FBQUFwd2RXSnNhV05mYTJWNUFBQUFBQUFOQUFBQUlFTHVaR1BNNU0waWlvWUNDVTlpS2RyeTNJSXhDek5hWU5XSXVPZ29zTlhmQUFBQUR3QUFBQWx6YVdkdVlYUjFjbVVBQUFBQUFBQU5BQUFBUUl2bjJjU3VLbFl5TU96T0pTWnkwc0VaN3dkN1QwYmdSQ0ZxZjg1M3VXQXFVcjE1ZUpycXNqVjROUVpTQW05WXNWbHZEcEUrSFRLc3pUQUVBaTJBRkFnQUFBQUFBQUFBQVZCRnpWN0FjcHAyajlXdEFsQllVdDlQQW8zT2d3NWF4U0lKdWtoSU95OEJBQUFBQ0hSeVlXNXpabVZ5QUFBQUF3QUFBQklBQUFBQUFBQUFBRUx1WkdQTTVNMGlpb1lDQ1U5aUtkcnkzSUl4Q3pOYVlOV0l1T2dvc05YZkFBQUFFZ0FBQUFBQUFBQUFqa1J4OENGUzRHdnNibUw0Tldha1plVUNWdit2Mm1SVXlpNG5KV3ErQlhjQUFBQUtBQUFBQUFBQUFBQUFBQUFBQUFBbkVBQUFBQUFBQUFBQkFBQUFBQUFBQUFJQUFBQUFBQUFBQUVMdVpHUE01TTBpaW9ZQ0NVOWlLZHJ5M0lJeEN6TmFZTldJdU9nb3NOWGZBQUFBQmdBQUFBRlFSYzFld0hLYWRvL1ZyUUpRV0ZMZlR3S056b01PV3NVaUNicElTRHN2QVFBQUFCUUFBQUFCQUFBQUF3QUFBQUVBQUFBQVF1NWtZOHprelNLS2hnSUpUMklwMnZMY2dqRUxNMXBnMVlpNDZDaXcxZDhBQUFBQlZWTkVRd0FBQUFCQ1BuMEY4dXl2dit3Wkt5RmFQeHZwYXUyNDJPY0NWS3ZqUVQ0Q0I5NVdzZ0FBQUFFQUFBQUFqa1J4OENGUzRHdnNibUw0Tldha1plVUNWdit2Mm1SVXlpNG5KV3ErQlhjQUFBQUJWVk5FUXdBQUFBQkNQbjBGOHV5dnYrd1pLeUZhUHh2cGF1MjQyT2NDVkt2alFUNENCOTVXc2dBQUFBWUFBQUFBQUFBQUFFTHVaR1BNNU0waWlvWUNDVTlpS2RyeTNJSXhDek5hWU5XSXVPZ29zTlhmQUFBQUZWOFk1UHZNbVBJWUFBQUFBQUFMNVRFQUFBRjRBQUFCTkFBQUFBQUFBNWNPQUFBQUFBPT0iLCJzaW11bGF0aW9uUmVzdWx0Ijp7ImF1dGgiOlsiQUFBQUFRQUFBQUFBQUFBQVF1NWtZOHprelNLS2hnSUpUMklwMnZMY2dqRUxNMXBnMVlpNDZDaXcxZDlmR09UN3pKanlHQUFBQUFBQUFBQUJBQUFBQUFBQUFBRlFSYzFld0hLYWRvL1ZyUUpRV0ZMZlR3S056b01PV3NVaUNicElTRHN2QVFBQUFBaDBjbUZ1YzJabGNnQUFBQU1BQUFBU0FBQUFBQUFBQUFCQzdtUmp6T1ROSW9xR0FnbFBZaW5hOHR5Q01Rc3pXbURWaUxqb0tMRFYzd0FBQUJJQUFBQUFBQUFBQUk1RWNmQWhVdUJyN0c1aStEVm1wR1hsQWxiL3I5cGtWTW91SnlWcXZnVjNBQUFBQ2dBQUFBQUFBQUFBQUFBQUFBQUFKeEFBQUFBQSJdLCJyZXR2YWwiOiJBQUFBQVE9PSJ9LCJzaW11bGF0aW9uVHJhbnNhY3Rpb25EYXRhIjoiQUFBQUFBQUFBQUlBQUFBQUFBQUFBRUx1WkdQTTVNMGlpb1lDQ1U5aUtkcnkzSUl4Q3pOYVlOV0l1T2dvc05YZkFBQUFCZ0FBQUFGUVJjMWV3SEthZG8vVnJRSlFXRkxmVHdLTnpvTU9Xc1VpQ2JwSVNEc3ZBUUFBQUJRQUFBQUJBQUFBQXdBQUFBRUFBQUFBUXU1a1k4emt6U0tLaGdJSlQySXAydkxjZ2pFTE0xcGcxWWk0NkNpdzFkOEFBQUFCVlZORVF3QUFBQUJDUG4wRjh1eXZ2K3daS3lGYVB4dnBhdTI0Mk9jQ1ZLdmpRVDRDQjk1V3NnQUFBQUVBQUFBQWprUng4Q0ZTNEd2c2JtTDROV2FrWmVVQ1Z2K3YybVJVeWk0bkpXcStCWGNBQUFBQlZWTkVRd0FBQUFCQ1BuMEY4dXl2dit3Wkt5RmFQeHZwYXUyNDJPY0NWS3ZqUVQ0Q0I5NVdzZ0FBQUFZQUFBQUFBQUFBQUVMdVpHUE01TTBpaW9ZQ0NVOWlLZHJ5M0lJeEN6TmFZTldJdU9nb3NOWGZBQUFBRlY4WTVQdk1tUElZQUFBQUFBQUw1VEVBQUFGNEFBQUJOQUFBQUFBQUE1Y08ifQ==";
  const { tx: mockTransactionXDR } = JSON.parse(
    Buffer.from(signedTxJson, "base64").toString("utf8"),
  );

  beforeAll(async () => {
    vi.mocked(stellarUtils.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(stellarUtils.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");

    // Create signers
    facilitatorSigner = createEd25519Signer(FACILITATOR_SECRET, STELLAR_TESTNET_CAIP2);

    // Build full V2 PaymentPayload with mocked transaction
    validPayload = {
      x402Version: 2,
      resource: {
        url: "https://example.com/resource",
        description: "Test payment",
        mimeType: "application/json",
      },
      accepted: validRequirements,
      payload: {
        transaction: mockTransactionXDR,
      },
    };

    // Use the same XDR for signed transaction
    mockSignedTxXdr = mockTransactionXDR;

    facilitator = new ExactStellarScheme(facilitatorSigner);
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
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 100000 }),
      simulateTransaction: vi.fn().mockResolvedValue({
        id: "test",
        latestLedger: 123,
        events: [],
        _parsed: true,
        transactionData: new SorobanDataBuilder(),
        minResourceFee: "100",
        cost: { cpuInsns: "0", memBytes: "0" },
        results: [],
      } as Api.SimulateTransactionSuccessResponse),
    } as unknown as rpc.Server;

    vi.clearAllMocks();

    vi.mocked(stellarUtils.getRpcClient).mockReturnValue(mockServer);
    vi.mocked(stellarUtils.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(stellarUtils.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");

    // Mock verify to pass for settle tests (verify is tested separately)
    // The expiration check may reject the test transaction, so we mock verify for settle tests
    // Note: This is reset in tests that need to test actual verify behavior
    vi.spyOn(facilitator, "verify").mockImplementation(async () => ({
      isValid: true,
      payer: CLIENT_PUBLIC,
    }));

    // Mock signTransaction to return the mock signed XDR
    vi.spyOn(facilitatorSigner, "signTransaction").mockResolvedValue({
      signedTxXdr: mockSignedTxXdr,
      error: undefined,
    });
  });

  describe("settlement failures", () => {
    it("should return error when verify fails", async () => {
      vi.spyOn(facilitator, "verify").mockRestore();
      // Use requirements with wrong amount to make verify fail
      const invalidRequirements = {
        ...validRequirements,
        amount: "9999", // Wrong amount (transaction has 10000)
      };

      const result = await facilitator.settle(validPayload, invalidRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("invalid_exact_stellar_payload_wrong_amount");
      expect(result.payer).toBe(CLIENT_PUBLIC);
      expect(result.network).toBe(STELLAR_TESTNET_CAIP2);
      expect(result.transaction).toBe("");
      expect(mockServer.sendTransaction).not.toHaveBeenCalled();
    });

    it("should return error when signing fails", async () => {
      vi.spyOn(facilitatorSigner, "signTransaction").mockResolvedValue({
        signedTxXdr: "",
        error: { code: 1, message: "Signing failed" },
      });

      const result = await facilitator.settle(validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_signing_failed",
        payer: CLIENT_PUBLIC,
        network: STELLAR_TESTNET_CAIP2,
        transaction: "",
      });
    });

    it("should return error when transaction submission returns non-PENDING status", async () => {
      vi.mocked(mockServer.sendTransaction).mockResolvedValue({
        status: "TRY_AGAIN_LATER",
        hash: "",
      } as Api.SendTransactionResponse);

      const result = await facilitator.settle(validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_submission_failed",
        payer: CLIENT_PUBLIC,
        network: STELLAR_TESTNET_CAIP2,
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

      const result = await facilitator.settle(validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_failed",
        payer: CLIENT_PUBLIC,
        network: STELLAR_TESTNET_CAIP2,
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

      const result = await facilitator.settle(validPayload, {
        ...validRequirements,
        maxTimeoutSeconds: 1,
      });

      expect(result).toEqual({
        success: false,
        errorReason: "settle_exact_stellar_transaction_failed",
        payer: CLIENT_PUBLIC,
        network: STELLAR_TESTNET_CAIP2,
        transaction: "test-tx-hash-123",
      });
    });

    it("should handle unexpected errors during account fetch", async () => {
      vi.mocked(mockServer.getAccount).mockRejectedValue(new Error("Network error"));

      const result = await facilitator.settle(validPayload, validRequirements);

      expect(result).toEqual({
        success: false,
        errorReason: "unexpected_settle_error",
        payer: CLIENT_PUBLIC,
        network: STELLAR_TESTNET_CAIP2,
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

      const result = await facilitator.settle(validPayload, validRequirements);

      expect(result).toEqual({
        success: true,
        transaction: "test-tx-hash-123",
        payer: CLIENT_PUBLIC,
        network: STELLAR_TESTNET_CAIP2,
      });

      // Get the actual facilitator address from the signer
      const facilitatorAddress = facilitatorSigner.address;
      expect(mockServer.getAccount).toHaveBeenCalledWith(facilitatorAddress);
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

      const result = await facilitator.settle(validPayload, validRequirements);

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

      const result = await facilitator.settle(validPayload, validRequirements);

      expect(result.success).toBe(true);
      expect(mockServer.getTransaction).toHaveBeenCalledTimes(2);
    });
  });
});
