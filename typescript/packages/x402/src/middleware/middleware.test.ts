import { describe, it, expect, vi } from "vitest";
import type {
  PaymentPayload,
  PaymentRequirements,
  Resource,
  RouteConfig,
  SettleResponse,
} from "../types";
import {
  VerifiedPayment,
  PaymentMiddleware,
  PaymentMiddlewareConfigError,
  X402Error,
  routeConfigToPaymentOptions,
  renderPaywallHtml,
} from "./middleware";
import { getPaywallHtml, safeBase64Encode } from "../shared";

const CONFIG = {
  price: "$0.01",
  network: "base",
  payTo: "0xBAc675C310721717Cd4A37F6cbeA1F081b1C2a07",
  getHeader: () => undefined,
} as const;

vi.mock("../shared", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPaywallHtml: vi.fn().mockReturnValue(`<html>paywall</html>`),
  };
});

describe("PaymentMiddleware", () => {
  describe("constructor", () => {
    it("throws if price is invalid", () => {
      const config = {
        ...CONFIG,
        price: "💩", // intentionally invalid
        config: {
          resource: "https://example.com/resource.json" as Resource,
        },
      } as const;
      expect(() => new PaymentMiddleware(config)).toThrowError(PaymentMiddlewareConfigError);
    });
    it("throws if processPriceToAtomicAmount returns an error", () => {
      const config = {
        ...CONFIG,
        config: {
          resource: "https://example.com/resource.json" as Resource,
        },
        processPriceToAtomicAmountFn: () => {
          return { error: "Oops" };
        },
      } as const;
      expect(() => new PaymentMiddleware(config)).toThrowError(PaymentMiddlewareConfigError);
    });
    it("builds internal payment requirements correctly from config", () => {
      const config = {
        price: "$0.12345",
        network: "base",
        payTo: "0xBAc675C310721717Cd4A37F6cbeA1F081b1C2a07",
        config: {
          resource: "https://example.com/protected/resource",
          description: "Access to premium content",
          mimeType: "application/json",
          maxTimeoutSeconds: 600,
        },
        getHeader: () => undefined,
      } as const;

      const middleware = new PaymentMiddleware(config);

      const requirements = middleware.paymentRequirements("https://example.com/protected/treasure");
      expect(requirements).toHaveLength(1);

      const req = requirements[0];

      expect(req.resource).toEqual("https://example.com/protected/resource");
      expect(req.description).toEqual("Access to premium content");
      expect(req.mimeType).toEqual("application/json");
      expect(req.maxTimeoutSeconds).toEqual(600);
      expect(req.outputSchema).toEqual(undefined);
      expect(req.asset.toLowerCase()).toEqual("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
      expect(req.payTo.toLowerCase()).toEqual("0xbac675c310721717cd4a37f6cbea1f081b1c2a07");
      expect(req.maxAmountRequired).toEqual("123450");
      expect(req.scheme).toBe("exact");
      expect(req.network).toBe("base");
    });
  });

  describe("paymentRequirements", () => {
    it("returns payment requirements using static resource", () => {
      const config = {
        ...CONFIG,
        config: {
          description: "static",
          mimeType: "application/json",
        },
      } as const;
      const middleware = new PaymentMiddleware(config);
      const requirements = middleware.paymentRequirements("https://static.example/resource");

      expect(requirements).toHaveLength(1);
      expect(requirements[0].resource).toEqual("https://static.example/resource");
      expect(requirements[0].description).toEqual("static");
      expect(requirements[0].mimeType).toEqual("application/json");
    });

    it("includes correct network, asset, payTo, and maxAmountRequired", () => {
      const config = {
        price: "$0.01",
        network: "base",
        payTo: "0xBAc675C310721717Cd4A37F6cbeA1F081b1C2a07",
        config: {
          resource: "res://test",
        },
        getHeader: () => undefined,
      } as const;

      const middleware = new PaymentMiddleware(config);
      const req = middleware.paymentRequirements("https://example.com/protected/resource")[0];

      expect(req.network).toBe("base");
      expect(req.maxAmountRequired).toBe("10000");
      expect(req.payTo.toLowerCase()).toBe("0xbac675c310721717cd4a37f6cbea1f081b1c2a07");
      expect(req.asset.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    });
  });

  describe("verifyPayment", () => {
    const PAYMENT_PAYLOAD: PaymentPayload = {
      scheme: "exact",
      x402Version: 1,
      network: "base",
      payload: {
        authorization: {
          from: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          to: "0xBAc675C310721717Cd4A37F6cbeA1F081b1C2a07",
          value: "1000",
          validAfter: "1671234567",
          validBefore: "1671234567",
          nonce: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        signature: "0xdeadbeaf",
      },
    };
    const PAYMENT_PAYLOAD_B64 = safeBase64Encode(JSON.stringify(PAYMENT_PAYLOAD));
    const MATCHING_REQUIREMENTS = [
      { scheme: "exact", resource: "res://test", network: "base" },
    ] as unknown as Array<PaymentRequirements>;

    it("returns VerifiedPayment on valid payment and verification", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          if (name === "x-payment") {
            return PAYMENT_PAYLOAD_B64;
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });

      const result = await middleware.verifyPayment({}, MATCHING_REQUIREMENTS);
      expect(result).toBeDefined();
      expect(result?.payload).toEqual(PAYMENT_PAYLOAD);
    });
    it("returns undefined if no payment and canRenderPaywall returns true", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: () => undefined,
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });
      middleware.canRenderPaywall = () => true;

      const result = await middleware.verifyPayment({}, []);
      expect(result).toBeUndefined();
    });
    it("returns undefined if no payment and headers indicate it is a browser", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          switch (name) {
            case "x-payment":
              return undefined;
            case "user-agent":
              return "Mozilla";
            case "accept":
              return "text/html";
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });
      expect(middleware.canRenderPaywall({})).toEqual(true);

      const result = await middleware.verifyPayment({}, []);
      expect(result).toBeUndefined();
    });
    it("returns undefined if no payment and headers indicate it is a browser via an Array", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          switch (name) {
            case "x-payment":
              return undefined;
            case "user-agent":
              return ["Mozilla", "Opera"];
            case "accept":
              return ["text/html", "application/json"];
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });
      expect(middleware.canRenderPaywall({})).toEqual(true);

      const result = await middleware.verifyPayment({}, []);
      expect(result).toBeUndefined();
    });
    it("throws X402Error if invalid payment", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          if (name === "x-payment") {
            return safeBase64Encode(JSON.stringify({ "not-a-payment": true }));
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });
      await expect(middleware.verifyPayment({}, [])).rejects.toThrow(X402Error);
    });
    it("throws X402Error if no payment and canRenderPaywall returns false", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: () => {
          return undefined;
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });
      expect(middleware.canRenderPaywall({})).toEqual(false);

      try {
        await middleware.verifyPayment({}, []);
        expect.unreachable();
      } catch (e) {
        expect(e).instanceOf(X402Error);
        expect(String(e)).toContain("X-PAYMENT header is required");
      }
    });
    it("throws X402Error if no matching payment requirements", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          if (name === "x-payment") {
            return PAYMENT_PAYLOAD_B64;
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
          };
        },
      });

      try {
        await middleware.verifyPayment({}, []);
        expect.unreachable();
      } catch (e) {
        expect(e).instanceOf(X402Error);
        expect(String(e)).toContain("Unable to find matching payment requirements");
      }
    });
    it("throws X402Error if facilitator.verify returns isValid: false", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          if (name === "x-payment") {
            return PAYMENT_PAYLOAD_B64;
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() =>
              Promise.resolve({
                isValid: false,
                invalidReason: "invalid_exact_evm_payload_authorization_valid_before",
                payer: "0xdef",
              } as const),
            ),
          };
        },
      });

      try {
        await middleware.verifyPayment({}, MATCHING_REQUIREMENTS);
        expect.unreachable();
      } catch (e) {
        expect(e).instanceOf(X402Error);
        expect(String(e)).toContain("invalid_exact_evm_payload_authorization_valid_before");
      }
    });
    it("throws X402Error if facilitator.verify returns isValid: false with no invalidReason", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        getHeader: (_req, name) => {
          if (name === "x-payment") {
            return PAYMENT_PAYLOAD_B64;
          }
        },
        useFacilitatorFn: () => {
          return {
            settle: vi.fn(),
            verify: vi.fn(() =>
              Promise.resolve({
                isValid: false,
                payer: "0xdef",
              } as const),
            ),
          };
        },
      });

      try {
        await middleware.verifyPayment({}, MATCHING_REQUIREMENTS);
        expect.unreachable();
      } catch (e) {
        expect(e).instanceOf(X402Error);
        expect(String(e)).toContain("Payment verification failed");
      }
    });
  });
});

