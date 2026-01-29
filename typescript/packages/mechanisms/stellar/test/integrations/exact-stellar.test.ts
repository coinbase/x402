import { x402Client, x402HTTPClient } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  HTTPAdapter,
  HTTPResponseInstructions,
  x402HTTPResourceServer,
  x402ResourceServer,
  FacilitatorClient,
} from "@x402/core/server";
import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from "@x402/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { createEd25519Signer, STELLAR_TESTNET_CAIP2, USDC_TESTNET_ADDRESS } from "../../src";
import { ExactStellarScheme as ExactStellarClient } from "../../src/exact/client";
import { ExactStellarScheme as ExactStellarFacilitator } from "../../src/exact/facilitator";
import { ExactStellarScheme as ExactStellarServer } from "../../src/exact/server";
import type { ExactStellarPayloadV2 } from "../../src/types";

// Load private keys and addresses from environment
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY;
const FACILITATOR_ADDRESS = process.env.FACILITATOR_ADDRESS;
const RESOURCE_SERVER_ADDRESS = process.env.RESOURCE_SERVER_ADDRESS;

if (
  !CLIENT_PRIVATE_KEY ||
  !FACILITATOR_PRIVATE_KEY ||
  !FACILITATOR_ADDRESS ||
  !RESOURCE_SERVER_ADDRESS
) {
  throw new Error(
    "CLIENT_PRIVATE_KEY, FACILITATOR_PRIVATE_KEY, FACILITATOR_ADDRESS and RESOURCE_SERVER_ADDRESS environment variables must be set for integration tests",
  );
}

/**
 * Stellar Facilitator Client wrapper
 * Wraps the x402Facilitator for use with x402ResourceServer
 */
class StellarFacilitatorClient implements FacilitatorClient {
  readonly scheme = "exact";
  readonly network = STELLAR_TESTNET_CAIP2;
  readonly x402Version = 2;

  /**
   * Creates a new StellarFacilitatorClient instance
   *
   * @param facilitator - The x402 facilitator to wrap
   */
  constructor(private readonly facilitator: x402Facilitator) {}

  /**
   * Verifies a payment payload
   *
   * @param paymentPayload - The payment payload to verify
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  /**
   * Settles a payment
   *
   * @param paymentPayload - The payment payload to settle
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  /**
   * Gets supported payment kinds
   *
   * @returns Promise resolving to supported response
   */
  getSupported(): Promise<SupportedResponse> {
    // Delegate to actual facilitator to get real supported kinds
    // This includes fee sponsorship metadata
    return Promise.resolve(this.facilitator.getSupported() as SupportedResponse);
  }
}

/**
 * Build Stellar payment requirements for testing
 *
 * @param payTo - The recipient address
 * @param amount - The payment amount in smallest units
 * @param network - The network identifier (defaults to Stellar Testnet)
 * @returns Payment requirements object
 */
function buildStellarPaymentRequirements(
  payTo: string,
  amount: string,
  network: Network = STELLAR_TESTNET_CAIP2,
): PaymentRequirements {
  return {
    scheme: "exact",
    network,
    asset: USDC_TESTNET_ADDRESS,
    amount,
    payTo,
    maxTimeoutSeconds: 3600,
    extra: { areFeesSponsored: true },
  };
}

/**
 * Helper to check if an error is due to insufficient balance
 */
function isInsufficientBalanceError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("resulting balance is not within the allowed range") ||
      error.message.includes("insufficient balance") ||
      error.message.includes("Error(Contract, #10)")
    );
  }
  return false;
}

