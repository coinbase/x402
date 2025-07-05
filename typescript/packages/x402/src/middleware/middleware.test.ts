import { describe, it, expect, vi } from "vitest";
import type { PaymentPayload, PaymentRequirements, Resource, SettleResponse } from "../types";
import {
  AcquiredPayment,
  PaymentMiddleware,
  PaymentMiddlewareConfigError,
  X402Error,
} from "./middleware";

const CONFIG = {
  price: "$0.01",
  network: "base",
  payTo: "0xBAc675C310721717Cd4A37F6cbeA1F081b1C2a07",
  paymentFromRequest: () => undefined,
} as const;

describe("PaymentMiddleware", () => {
  describe("constructor", () => {
    it("throws if neither config.resource nor resourceFromRequest is provided", () => {
      expect(() => new PaymentMiddleware(CONFIG)).toThrowError(PaymentMiddlewareConfigError);
    });
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
        paymentFromRequest: () => undefined,
      } as const;

      const middleware = new PaymentMiddleware(config);

      const requirements = middleware.paymentRequirements({});
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
    it("accepts resourceFromRequest function and uses it", () => {
      type FauxRequest = { path: string };
      const resourceFromRequest = vi.fn((req: FauxRequest) => `/dynamic/${req.path}` as Resource);
      const config = {
        ...CONFIG,
        resourceFromRequest,
      } as const;
      const middleware = new PaymentMiddleware(config);

      const fakeRequest = { path: "user/42" };
      const requirements = middleware.paymentRequirements(fakeRequest);

      expect(requirements).toHaveLength(1);
      expect(requirements[0].resource).toEqual("/dynamic/user/42");
      expect(resourceFromRequest).toHaveBeenCalledWith(fakeRequest);
    });
  });

  describe("paymentRequirements", () => {
    it("returns payment requirements using static resource", () => {
      const config = {
        ...CONFIG,
        config: {
          resource: "https://static.example/resource" as Resource,
          description: "static",
          mimeType: "application/json",
        },
      } as const;
      const middleware = new PaymentMiddleware(config);
      const requirements = middleware.paymentRequirements({});

      expect(requirements).toHaveLength(1);
      expect(requirements[0].resource).toEqual("https://static.example/resource");
      expect(requirements[0].description).toEqual("static");
      expect(requirements[0].mimeType).toEqual("application/json");
    });
    it("returns payment requirements using dynamic resourceFromRequest", () => {
      const resourceFromRequest = vi.fn(
        (req: { slug: string }) => `/dynamic/${req.slug}` as Resource,
      );
      const config = {
        ...CONFIG,
        resourceFromRequest,
      } as const;
      const middleware = new PaymentMiddleware<{ slug: string }>(config);
      const fakeRequest = { slug: "abc123" };
      const requirements = middleware.paymentRequirements(fakeRequest);

      expect(requirements).toHaveLength(1);
      expect(requirements[0].resource).toEqual("/dynamic/abc123");
    });
    it("includes correct network, asset, payTo, and maxAmountRequired", () => {
      const config = {
        price: "$0.01",
        network: "base",
        payTo: "0xBAc675C310721717Cd4A37F6cbeA1F081b1C2a07",
        config: {
          resource: "res://test",
        },
        paymentFromRequest: () => undefined,
      } as const;

      const middleware = new PaymentMiddleware(config);
      const req = middleware.paymentRequirements({})[0];

      expect(req.network).toBe("base");
      expect(req.maxAmountRequired).toBe("10000");
      expect(req.payTo.toLowerCase()).toBe("0xbac675c310721717cd4a37f6cbea1f081b1c2a07");
      expect(req.asset.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    });
  });

  describe("acquirePayment", () => {
    it("returns AcquiredPayment on valid payment and verification", async () => {
      const validPayload = { foo: "bar" };
      const matchingRequirements = [
        { resource: "res://test" },
      ] as unknown as Array<PaymentRequirements>;

      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        paymentFromRequest: () => validPayload as unknown as PaymentPayload,
        verifyFn: vi.fn(() => Promise.resolve({ isValid: true, payer: "0xabc" })),
      });

      const result = await middleware.acquirePayment({}, matchingRequirements);
      expect(result).toBeDefined();
      expect(result?.payload).toBe(validPayload);
    });
    it("returns undefined if no payment and canRenderPaywall returns true", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        canRenderPaywall: () => true,
        paymentFromRequest: () => undefined,
      });

      const result = await middleware.acquirePayment({}, []);
      expect(result).toBeUndefined();
    });
    it("throws X402Error if no payment and canRenderPaywall returns false", async () => {
      const middleware = new PaymentMiddleware({
        ...CONFIG,
        config: {
          resource: "res://test",
        },
        canRenderPaywall: () => false,
        paymentFromRequest: () => undefined,
      });

      try {
        await middleware.acquirePayment({}, []);
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
        paymentFromRequest: () => ({ foo: "bar" }) as unknown as PaymentPayload,
      });

      try {
        await middleware.acquirePayment({}, []);
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
        paymentFromRequest: () => ({ foo: "bar" }) as unknown as PaymentPayload,
        verifyFn: vi.fn(() =>
          Promise.resolve({
            isValid: false,
            invalidReason: "invalid_exact_evm_payload_authorization_valid_before",
            payer: "0xdef",
          } as const),
        ),
      });

      try {
        await middleware.acquirePayment({}, [
          { resource: "res://test" } as unknown as PaymentRequirements,
        ]);
        expect.unreachable();
      } catch (e) {
        expect(e).instanceOf(X402Error);
        expect(String(e)).toContain("invalid_exact_evm_payload_authorization_valid_before");
      }
    });
  });
});

describe("AcquiredPayment", () => {
  it("settle resolves with settlement on success", async () => {
    const settleMock = vi.fn(async () => {
      return {
        success: true,
        transaction: "0x123",
        network: "base",
        payer: "0xabc",
      } satisfies SettleResponse;
    });

    const payment = new AcquiredPayment(
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

    const payment = new AcquiredPayment(
      { foo: "bar" } as unknown as PaymentPayload,
      { resource: "res://test" } as unknown as PaymentRequirements,
      [{ resource: "res://test" } as unknown as PaymentRequirements],
      settleMock,
    );

    await expect(payment.settle()).rejects.toThrow(X402Error);
    await expect(payment.settle()).rejects.toThrow("Settlement failed: insufficient_funds");
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
