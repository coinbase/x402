import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client as XrplClient, Wallet } from "xrpl";
import { ExactXrpScheme as ClientScheme } from "../../src/exact/client/scheme";
import { ExactXrpScheme as FacilitatorScheme } from "../../src/exact/facilitator/scheme";
import { ExactXrpScheme as ServerScheme } from "../../src/exact/server/scheme";
import { toClientXrpSigner, FacilitatorXrpClient } from "../../src/signer";

/**
 * Integration tests for XRP payment flow
 * These tests demonstrate the full payment lifecycle using mocked components
 * For live network tests, actual XRPL connections would be required
 */

describe("XRP Integration Tests", () => {
  let clientWallet: Wallet;
  let recipientWallet: Wallet;
  
  let clientScheme: ClientScheme;
  let serverScheme: ServerScheme;
  let facilitatorClient: FacilitatorXrpClient;
  let facilitatorScheme: FacilitatorScheme;

  beforeAll(async () => {
    // Generate wallets for testing
    clientWallet = Wallet.generate();
    recipientWallet = Wallet.generate();

    // Setup client scheme
    const clientSigner = toClientXrpSigner(clientWallet);
    clientScheme = new ClientScheme(clientSigner, {
      serverUrl: "wss://testnet.xrpl-labs.com",
      maxFeeDrops: "1000",
      lastLedgerOffset: 20,
    });

    // Setup server scheme
    serverScheme = new ServerScheme();

    // Setup facilitator (using mock client for unit testing)
    facilitatorClient = new FacilitatorXrpClient({
      server: "wss://testnet.xrpl-labs.com",
      maxRetries: 3,
      retryDelayMs: 1000,
      validationTimeoutMs: 60000,
    });
    facilitatorClient.addAddress("rFacilitatorAddress123456789");
    
    facilitatorScheme = new FacilitatorScheme(facilitatorClient);
  });

  afterAll(async () => {
    await clientScheme.disconnect();
    await facilitatorClient.disconnect();
  });

  describe("Scheme properties", () => {
    it("should have correct scheme identifiers", () => {
      expect(clientScheme.scheme).toBe("exact");
      expect(serverScheme.scheme).toBe("exact");
      expect(facilitatorScheme.scheme).toBe("exact");
    });

    it("should have correct CAIP family for facilitator", () => {
      expect(facilitatorScheme.caipFamily).toBe("xrp:*");
    });

    it("should return no extra data from facilitator", () => {
      expect(facilitatorScheme.getExtra("xrp:testnet")).toBeUndefined();
      expect(facilitatorScheme.getExtra("xrp:mainnet")).toBeUndefined();
    });

    it("should return signer addresses from facilitator", () => {
      const addresses = facilitatorScheme.getSigners("xrp:testnet");
      expect(addresses).toContain("rFacilitatorAddress123456789");
    });
  });

  describe("Server parsePrice", () => {
    it("should parse price amounts correctly", async () => {
      const testCases = [
        { input: "1", expectedAsset: "XRP" },
        { input: "0.01", expectedAsset: "XRP" },
        { input: 1.5, expectedAsset: "XRP" },
        { input: { amount: "50000", asset: "XRP" }, expectedAsset: "XRP", expectedAmount: "50000" },
      ];

      for (const { input, expectedAsset, expectedAmount } of testCases) {
        const result = await serverScheme.parsePrice(input, "xrp:testnet");
        expect(result.asset).toBe(expectedAsset);
        if (expectedAmount) {
          expect(result.amount).toBe(expectedAmount);
        }
        expect(result).toHaveProperty("extra");
      }
    });

    it("should handle all XRP network identifiers for pricing", async () => {
      const networks = ["xrp:mainnet", "xrp:testnet", "xrp:devnet"] as const;
      
      for (const network of networks) {
        const result = await serverScheme.parsePrice("1", network);
        expect(result.asset).toBe("XRP");
        expect(BigInt(result.amount)).toBeGreaterThan(0);
      }
    });
  });

  describe("Server enhancePaymentRequirements", () => {
    it("should pass through requirements unchanged", async () => {
      const baseRequirements = {
        scheme: "exact" as const,
        network: "xrp:testnet" as const,
        amount: "10000",
        asset: "XRP" as const,
        payTo: recipientWallet.address,
        maxTimeoutSeconds: 60,
        extra: {
          destinationTag: 12345,
          memo: {
            memoType: "x402_payment",
            memoData: "74657374",
          },
        },
      };

      const supportedKind = {
        x402Version: 2,
        scheme: "exact",
        network: "xrp:testnet" as const,
      };

      const result = await serverScheme.enhancePaymentRequirements(
        baseRequirements,
        supportedKind,
        []
      );

      expect(result).toEqual(baseRequirements);
    });
  });

  describe("Client scheme configuration", () => {
    it("should accept various config options", () => {
      const clientWithDefaults = new ClientScheme(toClientXrpSigner(clientWallet));
      expect(clientWithDefaults).toBeDefined();

      const clientWithCustomConfig = new ClientScheme(
        toClientXrpSigner(clientWallet),
        {
          serverUrl: "wss://s1.ripple.com",
          maxFeeDrops: "500",
          lastLedgerOffset: 50,
        }
      );
      expect(clientWithCustomConfig).toBeDefined();

      const clientWithEmptyConfig = new ClientScheme(
        toClientXrpSigner(clientWallet),
        {}
      );
      expect(clientWithEmptyConfig).toBeDefined();
    });

    it("should handle connection lifecycle", async () => {
      // Connection methods should not throw
      await expect(clientScheme.connect()).resolves.not.toThrow();
      await expect(clientScheme.disconnect()).resolves.not.toThrow();
    });
  });

  describe("Facilitator scheme configuration", () => {
    it("should accept various config options", () => {
      const mockSigner = {
        getAddresses: () => ["rAddress1"],
        submitTransaction: async () => ({ hash: "hash123" }),
        waitForValidation: async () => ({ validated: true, result: "tesSUCCESS" }),
        verifySignature: async () => true,
        getAccountInfo: async () => ({ balance: "100000000", sequence: 1, ownerCount: 0 }),
        getLedgerIndex: async () => 1000,
        getFee: async () => "12",
      };

      const facilitatorWithDefaults = new FacilitatorScheme(mockSigner);
      expect(facilitatorWithDefaults).toBeDefined();

      const facilitatorWithConfig = new FacilitatorScheme(mockSigner, {
        autoFundDestinations: true,
        newAccountFundingXrp: 2,
      });
      expect(facilitatorWithConfig).toBeDefined();

      const facilitatorWithEmptyConfig = new FacilitatorScheme(mockSigner, {});
      expect(facilitatorWithEmptyConfig).toBeDefined();
    });
  });

  describe("Network support", () => {
    it("should handle all XRP network identifiers", async () => {
      const networks = [
        "xrp:mainnet",
        "xrp:testnet",
        "xrp:devnet",
      ] as const;

      for (const network of networks) {
        // Server parsePrice should work
        const priceResult = await serverScheme.parsePrice("10000", network);
        expect(priceResult.asset).toBe("XRP");

        // Server enhancePaymentRequirements should work
        const requirements = {
          scheme: "exact" as const,
          network,
          amount: "10000",
          asset: "XRP" as const,
          payTo: recipientWallet.address,
        };
        const enhanced = await serverScheme.enhancePaymentRequirements(
          requirements,
          { x402Version: 2, scheme: "exact", network },
          []
        );
        expect(enhanced.network).toBe(network);
      }
    });
  });

  describe("Facilitator verify with mocked signer", () => {
    it("should verify valid payment payload", async () => {
      const mockSigner = {
        getAddresses: () => ["rFacilitator"],
        submitTransaction: vi.fn(),
        waitForValidation: vi.fn(),
        verifySignature: vi.fn().mockResolvedValue(true),
        getLedgerIndex: vi.fn().mockResolvedValue(950),
        getAccountInfo: vi.fn().mockResolvedValue({
          balance: "20000000", // 20 XRP (enough for payment)
          sequence: 1,
          ownerCount: 0,
        }),
        getFee: vi.fn().mockResolvedValue("12"),
      };

      const testScheme = new FacilitatorScheme(mockSigner as any);

      const requirements = {
        scheme: "exact" as const,
        network: "xrp:testnet" as const,
        amount: "10000",
        asset: "XRP" as const,
        payTo: recipientWallet.address,
      };

      const payload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: requirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: clientWallet.address,
            Destination: recipientWallet.address,
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        },
      };

      const result = await testScheme.verify(payload, requirements);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe(clientWallet.address);
    });

    it("should reject payment with invalid signature", async () => {
      const mockSigner = {
        getAddresses: () => ["rFacilitator"],
        submitTransaction: vi.fn(),
        waitForValidation: vi.fn(),
        verifySignature: vi.fn().mockResolvedValue(false),
        getAccountInfo: vi.fn(),
        getLedgerIndex: vi.fn(),
        getFee: vi.fn(),
      };

      const testScheme = new FacilitatorScheme(mockSigner);

      const requirements = {
        scheme: "exact" as const,
        network: "xrp:testnet" as const,
        amount: "10000",
        asset: "XRP" as const,
        payTo: recipientWallet.address,
      };

      const payload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: requirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: clientWallet.address,
            Destination: recipientWallet.address,
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        },
      };

      const result = await testScheme.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Facilitator settle with mocked signer", () => {
    it("should settle valid payment", async () => {
      const mockSigner = {
        getAddresses: () => ["rFacilitator"],
        submitTransaction: vi.fn().mockResolvedValue({ hash: "ABC123" }),
        waitForValidation: vi.fn().mockResolvedValue({
          validated: true,
          result: "tesSUCCESS",
        }),
        verifySignature: vi.fn(),
        getAccountInfo: vi.fn(),
        getLedgerIndex: vi.fn(),
        getFee: vi.fn(),
      };

      const testScheme = new FacilitatorScheme(mockSigner);

      const requirements = {
        scheme: "exact" as const,
        network: "xrp:testnet" as const,
        amount: "10000",
        asset: "XRP" as const,
        payTo: recipientWallet.address,
      };

      const payload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: requirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: clientWallet.address,
            Destination: recipientWallet.address,
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        },
      };

      const result = await testScheme.settle(payload, requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("ABC123");
      expect(result.payer).toBe(clientWallet.address);
      expect(result.network).toBe("xrp:testnet");
    });

    it("should handle settlement failure", async () => {
      const mockSigner = {
        getAddresses: () => ["rFacilitator"],
        submitTransaction: vi.fn().mockRejectedValue(new Error("Submit failed")),
        waitForValidation: vi.fn(),
        verifySignature: vi.fn(),
        getAccountInfo: vi.fn(),
        getLedgerIndex: vi.fn(),
        getFee: vi.fn(),
      };

      const testScheme = new FacilitatorScheme(mockSigner);

      const requirements = {
        scheme: "exact" as const,
        network: "xrp:testnet" as const,
        amount: "10000",
        asset: "XRP" as const,
        payTo: recipientWallet.address,
      };

      const payload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: requirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: clientWallet.address,
            Destination: recipientWallet.address,
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        },
      };

      const result = await testScheme.settle(payload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("SUBMIT_FAILED");
    });
  });
});

// vi import for mocking
import { vi } from "vitest";
