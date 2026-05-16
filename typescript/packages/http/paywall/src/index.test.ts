import { describe, it, expect } from "vitest";
import * as paywallPkg from "./index";
import type { PaymentRequired } from "./index";

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
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount: "100000",
      payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
      maxTimeoutSeconds: 60,
    },
  ],
};

describe("@x402/paywall", () => {
  it("exports the documented public API", () => {
    // Refines the prior tautological "should be defined" test:
    // assert the package re-exports the values its index.ts promises.
    expect(typeof paywallPkg.createPaywall).toBe("function");
    expect(typeof paywallPkg.PaywallBuilder).toBe("function");
    expect(paywallPkg.evmPaywall).toBeDefined();
    expect(typeof paywallPkg.evmPaywall.supports).toBe("function");
    expect(typeof paywallPkg.evmPaywall.generateHtml).toBe("function");
    expect(paywallPkg.svmPaywall).toBeDefined();
    expect(paywallPkg.avmPaywall).toBeDefined();
  });

  it("handles payment required responses via the public API", () => {
    // Formerly: it.todo("should handle payment required responses")
    // The package's public contract: given a PaymentRequired (a 402 payload
    // with an `accepts` array), createPaywall().build() must produce a
    // provider that consumes it and emits an HTML string keyed off the
    // matching network handler.
    const provider = paywallPkg.createPaywall().withNetwork(paywallPkg.evmPaywall).build();

    const html = provider.generateHtml(mockPaymentRequired);

    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    // The originating resource URL from the 402 must flow into the page.
    expect(html).toContain("https://example.com/api/data");

    // With no registered handler, the public API must reject the 402,
    // not silently render an empty page.
    const emptyProvider = paywallPkg.createPaywall().build();
    expect(() => emptyProvider.generateHtml(mockPaymentRequired)).toThrow(
      /No paywall handlers registered/,
    );
  });

  it("renders a paywall UI as a complete HTML document", () => {
    // Formerly: it.todo("should render paywall UI")
    // The "UI" the package renders is a self-contained HTML document with
    // an embedded x402 runtime config; assert the document shape and that
    // user-supplied config (appName) reaches the rendered output.
    const html = paywallPkg
      .createPaywall()
      .withNetwork(paywallPkg.evmPaywall)
      .withConfig({ appName: "Index Test App", testnet: true })
      .build()
      .generateHtml(mockPaymentRequired);

    expect(html).toMatch(/^\s*<!DOCTYPE html>/i);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("window.x402");
    expect(html).toContain("Index Test App");
    expect(html).toContain("testnet: true");
  });

  // Formerly: it.todo("should process payments")
  // Out of scope for @x402/paywall. This package only renders the HTML/JS
  // shell shown for a 402 response; the actual signing/submission of a
  // payment happens in the browser-side wallet runtime bundled into that
  // HTML, and on the resource server / facilitator side (see
  // @x402/core/server and the http framework adapters such as
  // @x402/express). There is no server-side "process payments" entry point
  // exported from this package to test here.
  it.skip("should process payments (out of scope for @x402/paywall)", () => {});
});
