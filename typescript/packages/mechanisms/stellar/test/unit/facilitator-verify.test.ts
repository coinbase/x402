import { Buffer } from "buffer";
import {
  Networks as StellarNetworks,
  SorobanDataBuilder,
  rpc,
  Transaction,
  TransactionBuilder,
  Operation,
  Account,
  xdr,
} from "@stellar/stellar-sdk";
import { Api } from "@stellar/stellar-sdk/rpc";
import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import { STELLAR_TESTNET_CAIP2 } from "../../src/constants";
import {
  ExactStellarScheme,
  invalidVerifyResponse,
  validVerifyResponse,
} from "../../src/exact/facilitator/scheme";
import { createEd25519Signer } from "../../src/signer";
import * as stellarUtils from "../../src/utils";
import type { FacilitatorStellarSigner } from "../../src/signer";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

vi.mock("@stellar/stellar-sdk/contract", async () => {
  const actual = await vi.importActual<typeof import("@stellar/stellar-sdk/contract")>(
    "@stellar/stellar-sdk/contract",
  );
  return {
    ...actual,
    AssembledTransaction: {
      build: vi.fn(),
    },
  };
});

vi.mock("../../src/utils", async () => {
  const actual = await vi.importActual<typeof stellarUtils>("../../src/utils");
  return {
    ...actual,
    getNetworkPassphrase: vi.fn(),
    getRpcUrl: vi.fn(),
    getRpcClient: vi.fn(),
    isStellarNetwork: vi.fn(),
    validateStellarAssetAddress: vi.fn(),
    validateStellarDestinationAddress: vi.fn(),
  };
});

