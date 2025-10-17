import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFacilitator } from "./useFacilitator";
import { PaymentPayload, PaymentRequirements } from "../types/verify";

describe("useFacilitator", () => {
  const mockPaymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: {
      signature: "0x1234567890123456789012345678901234567890123456789012345678901234",
      authorization: {
        from: "0x1234567890123456789012345678901234567890",
        to: "0x1234567890123456789012345678901234567890",
        value: "1000000",
        validAfter: "1234567890",
        validBefore: "1234567899",
        nonce: "1234567890",
      },
    },
  };

  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 300,
    asset: "0x1234567890123456789012345678901234567890",
  };

  const mockDeferredPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "20",
    resource: "http://localhost:3002/subgraph/1234",
    description: "",
    mimeType: "",
    payTo: "0xC93d37AD45c907eE1b27a02b2E1bd823BA9D379C",
    maxTimeoutSeconds: 60,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    extra: {
      type: "new",
      voucher: {
        id: "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
        escrow: "0x1a9ea876cfe472514967d2e5cf326fb49dc68559",
      },
    },
  };

  const mockDeferredPaymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: "deferred",
    network: "base-sepolia",
    payload: {
      signature:
        "0xa80421aca752ab2e10b7e073f636bb50ccaec54f2813f8c194b45256460b5603340ce9ce75c12d0dabbe64e2011907f4c887064a39c36f633cb232b45dbec4611c",
      voucher: {
        nonce: 0,
        id: "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
        escrow: "0x1a9ea876cfe472514967d2e5cf326fb49dc68559",
        buyer: "0x80cdF1957EBb7a2DF22dd8913753A4423FF4272E",
        seller: "0xC93d37AD45c907eE1b27a02b2E1bd823BA9D379C",
        valueAggregate: "20",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        timestamp: 1756226264,
        chainId: 84532,
        expiry: 1758818264,
      },
    },
  };

  const mockDeferredAggregatedPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "20",
    resource: "http://localhost:3002/subgraph/1234",
    description: "",
    mimeType: "",
    payTo: "0xC93d37AD45c907eE1b27a02b2E1bd823BA9D379C",
    maxTimeoutSeconds: 60,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    extra: {
      type: "aggregation",
      signature:
        "0xa80421aca752ab2e10b7e073f636bb50ccaec54f2813f8c194b45256460b5603340ce9ce75c12d0dabbe64e2011907f4c887064a39c36f633cb232b45dbec4611c",
      voucher: {
        nonce: 0,
        id: "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
        escrow: "0x1a9ea876cfe472514967d2e5cf326fb49dc68559",
        buyer: "0x80cdF1957EBb7a2DF22dd8913753A4423FF4272E",
        seller: "0xC93d37AD45c907eE1b27a02b2E1bd823BA9D379C",
        valueAggregate: "20",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        timestamp: 1756226264,
        chainId: 84532,
        expiry: 1758818264,
      },
    },
  };

  const mockDeferredAggregatedPaymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: "deferred",
    network: "base-sepolia",
    payload: {
      signature:
        "0xdf13d8f233a508ed40a85236df422d38edd0ad5ca3cb4e73d86cb712869919e82606bc2c29ace0d2a804b61808f099cf78d83b709ef1ea631b1496149cbfb1ea1c",
      voucher: {
        nonce: 1,
        id: "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
        escrow: "0x1a9ea876cfe472514967d2e5cf326fb49dc68559",
        buyer: "0x80cdF1957EBb7a2DF22dd8913753A4423FF4272E",
        seller: "0xC93d37AD45c907eE1b27a02b2E1bd823BA9D379C",
        valueAggregate: "40",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        timestamp: 1756226267,
        chainId: 84532,
        expiry: 1758818267,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      json: async () => ({}),
    });
  });

  describe("verify", () => {
    describe("exact scheme", () => {
      it("should call fetch with the correct data and default URL", async () => {
        const { verify } = useFacilitator();
        await verify(mockPaymentPayload, mockPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockPaymentPayload.x402Version,
            paymentPayload: mockPaymentPayload,
            paymentRequirements: mockPaymentRequirements,
          }),
        });
      });

      it("should use custom URL when provided", async () => {
        const customUrl = "https://custom-facilitator.org";
        const { verify } = useFacilitator({ url: customUrl });
        await verify(mockPaymentPayload, mockPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith(`${customUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockPaymentPayload.x402Version,
            paymentPayload: mockPaymentPayload,
            paymentRequirements: mockPaymentRequirements,
          }),
        });
      });

      it("should include auth headers when createAuthHeaders is provided", async () => {
        const mockHeaders = {
          verify: { Authorization: "Bearer test-token" },
          settle: { Authorization: "Bearer test-token" },
          supported: { Authorization: "Bearer test-token" },
        };
        const { verify } = useFacilitator({
          url: "https://x402.org/facilitator",
          createAuthHeaders: async () => mockHeaders,
        });
        await verify(mockPaymentPayload, mockPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith(
          "https://x402.org/facilitator/verify",
          expect.objectContaining({
            headers: { "Content-Type": "application/json", ...mockHeaders.verify },
          }),
        );
      });

      it("should throw error on non-200 response", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          status: 400,
          statusText: "Bad Request",
          json: async () => ({}),
        });
        const { verify } = useFacilitator();

        await expect(verify(mockPaymentPayload, mockPaymentRequirements)).rejects.toThrow(
          "Failed to verify payment: Bad Request",
        );
      });
    });

    describe("deferred scheme", () => {
      it("should call fetch with the correct data and default URL", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          status: 200,
          json: async () => ({
            isValid: true,
            payer: mockDeferredPaymentPayload.payload.voucher.buyer,
          }),
        });

        const { verify } = useFacilitator();
        await verify(mockDeferredPaymentPayload, mockDeferredPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockDeferredPaymentPayload.x402Version,
            paymentPayload: mockDeferredPaymentPayload,
            paymentRequirements: mockDeferredPaymentRequirements,
          }),
        });
      });

      it("should call fetch with the correct data and default URL for aggregated payment", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          status: 200,
          json: async () => ({
            isValid: true,
            payer: mockDeferredAggregatedPaymentPayload.payload.voucher.buyer,
          }),
        });

        const { verify } = useFacilitator();
        const result = await verify(
          mockDeferredAggregatedPaymentPayload,
          mockDeferredAggregatedPaymentRequirements,
        );

        expect(result).toEqual({
          isValid: true,
          payer: mockDeferredAggregatedPaymentPayload.payload.voucher.buyer,
        });
        expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockDeferredAggregatedPaymentPayload.x402Version,
            paymentPayload: mockDeferredAggregatedPaymentPayload,
            paymentRequirements: mockDeferredAggregatedPaymentRequirements,
          }),
        });
      });
    });
  });

  describe("settle", () => {
    describe("exact scheme", () => {
      it("should call fetch with the correct data and default URL", async () => {
        const { settle } = useFacilitator();
        await settle(mockPaymentPayload, mockPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockPaymentPayload.x402Version,
            paymentPayload: mockPaymentPayload,
            paymentRequirements: mockPaymentRequirements,
          }),
        });
      });

      it("should use custom URL when provided", async () => {
        const customUrl = "https://custom-facilitator.org";
        const { settle } = useFacilitator({ url: customUrl });
        await settle(mockPaymentPayload, mockPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith(`${customUrl}/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockPaymentPayload.x402Version,
            paymentPayload: mockPaymentPayload,
            paymentRequirements: mockPaymentRequirements,
          }),
        });
      });

      it("should include auth headers when createAuthHeaders is provided", async () => {
        const mockHeaders = {
          verify: { Authorization: "Bearer test-token" },
          settle: { Authorization: "Bearer test-token" },
          supported: { Authorization: "Bearer test-token" },
        };
        const { settle } = useFacilitator({
          url: "https://x402.org/facilitator",
          createAuthHeaders: async () => mockHeaders,
        });
        await settle(mockPaymentPayload, mockPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith(
          "https://x402.org/facilitator/settle",
          expect.objectContaining({
            headers: { "Content-Type": "application/json", ...mockHeaders.settle },
          }),
        );
      });

      it("should throw error on non-200 response", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          status: 400,
          statusText: "Bad Request",
          json: async () => ({}),
        });
        const { settle } = useFacilitator();

        await expect(settle(mockPaymentPayload, mockPaymentRequirements)).rejects.toThrow(
          "Failed to settle payment: 400 Bad Request",
        );
      });
    });

    describe("deferred scheme", () => {
      it("should call fetch with the correct data and default URL", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          status: 200,
          json: async () => ({
            success: true,
            transaction: "0x1234567890abcdef",
            payer: mockDeferredPaymentPayload.payload.voucher.buyer,
          }),
        });

        const { settle } = useFacilitator();
        await settle(mockDeferredPaymentPayload, mockDeferredPaymentRequirements);

        expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockDeferredPaymentPayload.x402Version,
            paymentPayload: mockDeferredPaymentPayload,
            paymentRequirements: mockDeferredPaymentRequirements,
          }),
        });
      });

      it("should call fetch with the correct data and default URL for aggregated payment", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          status: 200,
          json: async () => ({
            success: true,
            transaction: "0xabcdef1234567890",
            payer: mockDeferredAggregatedPaymentPayload.payload.voucher.buyer,
          }),
        });

        const { settle } = useFacilitator();
        const result = await settle(
          mockDeferredAggregatedPaymentPayload,
          mockDeferredAggregatedPaymentRequirements,
        );

        expect(result).toEqual({
          success: true,
          transaction: "0xabcdef1234567890",
          payer: mockDeferredAggregatedPaymentPayload.payload.voucher.buyer,
        });
        expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x402Version: mockDeferredAggregatedPaymentPayload.x402Version,
            paymentPayload: mockDeferredAggregatedPaymentPayload,
            paymentRequirements: mockDeferredAggregatedPaymentRequirements,
          }),
        });
      });
    });
  });

  describe("supported", () => {
    it("should call fetch with the correct default URL", async () => {
      const { supported } = useFacilitator();
      await supported();

      expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/supported", {
        headers: { "Content-Type": "application/json" },
        method: "GET",
      });
    });

    it("should call fetch with the correct custom URL", async () => {
      const { supported } = useFacilitator({ url: "https://custom-facilitator.org" });
      await supported();

      expect(fetch).toHaveBeenCalledWith("https://custom-facilitator.org/supported", {
        headers: { "Content-Type": "application/json" },
        method: "GET",
      });
    });

    it("should throw error on non-200 response", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 500,
        statusText: "Internal Server Error",
      });

      const { supported } = useFacilitator();

      await expect(supported()).rejects.toThrow(
        "Failed to get supported payment kinds: Internal Server Error",
      );
    });
  });

  describe("list", () => {
    it("should call fetch with the correct URL and method", async () => {
      const { list } = useFacilitator();
      await list();

      expect(fetch).toHaveBeenCalledWith("https://x402.org/facilitator/discovery/resources?", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("should use custom URL when provided", async () => {
      const customUrl = "https://custom-facilitator.org";
      const { list } = useFacilitator({ url: customUrl });
      await list();

      expect(fetch).toHaveBeenCalledWith(`${customUrl}/discovery/resources?`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("should properly encode query parameters", async () => {
      const { list } = useFacilitator();
      const config = {
        type: "test-type",
        limit: 10,
        offset: 20,
      };
      await list(config);

      const expectedUrl =
        "https://x402.org/facilitator/discovery/resources?type=test-type&limit=10&offset=20";
      expect(fetch).toHaveBeenCalledWith(expectedUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("should filter out undefined query parameters", async () => {
      const { list } = useFacilitator();
      const config = {
        type: "test-type",
        limit: 10,
        offset: undefined,
      };
      await list(config);

      const expectedUrl =
        "https://x402.org/facilitator/discovery/resources?type=test-type&limit=10";
      expect(fetch).toHaveBeenCalledWith(expectedUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("should throw error on non-200 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 400,
        statusText: "Bad Request",
        json: async () => ({}),
      });
      const { list } = useFacilitator();

      await expect(list()).rejects.toThrow("Failed to list discovery: 400 Bad Request");
    });
  });
});
