import { beforeEach, describe, expect, it } from "vitest";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  HTTPAdapter,
  HTTPResponseInstructions,
  x402HTTPResourceService,
  x402ResourceService,
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
import {
  ExactSvmClient,
  ExactSvmFacilitator,
  ExactSvmService,
  toFacilitatorSvmSigner,
} from "../../src";
import type { ExactSvmPayloadV2 } from "../../src/types";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

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
 * SVM Facilitator Client wrapper
 * Wraps the x402Facilitator for use with x402ResourceService
 */
class SvmFacilitatorClient implements FacilitatorClient {
  readonly scheme = "exact";
  readonly network = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"; // Solana Devnet
  readonly x402Version = 2;

  /**
   * Creates a new SvmFacilitatorClient instance
   *
   * @param facilitator - The x402 facilitator to wrap
   */
  constructor(private readonly facilitator: x402Facilitator) { }

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
    return Promise.resolve({
      kinds: [
        {
          x402Version: this.x402Version,
          scheme: this.scheme,
          network: this.network,
          extra: {
            feePayer: FACILITATOR_ADDRESS,
          },
        },
      ],
      extensions: [],
    });
  }
}

/**
 * Build SVM payment requirements for testing
 *
 * @param payTo - The recipient address
 * @param amount - The payment amount in smallest units
 * @param network - The network identifier (defaults to Solana Devnet)
 * @returns Payment requirements object
 */
function buildSvmPaymentRequirements(
  payTo: string,
  amount: string,
  network: Network = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
): PaymentRequirements {
  return {
    scheme: "exact",
    network,
    asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Devnet USDC
    amount,
    payTo,
    maxTimeoutSeconds: 3600,
    extra: {
      feePayer: FACILITATOR_ADDRESS,
    },
  };
}

describe("SVM Integration Tests", () => {
  describe("x402Client / x402ResourceService / x402Facilitator - SVM Flow", () => {
    let client: x402Client;
    let server: x402ResourceService;
    let clientAddress: string;

    beforeEach(async () => {
      const clientBytes = base58.decode(CLIENT_PRIVATE_KEY);
      const clientSigner = await createKeyPairSignerFromBytes(clientBytes);
      clientAddress = clientSigner.address;

      const svmClient = new ExactSvmClient(clientSigner, {
        rpcUrl: "https://api.devnet.solana.com",
      });
      client = new x402Client().registerScheme(
        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        svmClient,
      );

      const facilitatorBytes = base58.decode(FACILITATOR_PRIVATE_KEY);
      const facilitatorKeypair = await createKeyPairSignerFromBytes(facilitatorBytes);
      const facilitatorSigner = toFacilitatorSvmSigner(facilitatorKeypair);

      const svmFacilitator = new ExactSvmFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().registerScheme(
        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        svmFacilitator,
      );

      const facilitatorClient = new SvmFacilitatorClient(facilitator);
      server = new x402ResourceService(facilitatorClient);
      server.registerScheme("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmService());
      await server.initialize();
    });

    it("server should successfully verify and settle a SVM payment from a client", async () => {
      const accepts = [buildSvmPaymentRequirements(RESOURCE_SERVER_ADDRESS, "1000")];
      const resource = {
        url: "https://company.co",
        description: "Company Co. resource",
        mimeType: "application/json",
      };
      const paymentRequired = server.createPaymentRequiredResponse(accepts, resource);

      const paymentPayload = await client.createPaymentPayload(paymentRequired);

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.x402Version).toBe(2);
      expect(paymentPayload.accepted.scheme).toBe("exact");

      const svmPayload = paymentPayload.payload as ExactSvmPayloadV2;
      expect(svmPayload.transaction).toBeDefined();
      expect(typeof svmPayload.transaction).toBe("string");
      expect(svmPayload.transaction.length).toBeGreaterThan(0);

      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);

      expect(verifyResponse.isValid).toBe(true);
      expect(verifyResponse.payer).toBe(clientAddress);

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      expect(settleResponse.success).toBe(true);
      expect(settleResponse.network).toBe("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
      expect(settleResponse.transaction).toBeDefined();
      expect(settleResponse.payer).toBe(clientAddress);
    });
  });

  describe("x402HTTPClient / x402HTTPResourceService / x402Facilitator - SVM Flow", () => {
    let client: x402HTTPClient;
    let service: x402HTTPResourceService;

    const routes = {
      "/api/protected": {
        scheme: "exact",
        payTo: RESOURCE_SERVER_ADDRESS,
        price: "$0.001",
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as Network,
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
      const facilitatorBytes = base58.decode(FACILITATOR_PRIVATE_KEY);
      const facilitatorKeypair = await createKeyPairSignerFromBytes(facilitatorBytes);
      const facilitatorSigner = toFacilitatorSvmSigner(facilitatorKeypair);

      const svmFacilitator = new ExactSvmFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().registerScheme(
        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        svmFacilitator,
      );

      const facilitatorClient = new SvmFacilitatorClient(facilitator);

      const clientBytes = base58.decode(CLIENT_PRIVATE_KEY);
      const clientSigner = await createKeyPairSignerFromBytes(clientBytes);

      const svmClient = new ExactSvmClient(clientSigner, {
        rpcUrl: "https://api.devnet.solana.com",
      });
      const paymentClient = new x402Client();
      client = new x402HTTPClient(paymentClient).registerScheme(
        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        svmClient,
      ) as x402HTTPClient;

      service = new x402HTTPResourceService(routes, facilitatorClient);
      service.registerScheme("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmService());
      await service.initialize();
    });

    it("middleware should successfully verify and settle a SVM payment from an http client", async () => {
      const context = {
        adapter: mockAdapter,
        path: "/api/protected",
        method: "GET",
      };

      const httpProcessResult = (await service.processHTTPRequest(context))!;
      expect(httpProcessResult.type).toBe("payment-error");

      const initial402Response = (
        httpProcessResult as { type: "payment-error"; response: HTTPResponseInstructions }
      ).response;

      expect(initial402Response).toBeDefined();
      expect(initial402Response.status).toBe(402);
      expect(initial402Response.headers).toBeDefined();
      expect(initial402Response.headers["PAYMENT-REQUIRED"]).toBeDefined();

      const paymentRequired = client.getPaymentRequiredResponse(
        initial402Response.headers,
        initial402Response.body,
      );
      const paymentPayload = await client.createPaymentPayload(paymentRequired);

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.accepted.scheme).toBe("exact");

      const requestHeaders = await client.encodePaymentSignatureHeader(paymentPayload);

      mockAdapter.getHeader = (name: string) => {
        if (name === "PAYMENT-SIGNATURE") {
          return requestHeaders["PAYMENT-SIGNATURE"];
        }
        return undefined;
      };

      const httpProcessResult2 = await service.processHTTPRequest(context);

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