describe("VerifiedPayment", () => {
  it("settle resolves with settlement on success", async () => {
    const settleMock = vi.fn(async () => {
      return {
        success: true,
        transaction: "0x123",
        network: "base",
        payer: "0xabc",
      } satisfies SettleResponse;
    });

    const payment = new VerifiedPayment(
      { foo: "bar" } as unknown as PaymentPayload,
      { resource: "res://test" } as unknown as PaymentRequirements,
      [{ resource: "res://test" } as unknown as PaymentRequirements],
      settleMock,
    );

    const result = await payment.settle();
    expect(result).toEqual({
      success: true,
      transaction: "0x123",
      network: "base",
      payer: "0xabc",
    });
    expect(settleMock).toHaveBeenCalled();
  });
  it("settle throws X402Error on settlement failure", async () => {
    const settleMock = vi.fn(async () => {
      return {
        success: false,
        errorReason: "insufficient_funds",
        network: "base",
        payer: "0xabc",
        transaction: "0x123",
      } satisfies SettleResponse;
    });

    const payment = new VerifiedPayment(
      { foo: "bar" } as unknown as PaymentPayload,
      { resource: "res://test" } as unknown as PaymentRequirements,
      [{ resource: "res://test" } as unknown as PaymentRequirements],
      settleMock,
    );

    await expect(payment.settle()).rejects.toThrow(X402Error);
    await expect(payment.settle()).rejects.toThrow("Settlement failed: insufficient_funds");
  });
  it("settle throws X402Error on settlement error", async () => {
    const settleMock = vi.fn(async () => {
      throw new Error(`Oops`);
    });

    const payment = new VerifiedPayment(
      { foo: "bar" } as unknown as PaymentPayload,
      { resource: "res://test" } as unknown as PaymentRequirements,
      [{ resource: "res://test" } as unknown as PaymentRequirements],
      settleMock,
    );

    await expect(payment.settle()).rejects.toThrow(X402Error);
    await expect(payment.settle()).rejects.toThrow("Oops");
  });
});

