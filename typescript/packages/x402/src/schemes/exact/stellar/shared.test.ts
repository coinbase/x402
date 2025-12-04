import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SorobanDataBuilder,
  xdr,
  Networks as StellarNetworks,
  Transaction,
} from "@stellar/stellar-sdk";
import { Api } from "@stellar/stellar-sdk/rpc";
import { createAndSignPayment } from "./client";
import { handleSimulationResult, gatherAuthEntrySignatureStatus } from "./shared";
import * as stellarShared from "../../../shared/stellar";
import { createStellarSigner } from "../../../shared/stellar/signer";
import type { PaymentRequirements } from "../../../types/verify";

vi.mock("../../../shared/stellar", async () => {
  const actual = await vi.importActual<typeof stellarShared>("../../../shared/stellar");
  return {
    ...actual,
    getNetworkPassphrase: vi.fn(),
    getRpcUrl: vi.fn(),
  };
});

describe("Stellar Shared Utilities", () => {
  describe("handleSimulationResult", () => {
    it("should throw error when simulation is undefined", () => {
      expect(() => handleSimulationResult(undefined)).toThrow("Simulation result is undefined");
    });

    it("should throw error when simulation has type RESTORE", () => {
      const mockRestoreSimulation: Api.SimulateTransactionResponse = {
        id: "test-id",
        latestLedger: 12345,
        events: [],
        _parsed: true,
        result: {
          auth: [],
          retval: xdr.ScVal.scvVoid(),
        },
        restorePreamble: {
          minResourceFee: "100",
          transactionData: new SorobanDataBuilder(),
        },
        transactionData: new SorobanDataBuilder(),
        minResourceFee: "100",
      } as Api.SimulateTransactionRestoreResponse;

      expect(() => handleSimulationResult(mockRestoreSimulation)).toThrow(
        /Stellar simulation result has type "RESTORE"/,
      );
    });

    it("should throw error when simulation has type ERROR", () => {
      const mockErrorSimulation: Api.SimulateTransactionResponse = {
        id: "test-id",
        latestLedger: 12345,
        _parsed: true,
        error: "Transaction simulation failed: insufficient balance",
      } as Api.SimulateTransactionErrorResponse;

      expect(() => handleSimulationResult(mockErrorSimulation)).toThrow(
        /Stellar simulation failed with error message: Transaction simulation failed: insufficient balance/,
      );
    });

    it("should handle simulation with empty error message", () => {
      const mockErrorSimulation: Api.SimulateTransactionResponse = {
        id: "test-id",
        latestLedger: 12345,
        _parsed: true,
        error: "",
      } as Api.SimulateTransactionErrorResponse;

      expect(() => handleSimulationResult(mockErrorSimulation)).toThrow(
        /Stellar simulation failed/,
      );
    });

    it("should not throw error when simulation is successful", () => {
      const mockSuccessSimulation: Api.SimulateTransactionResponse = {
        id: "test-id",
        latestLedger: 12345,
        events: [],
        _parsed: true,
        transactionData: new SorobanDataBuilder(),
        minResourceFee: "100",
      } as Api.SimulateTransactionSuccessResponse;

      expect(() => handleSimulationResult(mockSuccessSimulation)).not.toThrow();
    });
  });

  describe("gatherAuthEntrySignatureStatus", () => {
    const CLIENT_SECRET = "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK";
    const CLIENT_PUBLIC = "GBBO4ZDDZTSM2IUKQYBAST3CFHNPFXECGEFTGWTA2WELR2BIWDK57UVE";

    // paymenrRequirements is used to create a valid payload for the test
    const paymentRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "stellar-testnet",
      maxAmountRequired: "1000000",
      resource: "https://example.com",
      description: "Test",
      mimeType: "application/json",
      payTo: "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W",
      maxTimeoutSeconds: 60,
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(stellarShared.getNetworkPassphrase).mockReturnValue(StellarNetworks.TESTNET);
      vi.mocked(stellarShared.getRpcUrl).mockReturnValue("https://soroban-testnet.stellar.org");
    });

    it("should identify signed accounts and no pending signatures", async () => {
      const signer = createStellarSigner(CLIENT_SECRET, "stellar-testnet");
      const payload = await createAndSignPayment(signer, 1, paymentRequirements);

      if (!("transaction" in payload.payload)) {
        throw new Error("Expected Stellar payload with transaction property");
      }

      const tx = new Transaction(payload.payload.transaction, StellarNetworks.TESTNET);
      const status = gatherAuthEntrySignatureStatus({ transaction: tx });

      expect(status.alreadySigned).toContain(CLIENT_PUBLIC);
      expect(status.pendingSignature).toHaveLength(0);
    });
  });
});