describe("Stellar Integration Tests", () => {
  describe("x402Client / x402ResourceServer / x402Facilitator - Stellar Flow", () => {
    let client: x402Client;
    let server: x402ResourceServer;
    let facilitatorClient: StellarFacilitatorClient;
    let clientAddress: string;

    beforeEach(async () => {
      const clientSigner = createEd25519Signer(CLIENT_PRIVATE_KEY, STELLAR_TESTNET_CAIP2);
      clientAddress = clientSigner.address;

      const stellarClient = new ExactStellarClient(clientSigner, {
        url: "https://soroban-testnet.stellar.org",
      });
      client = new x402Client().register(STELLAR_TESTNET_CAIP2, stellarClient);

      const facilitatorSigner = createEd25519Signer(FACILITATOR_PRIVATE_KEY, STELLAR_TESTNET_CAIP2);

      const stellarFacilitator = new ExactStellarFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().register(STELLAR_TESTNET_CAIP2, stellarFacilitator);

      facilitatorClient = new StellarFacilitatorClient(facilitator);
      server = new x402ResourceServer(facilitatorClient);
      server.register(STELLAR_TESTNET_CAIP2, new ExactStellarServer());
      await server.initialize();
    });

    it("server should successfully verify and settle a Stellar payment from a client", async () => {
      const baseRequirements = buildStellarPaymentRequirements(RESOURCE_SERVER_ADDRESS, "1000");
      const accepts = [baseRequirements];
      const resource = {
        url: "https://company.co",
        description: "Company Co. resource",
        mimeType: "application/json",
      };
      const paymentRequired = await server.createPaymentRequiredResponse(accepts, resource);

      let paymentPayload: PaymentPayload;
      try {
        paymentPayload = await client.createPaymentPayload(paymentRequired);
      } catch (error) {
        if (isInsufficientBalanceError(error)) {
          throw new Error(
            `Insufficient USDC balance on testnet account ${clientAddress}. ` +
              `Please fund the account with testnet USDC at ${USDC_TESTNET_ADDRESS}. ` +
              `You can use the Stellar Testnet Friendbot or transfer testnet USDC to the account.`,
          );
        }
        throw error;
      }

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.x402Version).toBe(2);
      expect(paymentPayload.accepted.scheme).toBe("exact");

      const stellarPayload = paymentPayload.payload as ExactStellarPayloadV2;
      expect(stellarPayload.transaction).toBeDefined();
      expect(typeof stellarPayload.transaction).toBe("string");
      expect(stellarPayload.transaction.length).toBeGreaterThan(0);

      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);

      expect(verifyResponse.isValid).toBe(true);
      expect(verifyResponse.payer).toBe(clientAddress);

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      expect(settleResponse.success).toBe(true);
      expect(settleResponse.network).toBe(STELLAR_TESTNET_CAIP2);
      expect(settleResponse.transaction).toBeDefined();
      expect(settleResponse.payer).toBe(clientAddress);
    });
  });

  describe("x402HTTPClient / x402HTTPResourceServer / x402Facilitator - Stellar Flow", () => {
    let client: x402HTTPClient;
    let httpServer: x402HTTPResourceServer;

    const routes = {
      "/api/protected": {
        accepts: {
          scheme: "exact",
          payTo: RESOURCE_SERVER_ADDRESS,
          price: "$0.0001",
          network: STELLAR_TESTNET_CAIP2 as Network,
        },
        description: "Access to protected API",
        mimeType: "application/json",
      },
    };

    const mockAdapter: HTTPAdapter = {
      getHeader: () => {
        return undefined;
      },
      getMethod: () => "GET",
      getPath: () => "/api/protected",
      getUrl: () => "https://example.com/api/protected",
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "TestClient/1.0",
    };

    beforeEach(async () => {
      const facilitatorSigner = createEd25519Signer(FACILITATOR_PRIVATE_KEY, STELLAR_TESTNET_CAIP2);

      const stellarFacilitator = new ExactStellarFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().register(STELLAR_TESTNET_CAIP2, stellarFacilitator);

      const facilitatorClient = new StellarFacilitatorClient(facilitator);

      const clientSigner = createEd25519Signer(CLIENT_PRIVATE_KEY, STELLAR_TESTNET_CAIP2);

      const stellarClient = new ExactStellarClient(clientSigner, {
        url: "https://soroban-testnet.stellar.org",
      });
      const paymentClient = new x402Client().register(STELLAR_TESTNET_CAIP2, stellarClient);
      client = new x402HTTPClient(paymentClient) as x402HTTPClient;

      // Create resource server and register schemes (composition pattern)
      const ResourceServer = new x402ResourceServer(facilitatorClient);
      ResourceServer.register(STELLAR_TESTNET_CAIP2, new ExactStellarServer());
      await ResourceServer.initialize(); // Initialize to fetch supported kinds

      httpServer = new x402HTTPResourceServer(ResourceServer, routes);
    });

    it("middleware should successfully verify and settle a Stellar payment from an http client", async () => {
      const context = {
        adapter: mockAdapter,
        path: "/api/protected",
        method: "GET",
      };

      const httpProcessResult = (await httpServer.processHTTPRequest(context))!;
      expect(httpProcessResult.type).toBe("payment-error");

      const initial402Response = (
        httpProcessResult as { type: "payment-error"; response: HTTPResponseInstructions }
      ).response;

      expect(initial402Response).toBeDefined();
      expect(initial402Response.status).toBe(402);
      expect(initial402Response.headers).toBeDefined();
      expect(initial402Response.headers["PAYMENT-REQUIRED"]).toBeDefined();

      const paymentRequired = client.getPaymentRequiredResponse(
        name => initial402Response.headers[name],
        initial402Response.body,
      );
      let paymentPayload: PaymentPayload;
      try {
        paymentPayload = await client.createPaymentPayload(paymentRequired);
      } catch (error) {
        if (isInsufficientBalanceError(error)) {
          const clientSigner = createEd25519Signer(CLIENT_PRIVATE_KEY, STELLAR_TESTNET_CAIP2);
          throw new Error(
            `Insufficient USDC balance on testnet account ${clientSigner.address}. ` +
              `Please fund the account with testnet USDC at ${USDC_TESTNET_ADDRESS}. ` +
              `You can use the Stellar Testnet Friendbot or transfer testnet USDC to the account.`,
          );
        }
        throw error;
      }

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.accepted.scheme).toBe("exact");

      const requestHeaders = await client.encodePaymentSignatureHeader(paymentPayload);

      mockAdapter.getHeader = (name: string) => {
        if (name === "PAYMENT-SIGNATURE") {
          return requestHeaders["PAYMENT-SIGNATURE"];
        }
        return undefined;
      };

      const httpProcessResult2 = await httpServer.processHTTPRequest(context);

      expect(httpProcessResult2.type).toBe("payment-verified");
      const {
        paymentPayload: verifiedPaymentPayload,
        paymentRequirements: verifiedPaymentRequirements,
      } = httpProcessResult2 as {
        type: "payment-verified";
        paymentPayload: PaymentPayload;
        paymentRequirements: PaymentRequirements;
      };

      expect(verifiedPaymentPayload).toBeDefined();
      expect(verifiedPaymentRequirements).toBeDefined();

      const settlementResult = await httpServer.processSettlement(
        verifiedPaymentPayload,
        verifiedPaymentRequirements,
      );

      expect(settlementResult).toBeDefined();
      expect(settlementResult.success).toBe(true);

      if (settlementResult.success) {
        expect(settlementResult.headers).toBeDefined();
        expect(settlementResult.headers["PAYMENT-RESPONSE"]).toBeDefined();
      }
    });
  });

  describe("Price Parsing Integration", () => {
    let server: x402ResourceServer;
    let stellarServer: ExactStellarServer;

    beforeEach(async () => {
      const facilitatorSigner = createEd25519Signer(FACILITATOR_PRIVATE_KEY, STELLAR_TESTNET_CAIP2);

      const facilitator = new x402Facilitator().register(
        STELLAR_TESTNET_CAIP2,
        new ExactStellarFacilitator(facilitatorSigner),
      );

      const facilitatorClient = new StellarFacilitatorClient(facilitator);
      server = new x402ResourceServer(facilitatorClient);

      stellarServer = new ExactStellarServer();
      server.register(STELLAR_TESTNET_CAIP2, stellarServer);
      await server.initialize();
    });

    it("should parse Money formats and build payment requirements", async () => {
      // Test different Money formats
      const testCases = [
        { input: "$1.00", expectedAmount: "10000000" },
        { input: "1.50", expectedAmount: "15000000" },
        { input: 2.5, expectedAmount: "25000000" },
      ];

      for (const testCase of testCases) {
        const requirements = await server.buildPaymentRequirements({
          scheme: "exact",
          payTo: RESOURCE_SERVER_ADDRESS,
          price: testCase.input,
          network: STELLAR_TESTNET_CAIP2 as Network,
        });

        expect(requirements).toHaveLength(1);
        expect(requirements[0].amount).toBe(testCase.expectedAmount);
        expect(requirements[0].asset).toBe(USDC_TESTNET_ADDRESS);
      }
    });

    it("should handle AssetAmount pass-through", async () => {
      const customAsset = {
        amount: "50000000",
        asset: "CUSTOMTOKENMINT111111111111111111111111111111",
        extra: { foo: "bar" },
      };

      const requirements = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: customAsset,
        network: STELLAR_TESTNET_CAIP2 as Network,
      });

      expect(requirements).toHaveLength(1);
      expect(requirements[0].amount).toBe("50000000");
      expect(requirements[0].asset).toBe("CUSTOMTOKENMINT111111111111111111111111111111");
      expect(requirements[0].extra?.foo).toBe("bar");
    });

    it("should use registerMoneyParser for custom conversion", async () => {
      // Register custom parser: large amounts use custom token
      stellarServer.registerMoneyParser(async (amount, _network) => {
        if (amount > 100) {
          return {
            amount: (amount * 1e7).toString(), // Custom token with 7 decimals (Stellar default)
            asset: "CUSTOMLARGETOKENMINT111111111111111111111",
            extra: { token: "CUSTOM", tier: "large" },
          };
        }
        return null; // Use default for small amounts
      });

      // Test large amount - should use custom parser
      const largeRequirements = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: 150, // Large amount
        network: STELLAR_TESTNET_CAIP2 as Network,
      });

      expect(largeRequirements[0].amount).toBe((150 * 1e7).toString());
      expect(largeRequirements[0].asset).toBe("CUSTOMLARGETOKENMINT111111111111111111111");
      expect(largeRequirements[0].extra?.token).toBe("CUSTOM");
      expect(largeRequirements[0].extra?.tier).toBe("large");

      // Test small amount - should use default USDC
      const smallRequirements = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: 50, // Small amount
        network: STELLAR_TESTNET_CAIP2 as Network,
      });

      expect(smallRequirements[0].amount).toBe("500000000"); // 50 * 1e7 (Stellar default decimals)
      expect(smallRequirements[0].asset).toBe(USDC_TESTNET_ADDRESS);
    });

    it("should support multiple MoneyParser in chain", async () => {
      stellarServer
        .registerMoneyParser(async amount => {
          if (amount > 1000) {
            return {
              amount: (amount * 1e7).toString(),
              asset: "VIPTOKENMINT111111111111111111111111111111",
              extra: { tier: "vip" },
            };
          }
          return null;
        })
        .registerMoneyParser(async amount => {
          if (amount > 100) {
            return {
              amount: (amount * 1e7).toString(),
              asset: "PREMIUMTOKENMINT1111111111111111111111111",
              extra: { tier: "premium" },
            };
          }
          return null;
        });
      // < 100 uses default USDC

      // VIP tier
      const vipReq = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: 2000,
        network: STELLAR_TESTNET_CAIP2 as Network,
      });
      expect(vipReq[0].extra?.tier).toBe("vip");
      expect(vipReq[0].asset).toBe("VIPTOKENMINT111111111111111111111111111111");

      // Premium tier
      const premiumReq = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: 500,
        network: STELLAR_TESTNET_CAIP2 as Network,
      });
      expect(premiumReq[0].extra?.tier).toBe("premium");
      expect(premiumReq[0].asset).toBe("PREMIUMTOKENMINT1111111111111111111111111");

      // Standard tier (default)
      const standardReq = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: 50,
        network: STELLAR_TESTNET_CAIP2 as Network,
      });
      expect(standardReq[0].asset).toBe(USDC_TESTNET_ADDRESS);
    });

    it("should work with async MoneyParser (e.g., exchange rate lookup)", async () => {
      const mockExchangeRate = 0.98;

      stellarServer.registerMoneyParser(async (amount, _network) => {
        // Simulate async API call
        await new Promise(resolve => setTimeout(resolve, 10));

        const usdcAmount = amount * mockExchangeRate;
        return {
          amount: Math.floor(usdcAmount * 1e7).toString(),
          asset: USDC_TESTNET_ADDRESS,
          extra: {
            exchangeRate: mockExchangeRate,
            originalUSD: amount,
          },
        };
      });

      const requirements = await server.buildPaymentRequirements({
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: 100,
        network: STELLAR_TESTNET_CAIP2 as Network,
      });

      // 100 USD * 0.98 = 98 USDC
      expect(requirements[0].amount).toBe("980000000");
      expect(requirements[0].extra?.exchangeRate).toBe(0.98);
      expect(requirements[0].extra?.originalUSD).toBe(100);
    });

    it("should avoid floating-point rounding error", async () => {
      // Test different Money formats
      const testCases = [
        { input: "$4.02", expectedAmount: "40200000" },
        { input: "4.02", expectedAmount: "40200000" },
        { input: "4.02 USDC", expectedAmount: "40200000" },
        { input: "4.02 USD", expectedAmount: "40200000" },
        { input: 4.02, expectedAmount: "40200000" },
      ];

      for (const testCase of testCases) {
        const requirements = await server.buildPaymentRequirements({
          scheme: "exact",
          payTo: RESOURCE_SERVER_ADDRESS,
          price: testCase.input,
          network: STELLAR_TESTNET_CAIP2 as Network,
        });

        expect(requirements).toHaveLength(1);
        expect(requirements[0].amount).toBe(testCase.expectedAmount);
        expect(requirements[0].asset).toBe(USDC_TESTNET_ADDRESS);
      }
    });
  });
});
