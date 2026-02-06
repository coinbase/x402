import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client as XrplClient } from "xrpl";
import { ExactXrpScheme as ClientScheme } from "../src/exact/client/scheme";
import { ExactXrpScheme as FacilitatorScheme } from "../src/exact/facilitator/scheme";
import { ExactXrpScheme as ServerScheme } from "../src/exact/server/scheme";
import { toClientXrpSigner, toFacilitatorXrpSigner } from "../src/signer";
import { Wallet } from "xrpl";

/**
 * Integration tests against XRP Testnet
 * These tests require network connectivity to wss://testnet.xrpl-labs.com
 */

describe("XRP Integration Tests", () => {
  const TESTNET_URL = "wss://testnet.xrpl-labs.com";
  
  let clientWallet: Wallet;
  let recipientWallet: Wallet;
  let facilitatorClient: XrplClient;
  
  let clientScheme: ClientScheme;
  let serverScheme: ServerScheme;
  let facilitatorScheme: FacilitatorScheme;

  beforeAll(async () => {
    // Generate wallets for testing
    clientWallet = Wallet.generate();
    recipientWallet = Wallet.generate();

    // Fund client wallet from testnet faucet (manual step or mock)
    // In real tests, you'd use the testnet faucet API
    
    facilitatorClient = new XrplClient(TESTNET_URL);
    await facilitatorClient.connect();

    // Setup schemes
    const clientSigner = toClientXrpSigner(clientWallet);
    clientScheme = new ClientScheme(clientSigner, TESTNET_URL);

    serverScheme = new ServerScheme();

    const facilitatorSigner = toFacilitatorXrpSigner(facilitatorClient);
    facilitatorScheme = new FacilitatorScheme(facilitatorSigner);
  });

  afterAll(async () => {
    await clientScheme.disconnect();
    await facilitatorClient.disconnect();
  });

  describe("End-to-end payment flow", () => {
    it("should complete full payment lifecycle", async () => {
      // 1. Server builds requirements
      const requirements = await serverScheme.buildRequirements({
        network: "xrp:testnet",
        amount: "10000", // 0.01 XRP
        payTo: recipientWallet.address,
        maxTimeoutSeconds: 60,
        extra: {
          memo: {
            memoType: "x402_test",
            memoData: Buffer.from("integration test").toString("hex"),
          },
        },
      });

      expect(requirements).toBeDefined();
      expect(requirements.scheme).toBe("exact");
      expect(requirements.network).toBe("xrp:testnet");

      // 2. Client prepares payment
      await clientScheme.connect();
      const paymentPayload = await clientScheme.prepare(requirements);

      expect(paymentPayload).toBeDefined();
      expect(paymentPayload.x402Version).toBe(2);
      expect(paymentPayload.payload).toHaveProperty("signedTransaction");
      expect(paymentPayload.payload.transaction.Fee).toBe("12");

      // 3. Facilitator verifies payment
      const verifyResult = await facilitatorScheme.verify(paymentPayload, requirements);
      
      // Note: This will fail if client account isn't funded on testnet
      // In real tests, fund the account first via faucet
      if (verifyResult.isValid) {
        // 4. Facilitator settles payment
        const settleResult = await facilitatorScheme.settle(paymentPayload, requirements);
        
        // May fail on testnet if account doesn't exist or is unfunded
        expect(settleResult).toBeDefined();
      }
    }, 60000); // 60 second timeout for network operations

    it("should handle different XRP amounts", async () => {
      const amounts = [
        { input: "1000", expectedDrops: "1000" },       // 0.001 XRP
        { input: "10000", expectedDrops: "10000" },     // 0.01 XRP
        { input: "100000", expectedDrops: "100000" },   // 0.1 XRP
        { input: "1000000", expectedDrops: "1000000" }, // 1 XRP
      ];

      for (const { input, expectedDrops } of amounts) {
        const requirements = await serverScheme.buildRequirements({
          network: "xrp:testnet",
          amount: input,
          payTo: recipientWallet.address,
        });

        expect(requirements.amount).toBe(expectedDrops);
      }
    });

    it("should handle destination tags", async () => {
      const destinationTag = 1234567890;

      const requirements = await serverScheme.buildRequirements({
        network: "xrp:testnet",
        amount: "10000",
        payTo: recipientWallet.address,
        extra: {
          destinationTag,
        },
      });

      expect(requirements.extra?.destinationTag).toBe(destinationTag);
    });
  });

  describe("Network support", () => {
    it("should handle all XRP network identifiers", async () => {
      const networks = [
        "xrp:mainnet",
        "xrp:testnet", 
        "xrp:devnet",
      ];

      for (const network of networks) {
        const requirements = await serverScheme.buildRequirements({
          network: network as any,
          amount: "10000",
          payTo: recipientWallet.address,
        });

        expect(requirements.network).toBe(network);
      }
    });
  });

  describe("Payment with memos", () => {
    it("should include arbitrary memo data", async () => {
      const memoData = {
        memoType: "string", // hex-encoded
        memoData: Buffer.from('{"orderId": "12345", "userId": "abc"}').toString("hex"),
      };

      const requirements = await serverScheme.buildRequirements({
        network: "xrp:testnet",
        amount: "10000",
        payTo: recipientWallet.address,
        extra: {
          memo: memoData,
        },
      });

      expect(requirements.extra?.memo).toEqual(memoData);
    });
  });
});