describe("X402Error", () => {
  it("toJSON returns correct structure with x402Version, error, accepts, and payer", () => {
    const error = new X402Error(
      "some error occurred",
      [{ resource: "res://abc" } as unknown as PaymentRequirements],
      "0xabc123",
    );

    const json = error.toJSON();

    expect(json).toEqual({
      x402Version: 1,
      error: "some error occurred",
      accepts: [{ resource: "res://abc" }],
      payer: "0xabc123",
    });
  });
});

describe("PaymentMiddlewareConfigError", () => {
  it("sets message and inherits from Error", async () => {
    const err = new PaymentMiddlewareConfigError("something went wrong");

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("something went wrong");
    expect(err.name).toBe("PaymentMiddlewareConfigError");
  });
});

describe("routeConfigToPaymentOptions", () => {
  it("returns the same array if prices is provided and is non-empty", () => {
    const routeConfig = {
      prices: [{ price: "$0.01", network: "base" }],
    } satisfies RouteConfig;
    const result = routeConfigToPaymentOptions(routeConfig);
    expect(result).toEqual([{ price: "$0.01", network: "base" }]);
  });
  it("return a single-element array with the legacy format", () => {
    const routeConfig = {
      price: "$0.01",
      network: "base",
    } satisfies RouteConfig;
    const result = routeConfigToPaymentOptions(routeConfig);
    expect(result).toEqual([{ price: "$0.01", network: "base" }]);
  });
  it("throw PaymentMiddlewareConfigError if no prices, price, or network", () => {
    expect(() => routeConfigToPaymentOptions({})).toThrow(PaymentMiddlewareConfigError);
  });
});

describe("MiddlewareRoutesMap", () => {
  it("finds a correct route", () => {
    const map = PaymentMiddleware.forRoutes({
      routes: {
        "/foo": {
          price: "0.01",
        },
      },
      ...CONFIG,
    });
    const result = map.match("/foo", "GET");
    expect(result).toBeInstanceOf(PaymentMiddleware);
  });
  it("returns undefined if no match", () => {
    const map = PaymentMiddleware.forRoutes({
      routes: {
        "/foo": {
          price: "0.01",
        },
      },
      ...CONFIG,
    });
    const result = map.match("/foo/blah", "GET");
    expect(result).toBeUndefined();
  });
  it("correctly maps multiple routes", () => {
    const map = PaymentMiddleware.forRoutes({
      routes: {
        "/a": {
          price: "0.01",
        },
        "/b": { prices: [{ price: "0.01", network: "base" }] },
      },
      ...CONFIG,
    });
    expect(map.match("/a", "GET")).toBeInstanceOf(PaymentMiddleware);
    expect(map.match("/b", "POST")).toBeInstanceOf(PaymentMiddleware);
  });
});

describe("renderPaywallHtml", () => {
  it("renders default HTML when no customPaywallHtml is set", () => {
    const x402 = new PaymentMiddleware({
      ...CONFIG,
      config: {
        resource: "res://test",
      },
      paywall: {
        cdpClientKey: "test-client-key",
        appName: "Test App",
        appLogo: "/test-logo.png",
        sessionTokenEndpoint: "/api/x402/session-token",
      },
      getHeader: () => undefined,
    });

    const html = renderPaywallHtml(x402, x402.paymentRequirements("res://test"), "/test");
    expect(html).toMatch(/<html/i); // crude check that HTML was returned
    expect(getPaywallHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        cdpClientKey: "test-client-key",
        appName: "Test App",
        appLogo: "/test-logo.png",
        sessionTokenEndpoint: "/api/x402/session-token",
      }),
    );
  });
  it("renders customPaywallHtml when configured", () => {
    const x402 = new PaymentMiddleware({
      ...CONFIG,
      config: {
        resource: "res://test",
        customPaywallHtml: "<h1>Custom</h1>",
      },
      getHeader: () => undefined,
    });

    const html = renderPaywallHtml(x402, x402.paymentRequirements("res://test"), "/test");
    expect(html).toEqual("<h1>Custom</h1>");
  });
});
