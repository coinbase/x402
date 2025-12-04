import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
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

import type { PaymentPayload, PaymentRequirements } from "../../../../types/verify";
import { ExactStellarPayloadSchema } from "../../../../types/verify";
import * as stellarRpc from "../../../../shared/stellar/rpc";
import { createStellarSigner } from "../../../../shared/stellar/signer";

import { createAndSignPayment } from "../client";
import { invalidResponse, verify } from "./verify";

vi.mock("../../../../shared/stellar/rpc", async () => {
  const actual = await vi.importActual<typeof stellarRpc>("../../../../shared/stellar/rpc");
  return {
    ...actual,
    getNetworkPassphrase: vi.fn(),
    getRpcUrl: vi.fn(),
    getRpcClient: vi.fn(),
  };
});

describe("Stellar Facilitator Verify", () => {
  const mockServer = {
    simulateTransaction: vi.fn(),
  } as unknown as rpc.Server;

  const CLIENT_SECRET = "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK";
  const CLIENT_PUBLIC = "GBBO4ZDDZTSM2IUKQYBAST3CFHNPFXECGEFTGWTA2WELR2BIWDK57UVE";
  const SERVER_PUBLIC = "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W";
  const ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

  let mockSigner: ReturnType<typeof createStellarSigner>;
  let facilitatorSigner: ReturnType<typeof createStellarSigner>;

  const validRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "stellar-testnet",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test payment",
    mimeType: "application/json",
    payTo: SERVER_PUBLIC,
    maxTimeoutSeconds: 60,
    asset: ASSET,
  };

  let validPayload: PaymentPayload;

  beforeAll(async () => {
    // Set up mocks for payload creation
    vi.mocked(stellarRpc.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(stellarRpc.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");
    vi.mocked(stellarRpc.getRpcClient).mockReturnValue(mockServer);

    // Create a valid payment payload once for all tests
    mockSigner = createStellarSigner(CLIENT_SECRET, "stellar-testnet");
    // Create a mock facilitator signer (we only need the address for verification tests)
    facilitatorSigner = {
      address: SERVER_PUBLIC,
      signAuthEntry: vi.fn(),
      signTransaction: vi.fn(),
    };
    validPayload = await createAndSignPayment(mockSigner, 1, validRequirements);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stellarRpc.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
    vi.mocked(stellarRpc.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");
    vi.mocked(stellarRpc.getRpcClient).mockReturnValue(mockServer);
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
      let result = await verify(mockSigner, { ...validPayload, x402Version: 9 }, validRequirements);
      expect(result).toEqual(invalidResponse("invalid_x402_version"));

      result = await verify(
        mockSigner,
        { ...validPayload, scheme: "invalid" as "exact" },
        validRequirements,
      );
      expect(result).toEqual(invalidResponse("invalid_scheme"));

      result = await verify(
        mockSigner,
        { ...validPayload, network: "base-sepolia" },
        validRequirements,
      );
      expect(result).toEqual(invalidResponse("invalid_network"));
    });

    it("should reject mismatching requirement<>payload networks", async () => {
      const requirements: PaymentRequirements = { ...validRequirements, network: "base-sepolia" };
      const result = await verify(mockSigner, validPayload, requirements);
      expect(result).toEqual(invalidResponse("invalid_network"));
    });

    it("should reject malformed transaction XDR", async () => {
      const payload = { ...validPayload, payload: { transaction: "AAAA" } };
      const result = await verify(mockSigner, payload, validRequirements);
      expect(result).toEqual(invalidResponse("invalid_exact_stellar_payload_malformed"));
    });

    // TODO: build tx with wrong operation

    it("should reject wrong asset, recipient, or amount", async () => {
      let result = await verify(mockSigner, validPayload, {
        ...validRequirements,
        asset: "CDNVQW44C3HALYNVQ4SOBXY5EWYTGVYXX6JPESOLQDABJI5FC5LTRRUE",
      });
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_wrong_asset");

      result = await verify(mockSigner, validPayload, {
        ...validRequirements,
        payTo: "GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER",
      });
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_wrong_recipient");
      expect(result.payer).toBe(CLIENT_PUBLIC);

      result = await verify(mockSigner, validPayload, {
        ...validRequirements,
        maxAmountRequired: "1000001",
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

      const result = await verify(facilitatorSigner, validPayload, validRequirements);
      expect(result.invalidReason).toBe("invalid_exact_stellar_payload_simulation_failed");
      expect(result.payer).toBe(CLIENT_PUBLIC);
    });

    describe("should reject when source is unauthorized", () => {
      const testCases = [
        {
          name: "operation.source",
          txSource: CLIENT_PUBLIC,
          opSource: SERVER_PUBLIC,
        },
        {
          name: "transaction.source",
          txSource: SERVER_PUBLIC,
          opSource: undefined, // Use original operation source
        },
      ];

      for (const testCase of testCases) {
        it(`should reject ${testCase.name} == facilitatorAccount`, async () => {
          // Parse the valid transaction
          const networkPassphrase = StellarNetworks.TESTNET;
          const stellarPayload = ExactStellarPayloadSchema.parse(validPayload.payload);
          const txEnvelope = xdr.TransactionEnvelope.fromXDR(stellarPayload.transaction, "base64");
          const transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
          const sorobanData = txEnvelope.v1()?.tx()?.ext()?.sorobanData() || undefined;
          const operation = transaction.operations[0] as Operation.InvokeHostFunction;

          if (!sorobanData) {
            throw new Error("Missing sorobanData in test transaction");
          }

          // Create a new operation with potentially modified source
          const modifiedOperation = Operation.invokeHostFunction({
            func: operation.func,
            auth: operation.auth || [],
            source: testCase.opSource ?? operation.source,
          });

          // Create a new transaction with the modified source
          const account = new Account(testCase.txSource, "100");
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

          const result = await verify(facilitatorSigner, modifiedPayload, validRequirements);
          expect(result.invalidReason).toBe("invalid_exact_stellar_payload_unsafe_tx_or_op_source");
          expect(result.payer).toBe(CLIENT_PUBLIC);
        });
      }
    });
  });

  describe("successful verification", () => {
    it("should verify valid payment", async () => {
      const result = await verify(mockSigner, validPayload, validRequirements);
      expect(result.isValid).toBe(true);
      expect(result.payer).toBe(CLIENT_PUBLIC);
      expect(stellarRpc.getRpcClient).toHaveBeenCalledWith("stellar-testnet", undefined);
      expect(mockServer.simulateTransaction).toHaveBeenCalled();
    });
  });
});
