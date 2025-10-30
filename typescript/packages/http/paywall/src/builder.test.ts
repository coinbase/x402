import { describe, expect, it } from "vitest";
import { createPaywall, PaywallBuilder } from "./builder";
import type { PaymentRequired } from "./types";

const mockPaymentRequired: PaymentRequired = {
  x402Version: 2,
  error: "Payment required",
  resource: {
    url: "https://example.com/api/data",
    description: "Test Resource",
    mimeType: "application/json",
  },
  accepts: [
    {
      scheme: "exact",
      network: "base-sepolia",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount: "100000",
      payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
      maxTimeoutSeconds: 60,
    },
  ],
};

describe("PaywallBuilder", () => {
  describe("createPaywall", () => {
    it("creates a new PaywallBuilder instance", () => {
      const builder = createPaywall();
      expect(builder).toBeInstanceOf(PaywallBuilder);
    });
  });

  describe("withConfig", () => {
    it("sets configuration and returns builder for chaining", () => {
      const builder = createPaywall();
      const result = builder.withConfig({
        appName: "Test App",
        cdpClientKey: "test-key",
      });
      expect(result).toBe(builder); // Same instance (chainable)
    });

    it("merges multiple config calls", () => {
      const paywall = createPaywall()
        .withConfig({ appName: "App 1" })
        .withConfig({ cdpClientKey: "key-1" })
        .build();

      const html = paywall.generateHtml(mockPaymentRequired);
      expect(html).toContain("App 1");
      expect(html).toContain("key-1");
    });

    it("later configs override earlier ones", () => {
      const paywall = createPaywall()
        .withConfig({ appName: "First App" })
        .withConfig({ appName: "Second App" })
        .build();

      const html = paywall.generateHtml(mockPaymentRequired);
      expect(html).toContain("Second App");
      expect(html).not.toContain("First App");
    });
  });

  describe("build", () => {
    it("returns a PaywallProvider", () => {
      const provider = createPaywall().build();
      expect(provider).toHaveProperty("generateHtml");
      expect(typeof provider.generateHtml).toBe("function");
    });

    it("generates HTML with builder config", () => {
      const paywall = createPaywall()
        .withConfig({
          appName: "Builder Test",
          testnet: true,
        })
        .build();

      const html = paywall.generateHtml(mockPaymentRequired);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Builder Test");
    });

    it("runtime config overrides builder config", () => {
      const paywall = createPaywall()
        .withConfig({
          appName: "Builder Config",
        })
        .build();

      const html = paywall.generateHtml(mockPaymentRequired, {
        appName: "Runtime Config",
      });

      expect(html).toContain("Runtime Config");
      expect(html).not.toContain("Builder Config");
    });

    it("merges builder config with runtime config", () => {
      const paywall = createPaywall()
        .withConfig({
          appName: "Test App",
          testnet: true,
        })
        .build();

      const html = paywall.generateHtml(mockPaymentRequired, {
        cdpClientKey: "runtime-key",
      });

      // Both builder and runtime configs should be present
      expect(html).toContain("Test App"); // from builder
      expect(html).toContain("runtime-key"); // from runtime
    });
  });

  describe("generateHtml", () => {
    it("extracts amount from v2 payment requirements", () => {
      const paywall = createPaywall().build();
      const html = paywall.generateHtml(mockPaymentRequired);
      
      // Amount should be parsed correctly (100000 / 1000000 = 0.1)
      expect(html).toContain("window.x402");
      expect(html).toContain("0.1");
    });

    it("extracts amount from v1 payment requirements", () => {
      const v1PaymentRequired: PaymentRequired = {
        ...mockPaymentRequired,
        x402Version: 1,
        accepts: [
          {
            ...mockPaymentRequired.accepts[0],
            maxAmountRequired: "50000",
          },
        ],
      };

      const paywall = createPaywall().build();
      const html = paywall.generateHtml(v1PaymentRequired);

      // Amount should be 0.05 (50000 / 1000000)
      expect(html).toContain("0.05");
    });

    it("uses resource URL as currentUrl when not provided", () => {
      const paywall = createPaywall().build();
      const html = paywall.generateHtml(mockPaymentRequired);

      expect(html).toContain("https://example.com/api/data");
    });

    it("defaults to testnet when not specified", () => {
      const paywall = createPaywall().build();
      const html = paywall.generateHtml(mockPaymentRequired);

      expect(html).toContain("testnet: true");
    });
  });
});

