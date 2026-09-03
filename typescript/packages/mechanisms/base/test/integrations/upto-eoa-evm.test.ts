import { beforeEach, describe, expect, it } from "vitest";
import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer, FacilitatorClient } from "@x402/core/server";
import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import type { UptoPermit2Payload } from "@x402/evm";
import { BaseScheme as BaseUptoClient } from "../../src/upto/client/scheme";
import { BaseScheme as BaseUptoServer } from "../../src/upto/server/scheme";
import { BaseScheme as BaseUptoFacilitator } from "../../src/upto/facilitator/scheme";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY as `0x${string}` | undefined;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}` | undefined;

const HAS_KEYS = Boolean(CLIENT_PRIVATE_KEY && FACILITATOR_PRIVATE_KEY);
const describeOnChain = HAS_KEYS ? describe : describe.skip;

if (!HAS_KEYS) {
  console.warn(
    "[upto-eoa-evm.test.ts] Skipping on-chain tests: CLIENT_PRIVATE_KEY and FACILITATOR_PRIVATE_KEY env vars are required.",
  );
}

/**
 * Base Upto Facilitator Client wrapper
 * Wraps the x402Facilitator for use with x402ResourceServer
 */
class BaseUptoFacilitatorClient implements FacilitatorClient {
  readonly scheme = "upto";
  readonly network = "eip155:84532"; // Base Sepolia
  readonly x402Version = 2;

  /**
   * Creates a new BaseUptoFacilitatorClient instance
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
    return Promise.resolve(this.facilitator.getSupported() as unknown as SupportedResponse);
  }
}

describeOnChain("Base Upto Integration Tests", () => {
  describe("x402Client / x402ResourceServer / x402Facilitator - Upto Flow", () => {
    let client: x402Client;
    let server: x402ResourceServer;
    let clientAddress: `0x${string}`;

    beforeEach(async () => {
      const clientAccount = privateKeyToAccount(CLIENT_PRIVATE_KEY!);
      clientAddress = clientAccount.address;

      const uptoClient = new BaseUptoClient(clientAccount);
      client = new x402Client().register("eip155:84532", uptoClient);

      const facilitatorAccount = privateKeyToAccount(FACILITATOR_PRIVATE_KEY!);

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
        address: facilitatorAccount.address,
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
        sendTransaction: args => walletClient.sendTransaction(args),
        waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
        getCode: args => publicClient.getCode(args),
      });

      const uptoFacilitator = new BaseUptoFacilitator(facilitatorSigner);
      const facilitator = new x402Facilitator().register("eip155:84532", uptoFacilitator);

      const facilitatorClient = new BaseUptoFacilitatorClient(facilitator);
      server = new x402ResourceServer(facilitatorClient);
      server.register("eip155:84532", new BaseUptoServer());
      await server.initialize();
    });

    it(
      "server should successfully verify and settle a Base upto payment from a client",
      { timeout: 30000 },
      async () => {
        const accepts: PaymentRequirements[] = [
          {
            scheme: "upto",
            network: "eip155:84532",
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
            amount: "10000", // max 0.01 USDC authorized
            payTo: "0x9876543210987654321098765432109876543210",
            maxTimeoutSeconds: 3600,
            extra: {
              name: "USDC",
              version: "2",
            },
          },
        ];
        const resource = {
          url: "https://company.co",
          description: "Company Co. usage-based resource",
          mimeType: "application/json",
        };
        const paymentRequired = await server.createPaymentRequiredResponse(accepts, resource);

        // Facilitator's supported kind enriches extra with facilitatorAddress
        expect(paymentRequired.accepts[0].extra?.facilitatorAddress).toBeDefined();

        const paymentPayload = await client.createPaymentPayload(paymentRequired);

        expect(paymentPayload).toBeDefined();
        expect(paymentPayload.x402Version).toBe(2);
        expect(paymentPayload.accepted.scheme).toBe("upto");

        const uptoPayload = paymentPayload.payload as UptoPermit2Payload;
        expect(uptoPayload.permit2Authorization).toBeDefined();
        expect(uptoPayload.permit2Authorization.permitted.token).toBeDefined();
        expect(uptoPayload.permit2Authorization.from).toBe(clientAddress);
        expect(uptoPayload.signature).toBeDefined();

        const accepted = server.findMatchingRequirements(accepts, paymentPayload);
        expect(accepted).toBeDefined();

        const verifyResponse = await server.verifyPayment(paymentPayload, accepted!);

        if (!verifyResponse.isValid) {
          console.log("❌ Verification failed!");
          console.log("Invalid reason:", verifyResponse.invalidReason);
          console.log("Payer:", verifyResponse.payer);
          console.log("Client address:", clientAddress);
        }

        expect(verifyResponse.isValid).toBe(true);
        expect(verifyResponse.payer).toBe(clientAddress);

        // Server settles for less than the authorized max (usage-based billing)
        const settleResponse = await server.settlePayment(
          paymentPayload,
          accepted!,
          undefined,
          undefined,
          { amount: "5000" }, // settle 0.005 USDC of the 0.01 USDC authorized
        );
        expect(settleResponse.success).toBe(true);
        expect(settleResponse.network).toBe("eip155:84532");
        expect(settleResponse.transaction).toBeDefined();
        expect(settleResponse.payer).toBe(clientAddress);
      },
    );
  });

  describe("Price Parsing Integration", () => {
    let server: x402ResourceServer;
    let uptoServer: BaseUptoServer;

    beforeEach(async () => {
      const facilitatorAccount = privateKeyToAccount(FACILITATOR_PRIVATE_KEY!);
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
        address: facilitatorAccount.address,
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
        sendTransaction: args => walletClient.sendTransaction(args),
        waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
        getCode: args => publicClient.getCode(args),
      });
      const facilitator = new x402Facilitator().register(
        "eip155:84532",
        new BaseUptoFacilitator(facilitatorSigner),
      );

      const facilitatorClient = new BaseUptoFacilitatorClient(facilitator);
      server = new x402ResourceServer(facilitatorClient);

      uptoServer = new BaseUptoServer();
      server.register("eip155:84532", uptoServer);
      await server.initialize();
    });

    it("should parse Money formats and build payment requirements with the max authorized amount", async () => {
      const testCases = [
        { input: "$0.10", expectedAmount: "100000" },
        { input: "1.50", expectedAmount: "1500000" },
        { input: 2.5, expectedAmount: "2500000" },
      ];

      for (const testCase of testCases) {
        const requirements = await server.buildPaymentRequirements({
          scheme: "upto",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          price: testCase.input,
          network: "eip155:84532" as Network,
        });

        expect(requirements).toHaveLength(1);
        expect(requirements[0].amount).toBe(testCase.expectedAmount);
        expect(requirements[0].asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e"); // Base Sepolia USDC
        expect(requirements[0].extra?.assetTransferMethod).toBe("permit2");
      }
    });

    it("should use registerMoneyParser for custom conversion", async () => {
      uptoServer.registerMoneyParser(async (amount, _network) => {
        if (Number(amount) > 100) {
          return {
            amount: (Number(amount) * 1e18).toString(),
            asset: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI on mainnet (test value)
            extra: { token: "DAI", tier: "large" },
          };
        }
        return null; // Use default for small amounts
      });

      const largeRequirements = await server.buildPaymentRequirements({
        scheme: "upto",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        price: 150,
        network: "eip155:84532" as Network,
      });

      expect(largeRequirements[0].asset).toBe("0x6B175474E89094C44Da98b954EedeAC495271d0F");
      expect(largeRequirements[0].extra?.tier).toBe("large");

      const smallRequirements = await server.buildPaymentRequirements({
        scheme: "upto",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        price: 50,
        network: "eip155:84532" as Network,
      });

      expect(smallRequirements[0].amount).toBe("50000000"); // 50 * 1e6 (USDC)
      expect(smallRequirements[0].asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e"); // Base Sepolia USDC
    });
  });
});