describe("ExactStellarScheme - Verify", () => {
  const mockServer = {
    simulateTransaction: vi.fn(),
    getLatestLedger: vi.fn(),
  } as unknown as rpc.Server;

  const CLIENT_PUBLIC = "GBBO4ZDDZTSM2IUKQYBAST3CFHNPFXECGEFTGWTA2WELR2BIWDK57UVE";
  const FACILITATOR_PUBLIC = "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W";
  const ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

  let facilitatorSigner: FacilitatorStellarSigner;
  let facilitator: ExactStellarScheme;
  let validPayload: PaymentPayload;
  let validRequirements: PaymentRequirements;

  // Use a real transaction XDR from shared test (base64 encoded JSON with tx field)
  const signedTxJson =
    "eyJtZXRob2QiOiJ0cmFuc2ZlciIsInR4IjoiQUFBQUFnQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQURsM0lBQUFBQUFBQUFBUUFBQUFFQUFBQUFBQUFBQUFBQUFBQnBGcEdGQUFBQUFBQUFBQUVBQUFBQUFBQUFHQUFBQUFBQUFBQUJVRVhOWHNCeW1uYVAxYTBDVUZoUzMwOENqYzZERGxyRklnbTZTRWc3THdFQUFBQUlkSEpoYm5ObVpYSUFBQUFEQUFBQUVnQUFBQUFBQUFBQVF1NWtZOHprelNLS2hnSUpUMklwMnZMY2dqRUxNMXBnMVlpNDZDaXcxZDhBQUFBU0FBQUFBQUFBQUFDT1JISHdJVkxnYSt4dVl2ZzFacVJsNVFKVy82L2FaRlRLTGljbGFyNEZkd0FBQUFvQUFBQUFBQUFBQUFBQUFBQUFBQ2NRQUFBQUFRQUFBQUVBQUFBQUFBQUFBRUx1WkdQTTVNMGlpb1lDQ1U5aUtkcnkzSUl4Q3pOYVlOV0l1T2dvc05YZlh4amsrOHlZOGhnQUk4ck9BQUFBRUFBQUFBRUFBQUFCQUFBQUVRQUFBQUVBQUFBQ0FBQUFEd0FBQUFwd2RXSnNhV05mYTJWNUFBQUFBQUFOQUFBQUlFTHVaR1BNNU0waWlvWUNDVTlpS2RyeTNJSXhDek5hWU5XSXVPZ29zTlhmQUFBQUR3QUFBQWx6YVdkdVlYUjFjbVVBQUFBQUFBQU5BQUFBUUl2bjJjU3VLbFl5TU96T0pTWnkwc0VaN3dkN1QwYmdSQ0ZxZjg1M3VXQXFVcjE1ZUpycXNqVjROUVpTQW05WXNWbHZEcEUrSFRLc3pUQUVBaTJBRkFnQUFBQUFBQUFBQVZCRnpWN0FjcHAyajlXdEFsQllVdDlQQW8zT2d3NWF4U0lKdWtoSU95OEJBQUFBQ0hSeVlXNXpabVZ5QUFBQUF3QUFBQklBQUFBQUFBQUFBRUx1WkdQTTVNMGlpb1lDQ1U5aUtkcnkzSUl4Q3pOYVlOV0l1T2dvc05YZkFBQUFFZ0FBQUFBQUFBQUFqa1J4OENGUzRHdnNibUw0Tldha1plVUNWdit2Mm1SVXlpNG5KV3ErQlhjQUFBQUtBQUFBQUFBQUFBQUFBQUFBQUFBbkVBQUFBQUFBQUFBQkFBQUFBQUFBQUFJQUFBQUFBQUFBQUVMdVpHUE01TTBpaW9ZQ0NVOWlLZHJ5M0lJeEN6TmFZTldJdU9nb3NOWGZBQUFBQmdBQUFBRlFSYzFld0hLYWRvL1ZyUUpRV0ZMZlR3S056b01PV3NVaUNicElTRHN2QVFBQUFCUUFBQUFCQUFBQUF3QUFBQUVBQUFBQVF1NWtZOHprelNLS2hnSUpUMklwMnZMY2dqRUxNMXBnMVlpNDZDaXcxZDhBQUFBQlZWTkVRd0FBQUFCQ1BuMEY4dXl2dit3Wkt5RmFQeHZwYXUyNDJPY0NWS3ZqUVQ0Q0I5NVdzZ0FBQUFFQUFBQUFqa1J4OENGUzRHdnNibUw0Tldha1plVUNWdit2Mm1SVXlpNG5KV3ErQlhjQUFBQUJWVk5FUXdBQUFBQkNQbjBGOHV5dnYrd1pLeUZhUHh2cGF1MjQyT2NDVkt2alFUNENCOTVXc2dBQUFBWUFBQUFBQUFBQUFFTHVaR1BNNU0waWlvWUNDVTlpS2RyeTNJSXhDek5hWU5XSXVPZ29zTlhmQUFBQUZWOFk1UHZNbVBJWUFBQUFBQUFMNVRFQUFBRjRBQUFCTkFBQUFBQUFBNWNPQUFBQUFBPT0iLCJzaW11bGF0aW9uUmVzdWx0Ijp7ImF1dGgiOlsiQUFBQUFRQUFBQUFBQUFBQVF1NWtZOHprelNLS2hnSUpUMklwMnZMY2dqRUxNMXBnMVlpNDZDaXcxZDlmR09UN3pKanlHQUFBQUFBQUFBQUJBQUFBQUFBQUFBRlFSYzFld0hLYWRvL1ZyUUpRV0ZMZlR3S056b01PV3NVaUNicElTRHN2QVFBQUFBaDBjbUZ1YzJabGNnQUFBQU1BQUFBU0FBQUFBQUFBQUFCQzdtUmp6T1ROSW9xR0FnbFBZaW5hOHR5Q01Rc3pXbURWaUxqb0tMRFYzd0FBQUJJQUFBQUFBQUFBQUk1RWNmQWhVdUJyN0c1aStEVm1wR1hsQWxiL3I5cGtWTW91SnlWcXZnVjNBQUFBQ2dBQUFBQUFBQUFBQUFBQUFBQUFKeEFBQUFBQSJdLCJyZXR2YWwiOiJBQUFBQVE9PSJ9LCJzaW11bGF0aW9uVHJhbnNhY3Rpb25EYXRhIjoiQUFBQUFBQUFBQUlBQUFBQUFBQUFBRUx1WkdQTTVNMGlpb1lDQ1U5aUtkcnkzSUl4Q3pOYVlOV0l1T2dvc05YZkFBQUFCZ0FBQUFGUVJjMWV3SEthZG8vVnJRSlFXRkxmVHdLTnpvTU9Xc1VpQ2JwSVNEc3ZBUUFBQUJRQUFBQUJBQUFBQXdBQUFBRUFBQUFBUXU1a1k4emt6U0tLaGdJSlQySXAydkxjZ2pFTE0xcGcxWWk0NkNpdzFkOEFBQUFCVlZORVF3QUFBQUJDUG4wRjh1eXZ2K3daS3lGYVB4dnBhdTI0Mk9jQ1ZLdmpRVDRDQjk1V3NnQUFBQUVBQUFBQWprUng4Q0ZTNEd2c2JtTDROV2FrWmVVQ1Z2K3YybVJVeWk0bkpXcStCWGNBQUFBQlZWTkVRd0FBQUFCQ1BuMEY4dXl2dit3Wkt5RmFQeHZwYXUyNDJPY0NWS3ZqUVQ0Q0I5NVdzZ0FBQUFZQUFBQUFBQUFBQUVMdVpHUE01TTBpaW9ZQ0NVOWlLZHJ5M0lJeEN6TmFZTldJdU9nb3NOWGZBQUFBRlY4WTVQdk1tUElZQUFBQUFBQUw1VEVBQUFGNEFBQUJOQUFBQUFBQUE1Y08ifQ==";
  const txSignatureExpiration = 2345678;
  const { tx: baseTransactionXDR } = JSON.parse(
    Buffer.from(signedTxJson, "base64").toString("utf8"),
  );

  // Create a transaction with proper ledger bounds for testing
  // The transaction needs ledger bounds within [currentLedger, currentLedger + maxLedgerOffset]
  // We'll rebuild it with proper bounds in beforeAll
  let mockTransactionXDR: string;

  beforeAll(async () => {
    // Set up mocks
    vi.mocked(stellarUtils.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(stellarUtils.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");
    vi.mocked(stellarUtils.getRpcClient).mockReturnValue(mockServer);
    vi.mocked(stellarUtils.isStellarNetwork).mockReturnValue(true);
    vi.mocked(stellarUtils.validateStellarAssetAddress).mockReturnValue(true);
    vi.mocked(stellarUtils.validateStellarDestinationAddress).mockReturnValue(true);
    vi.mocked(mockServer.getLatestLedger).mockResolvedValue({
      sequence: txSignatureExpiration - 10,
    } as Api.GetLatestLedgerResponse);

    // Create signers
    // Use a different secret for facilitator to get FACILITATOR_PUBLIC address
    // FACILITATOR_PUBLIC = GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W
    // We need to find the secret for this, or use CLIENT_PUBLIC as facilitator for tests
    // For now, we'll use CLIENT_PUBLIC as facilitator address in the test
    facilitatorSigner = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );

    facilitator = new ExactStellarScheme(facilitatorSigner);

    // Use the original transaction XDR directly - it should already have ledger bounds
    mockTransactionXDR = baseTransactionXDR;

    // Create valid requirements (V2 format)
    // Note: Values must match the transaction XDR from shared test
    validRequirements = {
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stellarUtils.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(stellarUtils.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");
    vi.mocked(stellarUtils.getRpcClient).mockReturnValue(mockServer);
    vi.mocked(mockServer.getLatestLedger).mockResolvedValue({
      sequence: txSignatureExpiration - 10,
    } as Api.GetLatestLedgerResponse);
    vi.mocked(mockServer.simulateTransaction).mockResolvedValue({
      id: "test",
      latestLedger: 123,
      events: [],
      _parsed: true,
      transactionData: new SorobanDataBuilder(),
      minResourceFee: "100",
      cost: { cpuInsns: "0", memBytes: "0" },
      results: [],
    } as Api.SimulateTransactionSuccessResponse);
  });

  describe("validation errors", () => {
    it("should reject invalid x402 version, scheme, and network mismatch", async () => {
      let result = await facilitator.verify({ ...validPayload, x402Version: 9 }, validRequirements);
      expect(result).toEqual(invalidVerifyResponse("invalid_x402_version"));

      result = await facilitator.verify(
        {
          ...validPayload,
          accepted: { ...validPayload.accepted, scheme: "invalid" },
        },
        validRequirements,
      );
      expect(result).toEqual(invalidVerifyResponse("unsupported_scheme"));

      result = await facilitator.verify(
        {
          ...validPayload,
          accepted: { ...validPayload.accepted, network: "foo:bar" },
        },
        validRequirements,
      );
      expect(result).toEqual(invalidVerifyResponse("network_mismatch"));
    });

    it("should reject mismatching requirement<>payload networks", async () => {
      const requirements: PaymentRequirements = {
        ...validRequirements,
        network: "eip155:84532" as never,
      };
      const result = await facilitator.verify(validPayload, requirements);
      expect(result).toEqual(invalidVerifyResponse("network_mismatch"));
    });

    it("should reject malformed transaction XDR", async () => {
      const payload = {
        ...validPayload,
        payload: { transaction: "AAAA" },
      };
      const result = await facilitator.verify(payload, validRequirements);
      expect(result).toEqual(invalidVerifyResponse("invalid_exact_stellar_payload_malformed"));
    });

    it("should reject wrong asset, recipient, or amount", async () => {
      let result = await facilitator.verify(validPayload, {
        ...validRequirements,
        asset: "CDNVQW44C3HALYNVQ4SOBXY5EWYTGVYXX6JPESOLQDABJI5FC5LTRRUE",
      });
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_wrong_asset");

      result = await facilitator.verify(validPayload, {
        ...validRequirements,
        payTo: "GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER",
      });
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_wrong_recipient");
      expect(result.payer).toBe(CLIENT_PUBLIC);

      result = await facilitator.verify(validPayload, {
        ...validRequirements,
        amount: "10001",
      });
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_wrong_amount");
      expect(result.payer).toBe(CLIENT_PUBLIC);
    });

    it("should reject simulation failure", async () => {
      vi.mocked(mockServer.simulateTransaction).mockResolvedValueOnce({
        error: "Simulation failed",
        events: [],
        id: "test",
        latestLedger: 123,
        _parsed: true,
      } as Api.SimulateTransactionErrorResponse);

      const result = await facilitator.verify(validPayload, validRequirements);
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_simulation_failed");
      expect(result.payer).toBe(CLIENT_PUBLIC);
    });

    it("should reject auth entry whose signature expiration is too far", async () => {
      const facilitatorWithOffset = new ExactStellarScheme(facilitatorSigner, undefined, 5);
      const result = await facilitatorWithOffset.verify(validPayload, {
        ...validRequirements,
        extra: { maxLedgerOffset: 5 },
      });
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_stellar_signature_expiration_too_far");
      expect(result.payer).toBe(CLIENT_PUBLIC);
    });

    describe("should reject when source is unauthorized", () => {
      it("should reject operation.source == facilitatorAccount", async () => {
        // Get the actual facilitator address from the signer
        const facilitatorAddress = facilitatorSigner.address;

        // Parse the valid transaction
        const networkPassphrase = StellarNetworks.TESTNET;
        const stellarPayload = validPayload.payload as { transaction: string };
        const txEnvelope = xdr.TransactionEnvelope.fromXDR(stellarPayload.transaction, "base64");
        const transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
        const sorobanData = txEnvelope.v1()?.tx()?.ext()?.sorobanData() || undefined;
        const operation = transaction.operations[0] as Operation.InvokeHostFunction;

        if (!sorobanData) {
          throw new Error("Missing sorobanData in test transaction");
        }

        // Create a new operation with facilitator as source
        const modifiedOperation = Operation.invokeHostFunction({
          func: operation.func,
          auth: operation.auth || [],
          source: facilitatorAddress,
        });

        // Create a new transaction with the modified operation
        const account = new Account(CLIENT_PUBLIC, "100");
        const modifiedTx = new TransactionBuilder(account, {
          fee: transaction.fee,
          networkPassphrase,
          ledgerbounds: transaction.ledgerBounds,
          sorobanData,
        })
          .addOperation(modifiedOperation)
          .setTimeout(validRequirements.maxTimeoutSeconds)
          .build();

        const modifiedPayload: PaymentPayload = {
          ...validPayload,
          payload: {
            transaction: modifiedTx.toXDR(),
          },
        };

        const result = await facilitator.verify(modifiedPayload, validRequirements);
        expect(result.isValid).toBe(false);
        expect(result.invalidReason).toBe("invalid_exact_stellar_payload_unsafe_tx_or_op_source");
        expect(result.payer).toBe(CLIENT_PUBLIC);
      });

      it("should reject transaction.source == facilitatorAccount", async () => {
        // Get the actual facilitator address from the signer
        const facilitatorAddress = facilitatorSigner.address;

        // Parse the valid transaction
        const networkPassphrase = StellarNetworks.TESTNET;
        const stellarPayload = validPayload.payload as { transaction: string };
        const txEnvelope = xdr.TransactionEnvelope.fromXDR(stellarPayload.transaction, "base64");
        const transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
        const sorobanData = txEnvelope.v1()?.tx()?.ext()?.sorobanData() || undefined;
        const operation = transaction.operations[0] as Operation.InvokeHostFunction;

        if (!sorobanData) {
          throw new Error("Missing sorobanData in test transaction");
        }

        // Create a new operation (reuse the function and auth from original)
        const modifiedOperation = Operation.invokeHostFunction({
          func: operation.func,
          auth: operation.auth || [],
          source: operation.source,
        });

        // Create a new transaction with facilitator as source
        const account = new Account(facilitatorAddress, "100");
        const modifiedTx = new TransactionBuilder(account, {
          fee: transaction.fee,
          networkPassphrase,
          ledgerbounds: transaction.ledgerBounds,
          sorobanData,
        })
          .addOperation(modifiedOperation)
          .setTimeout(validRequirements.maxTimeoutSeconds)
          .build();

        const modifiedPayload: PaymentPayload = {
          ...validPayload,
          payload: {
            transaction: modifiedTx.toXDR(),
          },
        };

        const result = await facilitator.verify(modifiedPayload, validRequirements);
        expect(result.isValid).toBe(false);
        expect(result.invalidReason).toBe("invalid_exact_stellar_payload_unsafe_tx_or_op_source");
        expect(result.payer).toBe(CLIENT_PUBLIC);
      });
    });
  });

  describe("successful verification", () => {
    it("should verify valid payment", async () => {
      const result = await facilitator.verify(validPayload, validRequirements);
      expect(result).toEqual(validVerifyResponse(CLIENT_PUBLIC));
      expect(stellarUtils.getRpcClient).toHaveBeenCalledWith(STELLAR_TESTNET_CAIP2, undefined);
      expect(mockServer.simulateTransaction).toHaveBeenCalled();
    });
  });
});
