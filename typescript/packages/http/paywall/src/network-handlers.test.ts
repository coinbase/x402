import { describe, expect, it } from "vitest";
import { evmPaywall } from "./evm";
import { svmPaywall } from "./svm";
import type { PaymentRequired, PaymentRequirements } from "./types";

const evmRequirement: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "100000",
  payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
  maxTimeoutSeconds: 60,
};

const svmRequirement: PaymentRequirements = {
  scheme: "exact",
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "100000",
  payTo: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHEBg4",
  maxTimeoutSeconds: 60,
};

const mockPaymentRequired: PaymentRequired = {
  x402Version: 2,
  resource: {
    url: "https://example.com/api/data",
    description: "Test",
    mimeType: "application/json",
  },
  accepts: [evmRequirement],
};

describe("Network Handlers", () => {
  describe("evmPaywall", () => {
    it("supports CAIP-2 EVM networks", () => {
      expect(evmPaywall.supports({ ...evmRequirement, network: "eip155:8453" })).toBe(true);
      expect(evmPaywall.supports({ ...evmRequirement, network: "eip155:84532" })).toBe(true);
      expect(evmPaywall.supports({ ...evmRequirement, network: "eip155:1" })).toBe(true);
      expect(evmPaywall.supports({ ...evmRequirement, network: "eip155:137" })).toBe(true);
    });

    it("rejects non-EVM networks", () => {
      expect(evmPaywall.supports({ ...evmRequirement, network: "solana:5eykt" })).toBe(false);
      expect(evmPaywall.supports({ ...evmRequirement, network: "base" })).toBe(false);
      expect(evmPaywall.supports({ ...evmRequirement, network: "unknown" })).toBe(false);
    });

    it("generates HTML for EVM networks", () => {
      const html = evmPaywall.generateHtml(evmRequirement, mockPaymentRequired, {
        appName: "Test App",
        testnet: true,
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toMatch(/Test App|EVM Paywall/);
    });
  });

  describe("svmPaywall", () => {
    it("supports CAIP-2 Solana networks", () => {
      expect(
        svmPaywall.supports({
          ...svmRequirement,
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        }),
      ).toBe(true);
      expect(
        svmPaywall.supports({
          ...svmRequirement,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        }),
      ).toBe(true);
    });

    it("rejects non-Solana networks", () => {
      expect(svmPaywall.supports({ ...svmRequirement, network: "eip155:8453" })).toBe(false);
      expect(svmPaywall.supports({ ...svmRequirement, network: "base" })).toBe(false);
      expect(svmPaywall.supports({ ...svmRequirement, network: "unknown" })).toBe(false);
    });

    it("generates HTML for Solana networks", () => {
      const html = svmPaywall.generateHtml(svmRequirement, mockPaymentRequired, {
        appName: "Solana Test",
        testnet: true,
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toMatch(/Solana Test|SVM Paywall/);
    });
  });
});
