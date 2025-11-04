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
  ExactEvmClient,
  ExactEvmFacilitator,
  ExactEvmService,
  toClientEvmSigner,
  toFacilitatorEvmSigner,
} from "../../src";
import type { ExactEvmPayloadV2 } from "../../src/types";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

// Load private keys from environment
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;

if (!CLIENT_PRIVATE_KEY || !FACILITATOR_PRIVATE_KEY) {
  throw new Error(
    "CLIENT_PRIVATE_KEY and FACILITATOR_PRIVATE_KEY environment variables must be set for integration tests",
  );
}

/**
 * EVM Facilitator Client wrapper
 * Wraps the x402Facilitator for use with x402ResourceService
 */
class EvmFacilitatorClient implements FacilitatorClient {
  readonly scheme = "exact";
  readonly network = "eip155:84532"; // Base Sepolia
  readonly x402Version = 2;

  /**
   * Creates a new EvmFacilitatorClient instance
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
            name: "USDC",
            version: "2",
          },
        },
      ],
      extensions: [],
    });
  }
}

/**
 * Build EVM payment requirements for testing
 *
 * @param payTo - The recipient address
 * @param amount - The payment amount in smallest units
 * @param network - The network identifier (defaults to Base Sepolia)
 * @returns Payment requirements object
 */
function buildEvmPaymentRequirements(
  payTo: string,
  amount: string,
  network: Network = "eip155:84532",
): PaymentRequirements {
  return {
    scheme: "exact",
    network,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    amount,
    payTo,
    maxTimeoutSeconds: 3600,
    extra: {
      name: "USDC",
      version: "2",
    },
  };
}

describe("EVM Integration Tests", () => {
  describe("x402Client / x402ResourceService / x402Facilitator - EVM Flow", () => {
    let client: x402Client;
    let server: x402ResourceService;
    let clientAddress: `0x${string}`;

    beforeEach(async () => {
      // Create client account and signer from environment variable
      const clientAccount = privateKeyToAccount(CLIENT_PRIVATE_KEY);
      clientAddress = clientAccount.address;

      const evmClient = new ExactEvmClient(clientAccount);
      client = new x402Client().registerScheme("eip155:84532", evmClient);

      // Create facilitator account and signer from environment variable
      const facilitatorAccount = privateKeyToAccount(FACILITATOR_PRIVATE_KEY);

      // Create separate public and wallet clients for the facilitator
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain: baseSepolia,
        transport: http(),
      });

      const facilitatorSigner = toFacilitatorEvmSigner({
        readContract: args =>
          publicClient.readContract({
            ...args,
            args: args.args || [],
          } as never),
        verifyTypedData: args => publicClient.verifyTypedData(args as never),
        writeContract: args =>
          walletClient.writeContract({
            ...args,
            args: args.args || [],
          } as never),
        waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
      });

      const evmFacilitator = new ExactEvmFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().registerScheme("eip155:84532", evmFacilitator);

      const facilitatorClient = new EvmFacilitatorClient(facilitator);
      server = new x402ResourceService(facilitatorClient);
      server.registerScheme("eip155:84532", new ExactEvmService());
      await server.initialize(); // Initialize to fetch supported kinds
    });

    it("server should successfully verify and settle an EVM payment from a client", async () => {
      // Server - builds PaymentRequired response
      const accepts = [
        buildEvmPaymentRequirements(
          "0x9876543210987654321098765432109876543210",
          "1000", // 0.001 USDC
        ),
      ];
      const resource = {
        url: "https://company.co",
        description: "Company Co. resource",
        mimeType: "application/json",
      };
      const paymentRequired = server.createPaymentRequiredResponse(accepts, resource);

      // Client - responds with PaymentPayload response
      const paymentPayload = await client.createPaymentPayload(paymentRequired);

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.x402Version).toBe(2);
      expect(paymentPayload.accepted.scheme).toBe("exact");

      // Verify the payload structure
      const evmPayload = paymentPayload.payload as ExactEvmPayloadV2;
      expect(evmPayload.authorization).toBeDefined();
      expect(evmPayload.authorization.from).toBe(clientAddress);
      expect(evmPayload.authorization.to).toBe("0x9876543210987654321098765432109876543210");
      expect(evmPayload.signature).toBeDefined();

      // Server - maps payment payload to payment requirements
      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);

      if (!verifyResponse.isValid) {
        console.log("❌ Verification failed!");
        console.log("Invalid reason:", verifyResponse.invalidReason);
        console.log("Payer:", verifyResponse.payer);
        console.log("Client address:", clientAddress);
        console.log("Payload:", JSON.stringify(paymentPayload, null, 2));
      }

      expect(verifyResponse.isValid).toBe(true);
      expect(verifyResponse.payer).toBe(clientAddress);

      // Server does work here

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      expect(settleResponse.success).toBe(true);
      expect(settleResponse.network).toBe("eip155:84532");
      expect(settleResponse.transaction).toBeDefined();
      expect(settleResponse.payer).toBe(clientAddress);
    });
  });

  describe("x402HTTPClient / x402HTTPResourceService / x402Facilitator - EVM Flow", () => {
    let client: x402HTTPClient;
    let service: x402HTTPResourceService;

    const routes = {
      "/api/protected": {
        scheme: "exact",
        payTo: "0x9876543210987654321098765432109876543210",
        price: "$0.001",
        network: "eip155:84532" as Network,
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
      // Create facilitator account and signer from environment variable
      const facilitatorAccount = privateKeyToAccount(FACILITATOR_PRIVATE_KEY);

      // Create separate public and wallet clients for the facilitator
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain: baseSepolia,
        transport: http(),
      });

      const facilitatorSigner = toFacilitatorEvmSigner({
        readContract: args =>
          publicClient.readContract({
            ...args,
            args: args.args || [],
          }),
        verifyTypedData: args => publicClient.verifyTypedData(args as never),
        writeContract: args =>
          walletClient.writeContract({
            ...args,
            args: args.args || [],
          }),
        waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
      });

      const evmFacilitator = new ExactEvmFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().registerScheme("eip155:84532", evmFacilitator);

      const facilitatorClient = new EvmFacilitatorClient(facilitator);

      // Create client account and signer from environment variable
      const clientAccount = privateKeyToAccount(CLIENT_PRIVATE_KEY);

      const evmClient = new ExactEvmClient(clientAccount);
      client = new x402HTTPClient().registerScheme("eip155:84532", evmClient) as x402HTTPClient;

      service = new x402HTTPResourceService(routes, facilitatorClient);
      service.registerScheme("eip155:84532", new ExactEvmService());
      await service.initialize(); // Initialize to fetch supported kinds
    });

    it("middleware should successfully verify and settle an EVM payment from an http client", async () => {
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

      // Client responds to PaymentRequired and submits a request with a PaymentPayload
      const paymentRequired = client.getPaymentRequiredResponse(
        initial402Response.headers,
        initial402Response.body,
      );
      const paymentPayload = await client.createPaymentPayload(paymentRequired);

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.accepted.scheme).toBe("exact");

      const requestHeaders = await client.encodePaymentSignatureHeader(paymentPayload);

      // Middleware handles PAYMENT-SIGNATURE request
      mockAdapter.getHeader = (name: string) => {
        if (name === "PAYMENT-SIGNATURE") {
          return requestHeaders["PAYMENT-SIGNATURE"];
        }
        return undefined;
      };

      const httpProcessResult2 = await service.processHTTPRequest(context);

      // No need to respond, can continue with request
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
