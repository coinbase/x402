import { describe, it, expect, beforeEach } from "vitest";
import {
  x402HTTPResourceServer,
  HTTPRequestContext,
  HTTPAdapter,
} from "../../../src/http/x402HTTPResourceServer";
import { x402ResourceServer } from "../../../src/server/x402ResourceServer";
import {
  MockFacilitatorClient,
  MockSchemeNetworkServer,
  buildSupportedResponse,
  buildVerifyResponse,
  buildSettleResponse,
  buildPaymentPayload,
  buildPaymentRequirements,
} from "../../mocks";
import {
  Network,
  Price,
  ResourceServerExtension,
  SettleResultContext,
  VerifyResultContext,
  PaymentRequiredContext,
} from "../../../src/types";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "../../../src/http";

// Mock HTTP Adapter
class MockHTTPAdapter implements HTTPAdapter {
  private headers: Record<string, string> = {};

  constructor(headers: Record<string, string> = {}) {
    this.headers = headers;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  getMethod(): string {
    return "GET";
  }

  getPath(): string {
    return "/api/test";
  }

  getUrl(): string {
    return "https://example.com/api/test";
  }

  getAcceptHeader(): string {
    return "application/json";
  }

  getUserAgent(): string {
    return "TestClient/1.0";
  }

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
}

describe("x402HTTPResourceServer Hooks", () => {
  let extensionResourceServer: x402ResourceServer;
  let extensionMockFacilitator: MockFacilitatorClient;
  let extensionMockScheme: MockSchemeNetworkServer;

  beforeEach(async () => {
    // Create a fresh ResourceServer for extension tests to avoid interference
    extensionMockFacilitator = new MockFacilitatorClient(
      buildSupportedResponse({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" as Network }],
      }),
      buildVerifyResponse({ isValid: true }),
    );

    extensionResourceServer = new x402ResourceServer(extensionMockFacilitator);

    extensionMockScheme = new MockSchemeNetworkServer("exact", {
      amount: "1000000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: {},
    });

    extensionResourceServer.register("eip155:8453" as Network, extensionMockScheme);
    await extensionResourceServer.initialize();
  });

  describe("enrichSettlementResponse", () => {
    it("should enrich settlement response with extensions", async () => {
      const receiptExtension: ResourceServerExtension = {
        key: "receipt",
        enrichSettlementResponse: async (_declaration: unknown, context: SettleResultContext) => {
          return {
            ...context.result,
            extensions: {
              receipt: {
                receipt: "Receipt",
              },
            },
          };
        },
      };

      extensionResourceServer.registerExtension(receiptExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            receipt: {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      const payload = buildPaymentPayload();
      const requirements = buildPaymentRequirements({
        scheme: "exact",
        network: "eip155:8453" as Network,
      });

      // Set up mock to return a successful settlement
      extensionMockFacilitator.setSettleResponse(
        buildSettleResponse({
          success: true,
          transaction: "0x40d32f49a3fa2356275083e348d53fca876df3a140d72a71cf26c9cbaab359d9",
          network: "eip155:8453" as Network,
          payer: "0xE33A295AF5C90A0649DFBECfDf9D604789B892e2",
        }),
      );

      const result = await httpServer.processSettlement(
        payload,
        requirements,
        routes["/api/test"].extensions,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Check that extensions were added
        expect((result as any).extensions).toBeDefined();
        expect((result as any).extensions.receipt).toBeDefined();
        expect((result as any).extensions.receipt.receipt).toBe("Receipt");
        expect(result.transaction).toBe(
          "0x40d32f49a3fa2356275083e348d53fca876df3a140d72a71cf26c9cbaab359d9",
        );
        expect(result.network).toBe("eip155:8453");
        expect(result.payer).toBe("0xE33A295AF5C90A0649DFBECfDf9D604789B892e2");
      }
    });

    it("should handle multiple extensions enriching settlement response", async () => {
      const receiptExtension: ResourceServerExtension = {
        key: "receipt",
        enrichSettlementResponse: async (_declaration: unknown, context: SettleResultContext) => {
          return {
            ...context.result,
            extensions: {
              ...(context.result.extensions || {}),
              receipt: { receipt: "Receipt" },
            },
          };
        },
      };

      const attestationExtension: ResourceServerExtension = {
        key: "attestation",
        enrichSettlementResponse: async (_declaration: unknown, context: SettleResultContext) => {
          return {
            ...context.result,
            extensions: {
              ...(context.result.extensions || {}),
              attestation: { attestationId: "attest-123" },
            },
          };
        },
      };

      extensionResourceServer.registerExtension(receiptExtension);
      extensionResourceServer.registerExtension(attestationExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            receipt: {},
            attestation: {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      const payload = buildPaymentPayload();
      const requirements = buildPaymentRequirements({
        scheme: "exact",
        network: "eip155:8453" as Network,
      });

      extensionMockFacilitator.setSettleResponse(buildSettleResponse({ success: true }));

      const result = await httpServer.processSettlement(
        payload,
        requirements,
        routes["/api/test"].extensions,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as any).extensions).toBeDefined();
        expect((result as any).extensions.receipt).toBeDefined();
        expect((result as any).extensions.attestation).toBeDefined();
      }
    });

    it("should continue processing if extension hook throws error", async () => {
      const errorExtension: ResourceServerExtension = {
        key: "error-extension",
        enrichSettlementResponse: async (_declaration: unknown, _context: SettleResultContext) => {
          throw new Error("Extension error");
        },
      };

      extensionResourceServer.registerExtension(errorExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            "error-extension": {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      const payload = buildPaymentPayload();
      const requirements = buildPaymentRequirements({
        scheme: "exact",
        network: "eip155:8453" as Network,
      });

      extensionMockFacilitator.setSettleResponse(buildSettleResponse({ success: true }));

      // Should not throw, should continue with unenriched response
      const result = await httpServer.processSettlement(
        payload,
        requirements,
        routes["/api/test"].extensions,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("enrichPaymentRequiredResponse", () => {
    it("should enrich PaymentRequired response before sending 402", async () => {
      const paymentRequiredExtension: ResourceServerExtension = {
        key: "payment-required-enricher",
        enrichPaymentRequiredResponse: async (
          _declaration: unknown,
          context: PaymentRequiredContext,
        ) => {
          return {
            ...context.paymentRequiredResponse,
            extensions: {
              ...context.paymentRequiredResponse.extensions,
              "payment-required-enricher": {
                metadata: "test-metadata",
              },
            },
          };
        },
      };

      extensionResourceServer.registerExtension(paymentRequiredExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            existing: "existing-value",
            "payment-required-enricher": {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      const adapter = new MockHTTPAdapter();
      const context: HTTPRequestContext = {
        adapter,
        path: "/api/test",
        method: "GET",
      };

      const result = await httpServer.processHTTPRequest(context);

      expect(result.type).toBe("payment-error");
      if (result.type === "payment-error") {
        const paymentRequiredHeader = result.response.headers["PAYMENT-REQUIRED"];
        const decoded = decodePaymentRequiredHeader(paymentRequiredHeader);
        expect(decoded.extensions).toBeDefined();
        if (decoded.extensions) {
          expect(decoded.extensions["payment-required-enricher"]).toBeDefined();
          expect((decoded.extensions["payment-required-enricher"] as any).metadata).toBe(
            "test-metadata",
          );
        }
      }
    });
  });

  describe("enrichVerificationResponse", () => {
    it("should enrich verification response after successful verification", async () => {
      const verificationExtension: ResourceServerExtension = {
        key: "verification-enricher",
        enrichVerificationResponse: async (_declaration: unknown, context: VerifyResultContext) => {
          return {
            ...context.result,
            extensions: {
              "verification-enricher": {
                enriched: true,
              },
            },
          };
        },
      };

      extensionResourceServer.registerExtension(verificationExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            "verification-enricher": {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      // First get the PaymentRequired to get the actual requirements
      const adapter1 = new MockHTTPAdapter();
      const context1: HTTPRequestContext = {
        adapter: adapter1,
        path: "/api/test",
        method: "GET",
      };

      const result1 = await httpServer.processHTTPRequest(context1);
      expect(result1.type).toBe("payment-error");
      if (result1.type !== "payment-error") {
        throw new Error("Expected payment-error");
      }

      const paymentRequiredHeader = result1.response.headers["PAYMENT-REQUIRED"];
      const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

      // Create a payment payload that matches the requirements
      const payload = buildPaymentPayload({
        accepted: paymentRequired.accepts[0],
        resource: paymentRequired.resource,
      });
      const paymentHeader = encodePaymentSignatureHeader(payload);

      const adapter = new MockHTTPAdapter({
        "payment-signature": paymentHeader,
      });

      const context: HTTPRequestContext = {
        adapter,
        path: "/api/test",
        method: "GET",
      };

      // Set up mock to return verification with payer
      extensionMockFacilitator.setVerifyResponse(
        buildVerifyResponse({
          isValid: true,
          payer: "0xOriginalPayer",
        }),
      );

      const result = await httpServer.processHTTPRequest(context);

      // Verification should succeed and the hook should have been called
      // The hook can modify the verification result
      expect(result.type).toBe("payment-verified");
    });

    it("should handle errors in verification enrichment gracefully", async () => {
      const errorExtension: ResourceServerExtension = {
        key: "error-verification",
        enrichVerificationResponse: async (
          _declaration: unknown,
          _context: VerifyResultContext,
        ) => {
          throw new Error("Verification enrichment error");
        },
      };

      extensionResourceServer.registerExtension(errorExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            "error-verification": {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      // First get the PaymentRequired to get the actual requirements
      const adapter1 = new MockHTTPAdapter();
      const context1: HTTPRequestContext = {
        adapter: adapter1,
        path: "/api/test",
        method: "GET",
      };

      const result1 = await httpServer.processHTTPRequest(context1);
      expect(result1.type).toBe("payment-error");
      if (result1.type !== "payment-error") {
        throw new Error("Expected payment-error");
      }

      const paymentRequiredHeader = result1.response.headers["PAYMENT-REQUIRED"];
      const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

      // Create a payment payload that matches the requirements
      const payload = buildPaymentPayload({
        accepted: paymentRequired.accepts[0],
        resource: paymentRequired.resource,
      });
      const paymentHeader = encodePaymentSignatureHeader(payload);

      const adapter = new MockHTTPAdapter({
        "payment-signature": paymentHeader,
      });

      const context: HTTPRequestContext = {
        adapter,
        path: "/api/test",
        method: "GET",
      };

      extensionMockFacilitator.setVerifyResponse(buildVerifyResponse({ isValid: true }));

      // Should not throw, should continue with unenriched verification result
      const result = await httpServer.processHTTPRequest(context);

      expect(result.type).toBe("payment-verified");
    });
  });

  describe("Integration: All hooks together", () => {
    it("should apply all extension hooks in sequence", async () => {
      const allHooksExtension: ResourceServerExtension = {
        key: "all-hooks",
        enrichPaymentRequiredResponse: async (
          _declaration: unknown,
          context: PaymentRequiredContext,
        ) => {
          return {
            ...context.paymentRequiredResponse,
            extensions: {
              ...context.paymentRequiredResponse.extensions,
              "all-hooks": {
                paymentRequiredEnriched: true,
              },
            },
          };
        },
        enrichVerificationResponse: async (_declaration: unknown, context: VerifyResultContext) => {
          return {
            ...context.result,
            extensions: {
              "all-hooks": {
                verificationEnriched: true,
              },
            },
          };
        },
        enrichSettlementResponse: async (_declaration: unknown, context: SettleResultContext) => {
          return {
            ...context.result,
            extensions: {
              "all-hooks": {
                receipt: {
                  receipt: "Receipt",
                },
              },
            },
          };
        },
      };

      extensionResourceServer.registerExtension(allHooksExtension);

      const routes = {
        "/api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0xabc",
            price: "$1.00" as Price,
            network: "eip155:8453" as Network,
          },
          extensions: {
            "all-hooks": {},
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(extensionResourceServer, routes);

      // Test payment requirements enrichment
      const adapter1 = new MockHTTPAdapter();
      const context1: HTTPRequestContext = {
        adapter: adapter1,
        path: "/api/test",
        method: "GET",
      };

      const result1 = await httpServer.processHTTPRequest(context1);
      expect(result1.type).toBe("payment-error");
      if (result1.type === "payment-error") {
        const paymentRequiredHeader = result1.response.headers["PAYMENT-REQUIRED"];
        const decoded = decodePaymentRequiredHeader(paymentRequiredHeader);
        expect(decoded.extensions).toBeDefined();
        if (decoded.extensions) {
          expect((decoded.extensions["all-hooks"] as any).paymentRequiredEnriched).toBe(true);
        }
      }

      // Test verification and settlement enrichment
      // Get requirements from the PaymentRequired response
      const paymentRequiredHeader = result1.response.headers["PAYMENT-REQUIRED"];
      const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

      const payload = buildPaymentPayload({
        accepted: paymentRequired.accepts[0],
        resource: paymentRequired.resource,
      });
      const paymentHeader = encodePaymentSignatureHeader(payload);

      const adapter2 = new MockHTTPAdapter({
        "payment-signature": paymentHeader,
      });

      const context2: HTTPRequestContext = {
        adapter: adapter2,
        path: "/api/test",
        method: "GET",
      };

      extensionMockFacilitator.setVerifyResponse(buildVerifyResponse({ isValid: true }));
      extensionMockFacilitator.setSettleResponse(
        buildSettleResponse({
          success: true,
          transaction: "0x40d32f49a3fa2356275083e348d53fca876df3a140d72a71cf26c9cbaab359d9",
          network: "eip155:8453" as Network,
          payer: "0xE33A295AF5C90A0649DFBECfDf9D604789B892e2",
        }),
      );

      const result2 = await httpServer.processHTTPRequest(context2);
      expect(result2.type).toBe("payment-verified");

      if (result2.type === "payment-verified") {
        const settleResult = await httpServer.processSettlement(
          result2.paymentPayload,
          result2.paymentRequirements,
          routes["/api/test"].extensions,
        );

        expect(settleResult.success).toBe(true);
        if (settleResult.success) {
          expect((settleResult as any).extensions).toBeDefined();
          expect((settleResult as any).extensions["all-hooks"]).toBeDefined();
          expect((settleResult as any).extensions["all-hooks"].receipt).toBeDefined();
          expect((settleResult as any).extensions["all-hooks"].receipt.receipt).toBe("Receipt");
        }
      }
    });
  });
});
