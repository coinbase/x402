import { beforeEach, describe, expect, it } from "vitest";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  HTTPAdapter,
  HTTPResponseInstructions,
  x402HTTPResourceServer,
  x402ResourceServer,
  FacilitatorClient,
} from "@x402/core/server";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { AccountId, Client, PrivateKey, Transaction, TransferTransaction } from "@hashgraph/sdk";
import { createClientHederaSigner, toFacilitatorHederaSigner } from "../../src/signer";
import { ExactHederaScheme as ExactHederaClient } from "../../src/exact/client/scheme";
import { ExactHederaScheme as ExactHederaServer } from "../../src/exact/server/scheme";
import { ExactHederaScheme as ExactHederaFacilitator } from "../../src/exact/facilitator/scheme";

class HederaFacilitatorClient implements FacilitatorClient {
  readonly scheme = "exact";
  readonly network = "hedera:testnet";
  readonly x402Version = 2;

  constructor(private readonly facilitator: x402Facilitator) { }

  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve(this.facilitator.getSupported());
  }
}

describe("Hedera integration", () => {
  const deterministicClientAccount = "0.0.9001";
  const deterministicFeePayer = "0.0.5001";
  const deterministicResourceServerAccount = "0.0.7001";

  const liveClientAccount = process.env.HEDERA_CLIENT_ACCOUNT_ID;
  const liveClientPrivateKey = process.env.HEDERA_CLIENT_PRIVATE_KEY;
  const liveFeePayerAccount = process.env.HEDERA_FACILITATOR_ACCOUNT_ID;
  const liveFeePayerPrivateKey = process.env.HEDERA_FACILITATOR_PRIVATE_KEY;
  const liveResourceServerAccount = process.env.HEDERA_RESOURCE_SERVER_ACCOUNT_ID;
  const hasLiveEnv = Boolean(
    liveClientAccount &&
    liveClientPrivateKey &&
    liveFeePayerAccount &&
    liveFeePayerPrivateKey &&
    liveResourceServerAccount,
  );

  function createLocalFinalizerSigner(
    feePayerAccountId: string,
    feePayerPrivateKey: string,
  ): ReturnType<typeof toFacilitatorHederaSigner> {
    const parsedFeePayerKey = PrivateKey.fromString(feePayerPrivateKey);
    return toFacilitatorHederaSigner({
      getAddresses: () => [feePayerAccountId],
      signAndSubmitTransaction: async (transactionBase64: string) => {
        const tx = Transaction.fromBytes(Buffer.from(transactionBase64, "base64"));
        if (!(tx instanceof TransferTransaction)) {
          throw new Error("expected TransferTransaction");
        }
        const signed = await tx.sign(parsedFeePayerKey);
        return { transactionId: signed.transactionId?.toString() ?? "" };
      },
      resolveAccount: async () => ({ exists: true, isAlias: false }),
    });
  }

  function createLiveNetworkSigner(
    feePayerAccountId: string,
    feePayerPrivateKey: string,
  ): ReturnType<typeof toFacilitatorHederaSigner> {
    const parsedFeePayerKey = PrivateKey.fromString(feePayerPrivateKey);
    return toFacilitatorHederaSigner({
      getAddresses: () => [feePayerAccountId],
      signAndSubmitTransaction: async (transactionBase64: string, _, network: string) => {
        const tx = Transaction.fromBytes(Buffer.from(transactionBase64, "base64"));
        if (!(tx instanceof TransferTransaction)) {
          throw new Error("expected TransferTransaction");
        }
        const signed = await tx.sign(parsedFeePayerKey);
        const client = network === "hedera:mainnet" ? Client.forMainnet() : Client.forTestnet();
        client.setOperator(AccountId.fromString(feePayerAccountId), parsedFeePayerKey);
        const response = await signed.execute(client);
        return { transactionId: response.transactionId.toString() };
      },
      resolveAccount: async () => ({ exists: true, isAlias: false }),
    });
  }

  describe("x402Client / x402ResourceServer / x402Facilitator flow", () => {
    let client: x402Client;
    let server: x402ResourceServer;
    let paymentRequirements: PaymentRequirements;
    let resource: { url: string; description: string; mimeType: string };

    beforeEach(async () => {
      const clientPrivateKey = PrivateKey.generateED25519().toString();
      const feePayerPrivateKey = PrivateKey.generateED25519().toString();
      const clientSigner = createClientHederaSigner(deterministicClientAccount, clientPrivateKey, {
        network: "hedera:testnet",
      });
      client = new x402Client().register("hedera:testnet", new ExactHederaClient(clientSigner));
      const hederaFacilitator = new ExactHederaFacilitator(
        createLocalFinalizerSigner(deterministicFeePayer, feePayerPrivateKey),
      );

      const facilitator = new x402Facilitator().register("hedera:testnet", hederaFacilitator);
      const facilitatorClient = new HederaFacilitatorClient(facilitator);
      server = new x402ResourceServer(facilitatorClient);
      server.register("hedera:testnet", new ExactHederaServer());
      await server.initialize();

      paymentRequirements = {
        scheme: "exact",
        network: "hedera:testnet" as Network,
        asset: "0.0.0",
        amount: "1",
        payTo: deterministicResourceServerAccount,
        maxTimeoutSeconds: 180,
        extra: { feePayer: deterministicFeePayer },
      };
      resource = {
        url: "https://example.com/paid",
        description: "Protected endpoint",
        mimeType: "application/json",
      };
    });

    it("verifies and settles a client payment end-to-end", async () => {
      const accepts = [paymentRequirements];

      const paymentRequired = await server.createPaymentRequiredResponse(accepts, resource);
      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);
      expect(verifyResponse.isValid).toBe(true);
      expect(verifyResponse.payer).toBe(deterministicClientAccount);

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      expect(settleResponse.success).toBe(true);
      expect(settleResponse.network).toBe("hedera:testnet");
      expect(settleResponse.payer).toBe(deterministicClientAccount);
      expect(settleResponse.transaction).toContain("0.0.5001@");
    });

    it("rejects replayed payment payloads end-to-end", async () => {
      const accepts = [paymentRequirements];
      const paymentRequired = await server.createPaymentRequiredResponse(accepts, resource);
      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const firstVerify = await server.verifyPayment(paymentPayload, accepted!);
      expect(firstVerify.isValid).toBe(true);
      const firstSettle = await server.settlePayment(paymentPayload, accepted!);
      expect(firstSettle.success).toBe(true);

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);
      expect(verifyResponse.isValid).toBe(false);
      expect(verifyResponse.invalidReason).toBe("invalid_transaction_state");

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      expect(settleResponse.success).toBe(false);
      expect(settleResponse.errorReason).toBe("invalid_transaction_state");
    });
  });

  describe("x402HTTPClient / x402HTTPResourceServer flow", () => {
    let client: x402HTTPClient;
    let httpServer: x402HTTPResourceServer;

    const routes = {
      "/api/protected": {
        accepts: {
          scheme: "exact",
          payTo: deterministicResourceServerAccount,
          price: {
            amount: "1",
            asset: "0.0.0",
          },
          network: "hedera:testnet" as Network,
        },
        description: "Protected API",
        mimeType: "application/json",
      },
    };

    const mockAdapter: HTTPAdapter = {
      getHeader: () => undefined,
      getMethod: () => "GET",
      getPath: () => "/api/protected",
      getUrl: () => "https://example.com/api/protected",
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "IntegrationTest/1.0",
    };

    beforeEach(async () => {
      const clientPrivateKey = PrivateKey.generateED25519().toString();
      const feePayerPrivateKey = PrivateKey.generateED25519().toString();
      const clientSigner = createClientHederaSigner(deterministicClientAccount, clientPrivateKey, {
        network: "hedera:testnet",
      });
      const paymentClient = new x402Client().register(
        "hedera:testnet",
        new ExactHederaClient(clientSigner),
      );
      client = new x402HTTPClient(paymentClient) as x402HTTPClient;

      const hederaFacilitator = new ExactHederaFacilitator(
        createLocalFinalizerSigner(deterministicFeePayer, feePayerPrivateKey),
      );
      const facilitator = new x402Facilitator().register("hedera:testnet", hederaFacilitator);
      const resourceServer = new x402ResourceServer(new HederaFacilitatorClient(facilitator));
      resourceServer.register("hedera:testnet", new ExactHederaServer());
      await resourceServer.initialize();

      httpServer = new x402HTTPResourceServer(resourceServer, routes);
    });

    it("returns 402 then verifies payment via PAYMENT-SIGNATURE", async () => {
      const context = {
        adapter: mockAdapter,
        path: "/api/protected",
        method: "GET",
      };
      const firstResult = await httpServer.processHTTPRequest(context);
      expect(firstResult.type).toBe("payment-error");

      const firstResponse = (
        firstResult as { type: "payment-error"; response: HTTPResponseInstructions }
      ).response;
      expect(firstResponse.status).toBe(402);

      const paymentRequired = client.getPaymentRequiredResponse(
        headerName => firstResponse.headers[headerName],
        firstResponse.body,
      );
      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      const encoded = await client.encodePaymentSignatureHeader(paymentPayload);

      mockAdapter.getHeader = (name: string) => {
        if (name === "PAYMENT-SIGNATURE") {
          return encoded["PAYMENT-SIGNATURE"];
        }
        return undefined;
      };

      const secondResult = await httpServer.processHTTPRequest(context);
      expect(secondResult.type).toBe("payment-verified");

      const {
        paymentPayload: verifiedPaymentPayload,
        paymentRequirements: verifiedPaymentRequirements,
      } = secondResult as {
        type: "payment-verified";
        paymentPayload: PaymentPayload;
        paymentRequirements: PaymentRequirements;
      };
      const settlementResult = await httpServer.processSettlement(
        verifiedPaymentPayload,
        verifiedPaymentRequirements,
        200,
      );
      expect(settlementResult.success).toBe(true);
      if (settlementResult.success) {
        expect(settlementResult.headers["PAYMENT-RESPONSE"]).toBeDefined();
      }
    });
  });

  describe.skipIf(!hasLiveEnv)("Live Hedera network integration (env-gated)", () => {
    it("verifies and settles using real Hedera submission", async () => {
      const network = "hedera:testnet" as Network;
      const clientSigner = createClientHederaSigner(liveClientAccount!, liveClientPrivateKey!, {
        network,
      });
      const hederaFacilitator = new ExactHederaFacilitator(
        createLiveNetworkSigner(liveFeePayerAccount!, liveFeePayerPrivateKey!),
      );
      const facilitator = new x402Facilitator().register(network, hederaFacilitator);
      const server = new x402ResourceServer(new HederaFacilitatorClient(facilitator));
      server.register(network, new ExactHederaServer());
      await server.initialize();
      const client = new x402Client().register(network, new ExactHederaClient(clientSigner));

      const accepts = [
        {
          scheme: "exact",
          network,
          asset: "0.0.0",
          amount: "1",
          payTo: liveResourceServerAccount!,
          maxTimeoutSeconds: 180,
          extra: { feePayer: liveFeePayerAccount! },
        },
      ];
      const resource = {
        url: "https://example.com/paid",
        description: "Live Hedera check",
        mimeType: "application/json",
      };

      const paymentRequired = await server.createPaymentRequiredResponse(accepts, resource);
      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      const accepted = server.findMatchingRequirements(accepts, paymentPayload);
      expect(accepted).toBeDefined();

      const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);
      expect(verifyResponse.isValid).toBe(true);

      const settleResponse = await server.settlePayment(paymentPayload, accepted!);
      console.log("settleResponse", JSON.stringify(settleResponse, null, 2));
      expect(settleResponse.success).toBe(true);
      expect(settleResponse.transaction.length).toBeGreaterThan(0);
    });
  });
});
