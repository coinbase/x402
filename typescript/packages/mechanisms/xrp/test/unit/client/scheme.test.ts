import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactXrpScheme } from "../../src/exact/client/scheme";
import { toClientXrpSigner } from "../../src/signer";
import { Wallet } from "xrpl";
import { PaymentRequirements } from "@x402/core/types";

describe("ExactXrpScheme Client", () => {
  let scheme: ExactXrpScheme;
  let mockWallet: Wallet;
  let signer: ReturnType<typeof toClientXrpSigner>;

  beforeEach(() => {
    mockWallet = Wallet.generate();
    signer = toClientXrpSigner(mockWallet);
    scheme = new ExactXrpScheme(signer, "wss://testnet.xrpl-labs.com");
  });

  describe("scheme property", () => {
    it("should return exact scheme", () => {
      expect(scheme.scheme).toBe("exact");
    });
  });

  describe("connection management", () => {
    it("should connect to XRPL", async () => {
      await scheme.connect();
      // Connection successful if no error thrown
      expect(true).toBe(true);
    });

    it("should disconnect from XRPL", async () => {
      await scheme.connect();
      await scheme.disconnect();
      // Disconnection successful if no error thrown
      expect(true).toBe(true);
    });

    it("should handle multiple connects gracefully", async () => {
      await scheme.connect();
      await scheme.connect(); // Second connect should be no-op
      expect(true).toBe(true);
    });
  });

  describe("prepare", () => {
    const mockRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "xrp:testnet",
      asset: "XRP",
      amount: "10000",
      payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      maxTimeoutSeconds: 60,
      extra: {
        destinationTag: 12345,
        memo: {
          memoType: "x402_payment",
          memoData: "74657374",
        },
      },
    };

    it("should prepare payment payload with correct structure", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload).toHaveProperty("x402Version", 2);
      expect(payload).toHaveProperty("resource");
      expect(payload).toHaveProperty("accepted");
      expect(payload).toHaveProperty("payload");
    });

    it("should include correct XRP network identifier", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.accepted.network).toBe("xrp:testnet");
      expect(payload.accepted.scheme).toBe("exact");
    });

    it("should include correct payment amount in drops", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.accepted.amount).toBe("10000");
      expect(payload.accepted.asset).toBe("XRP");
    });

    it("should include destination address", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.accepted.payTo).toBe("rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj");
    });

    it("should include destination tag if provided", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.accepted.extra?.destinationTag).toBe(12345);
    });

    it("should include memo if provided", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.accepted.extra?.memo).toEqual({
        memoType: "x402_payment",
        memoData: "74657374",
      });
    });

    it("should generate signed transaction payload", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.payload).toHaveProperty("signedTransaction");
      expect(payload.payload).toHaveProperty("transaction");
      expect(typeof payload.payload.signedTransaction).toBe("string");
    });

    it("should handle X-address conversion", async () => {
      const requirementsWithXAddress: PaymentRequirements = {
        ...mockRequirements,
        payTo: "X7m1kaW4K3RWMnSWEtTH4gyAYYqR9hT8hC", // X-address format
        extra: {
          destinationTag: undefined, // Extracted from X-address
        },
      };

      const payload = await scheme.prepare(requirementsWithXAddress);
      expect(payload.accepted.payTo).toBeDefined();
    });

    it("should set appropriate fees", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.payload.transaction).toHaveProperty("Fee");
      expect(payload.payload.transaction.Fee).toBeDefined();
    });

    it("should set LastLedgerSequence for transaction expiry", async () => {
      const payload = await scheme.prepare(mockRequirements);

      expect(payload.payload.transaction).toHaveProperty("LastLedgerSequence");
    });
  });

  describe("mainnet support", () => {
    it("should handle mainnet network identifier", async () => {
      const mainnetScheme = new ExactXrpScheme(signer, "wss://s1.ripple.com");
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "xrp:mainnet",
        asset: "XRP",
        amount: "1000000", // 1 XRP
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      };

      const payload = await mainnetScheme.prepare(requirements);
      expect(payload.accepted.network).toBe("xrp:mainnet");
    });

    it("should handle devnet network identifier", async () => {
      const devnetScheme = new ExactXrpScheme(signer, "wss://s.devnet.rippletest.net:51233");
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "xrp:devnet",
        asset: "XRP",
        amount: "10000",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      };

      const payload = await devnetScheme.prepare(requirements);
      expect(payload.accepted.network).toBe("xrp:devnet");
    });
  });
});
