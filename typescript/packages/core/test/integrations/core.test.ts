import { beforeEach, describe, expect, it } from "vitest";
import { x402Client, x402HTTPClient } from "../../src/client";
import { x402Facilitator } from "../../src/facilitator";
import {
  HTTPAdapter,
  HTTPResponseInstructions,
  x402HTTPResourceService,
  x402ResourceService,
} from "../../src/server";
import {
  buildCashPaymentRequirements,
  CashFacilitatorClient,
  CashSchemeNetworkClient,
  CashSchemeNetworkFacilitator,
  CashSchemeNetworkService,
} from "./mocks/cash";
import { Network, PaymentPayload, PaymentRequirements } from "../../src/types";

describe("Core Integration Tests", () => {
  describe("x402Client / x402ResourceService / x402Facilitator - Cash Flow", () => {
    let client: x402Client;
    let server: x402ResourceService;

    beforeEach(async () => {
      client = new x402Client().registerScheme("x402:cash", new CashSchemeNetworkClient("John"));

      const facilitator = new x402Facilitator().registerScheme(
        "x402:cash",
        new CashSchemeNetworkFacilitator(),
      );

      const facilitatorClient = new CashFacilitatorClient(facilitator);
      server = new x402ResourceService(facilitatorClient);
      server.registerScheme("x402:cash", new CashSchemeNetworkService());
      await server.initialize(); // Initialize to fetch supported kinds
    });

    it("server should successfully verify and settle a cash payment from a client", async () => {
      // Server - builds PaymentRequired response
      const accepts = [buildCashPaymentRequirements("Company Co.", "USD", "1")];
      const resource = {
        url: "https://company.co",
        description: "Company Co. resource",
        mimeType: "application/json",
      };
      const paymentRequiredResponse = server.createPaymentRequiredResponse(accepts, resource);

      // Client - responds with PaymentPayload response
      const selected = client.selectPaymentRequirements(
        paymentRequiredResponse.x402Version,
        accepts,
      );
      const paymentPayload = await client.createPaymentPayload(
        paymentRequiredResponse.x402Version,
        selected,
      );

      // Server - maps payment payload to payment requirements
      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);
      expect(verifyResponse.isValid).toBe(true);

      // Server does work here

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      expect(settleResponse.success).toBe(true);
    });
  });

  describe("x402HTTPClient / x402HTTPResourceService / x402Facilitator - Cash Flow", () => {
    let client: x402HTTPClient;
    let service: x402HTTPResourceService;

    const routes = {
      "/api/protected": {
        scheme: "cash",
        payTo: "merchant@example.com",
        price: "$0.10",
        network: "x402:cash" as Network,
        description: "Access to protected API",
        mimeType: "application/json",
      },
    };

    const mockAdapter: HTTPAdapter = {
      getHeader: (name: string) => {
        // Return payment header if requested
        if (name === "x-payment") {
          return "base64EncodedPaymentHere";
        }
        return undefined;
      },
      getMethod: () => "GET",
      getPath: () => "/api/protected",
      getUrl: () => "https://example.com/api/protected",
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "TestClient/1.0",
    };

    beforeEach(async () => {
      const facilitator = new x402Facilitator().registerScheme(
        "x402:cash",
        new CashSchemeNetworkFacilitator(),
      );

      const facilitatorClient = new CashFacilitatorClient(facilitator);

      client = new x402HTTPClient().registerScheme(
        "x402:cash",
        new CashSchemeNetworkClient("John"),
      ) as x402HTTPClient;

      service = new x402HTTPResourceService(routes, facilitatorClient);
      service.registerScheme("x402:cash", new CashSchemeNetworkService());
      await service.initialize(); // Initialize to fetch supported kinds
    });

    it("middleware should successfully verify and settle a cash payment from an http client", async () => {
      // Middleware creates a PaymentRequired response
      const context = {
        adapter: mockAdapter,
        path: "/api/protected",
        method: "GET",
      };
      // No payment made, get PaymentRequired response & header
      const httpProcessResult = (await service.processHTTPRequest(context))!;

      expect(httpProcessResult.type).toBe("payment-error");

      const initial402Response = (
        httpProcessResult as { type: "payment-error"; response: HTTPResponseInstructions }
      ).response;

      expect(initial402Response).toBeDefined();
      expect(initial402Response.status).toBe(402);
      expect(initial402Response.headers).toBeDefined();
      expect(initial402Response.headers["PAYMENT-REQUIRED"]).toBeDefined();
      expect(initial402Response.isHtml).toBeFalsy();
      expect(initial402Response.body).toBeUndefined();

      // Client responds to PaymentRequired and submits a request with a PaymentPayload
      const paymentRequired = client.getPaymentRequiredResponse(
        initial402Response.headers,
        initial402Response.body,
      );
      const selected = client.selectPaymentRequirements(
        paymentRequired.x402Version,
        paymentRequired.accepts,
      );
      const paymentPayload = await client.createPaymentPayload(
        paymentRequired.x402Version,
        selected,
      );
      const requestHeaders = await client.encodePaymentSignatureHeader(paymentPayload);

      // Middleware handles PAYMENT-SIGNATURE request
      context.adapter.getHeader = (name: string) => {
        if (name === "PAYMENT-SIGNATURE") {
          return requestHeaders["PAYMENT-SIGNATURE"];
        }
        return undefined;
      };
      const httpProcessResult2 = await service.processHTTPRequest(context);

      // No need to reason respond, can continue with request
      expect(httpProcessResult2.type).toBe("payment-verified");
      const {
        paymentPayload: verifiedPaymentPayload,
        paymentRequirements: verifiedPaymentRequirements,
      } = httpProcessResult2 as {
        type: "payment-verified";
        paymentPayload: PaymentPayload;
        paymentRequirements: PaymentRequirements;
      };

      const settlementHeaders = await service.processSettlement(
        verifiedPaymentPayload,
        verifiedPaymentRequirements,
        200,
      );
      expect(settlementHeaders).toBeDefined();
      expect(settlementHeaders?.["PAYMENT-RESPONSE"]).toBeDefined();
    });
  });
});
