import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { useFacilitator } from "./useFacilitator";
import { PaymentPayload, PaymentRequirements } from "../types/verify";

vi.mock("axios");

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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: {} });
  });

  describe("verify", () => {
    it("should call axios with the correct data and default URL", async () => {
      const { verify } = useFacilitator();
      await verify(mockPaymentPayload, mockPaymentRequirements);

      expect(axios.post).toHaveBeenCalledWith(
        "https://x402.org/facilitator/verify",
        {
          x402Version: mockPaymentPayload.x402Version,
          paymentPayload: mockPaymentPayload,
          paymentRequirements: mockPaymentRequirements,
        },
        { headers: undefined },
      );
    });

    it("should use custom URL when provided", async () => {
      const customUrl = "https://custom-facilitator.org";
      const { verify } = useFacilitator({ url: customUrl });
      await verify(mockPaymentPayload, mockPaymentRequirements);

      expect(axios.post).toHaveBeenCalledWith(
        `${customUrl}/verify`,
        {
          x402Version: mockPaymentPayload.x402Version,
          paymentPayload: mockPaymentPayload,
          paymentRequirements: mockPaymentRequirements,
        },
        { headers: undefined },
      );
    });

    it("should include auth headers when createAuthHeaders is provided", async () => {
      const mockHeaders = {
        verify: { Authorization: "Bearer test-token" },
        settle: { Authorization: "Bearer test-token" },
      };
      const { verify } = useFacilitator({
        url: "https://x402.org/facilitator",
        createAuthHeaders: async () => mockHeaders,
      });
      await verify(mockPaymentPayload, mockPaymentRequirements);

      expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
        headers: mockHeaders.verify,
      });
    });

    it("should throw error on non-200 response", async () => {
      vi.mocked(axios.post).mockResolvedValue({ status: 400, statusText: "Bad Request" });
      const { verify } = useFacilitator();

      await expect(verify(mockPaymentPayload, mockPaymentRequirements)).rejects.toThrow(
        "Failed to verify payment: Bad Request",
      );
    });
  });

  describe("settle", () => {
    it("should call axios with the correct data and default URL", async () => {
      const { settle } = useFacilitator();
      await settle(mockPaymentPayload, mockPaymentRequirements);

      expect(axios.post).toHaveBeenCalledWith(
        "https://x402.org/facilitator/settle",
        {
          x402Version: mockPaymentPayload.x402Version,
          paymentPayload: mockPaymentPayload,
          paymentRequirements: mockPaymentRequirements,
        },
        { headers: undefined },
      );
    });

    it("should use custom URL when provided", async () => {
      const customUrl = "https://custom-facilitator.org";
      const { settle } = useFacilitator({ url: customUrl });
      await settle(mockPaymentPayload, mockPaymentRequirements);

      expect(axios.post).toHaveBeenCalledWith(
        `${customUrl}/settle`,
        {
          x402Version: mockPaymentPayload.x402Version,
          paymentPayload: mockPaymentPayload,
          paymentRequirements: mockPaymentRequirements,
        },
        { headers: undefined },
      );
    });

    it("should include auth headers when createAuthHeaders is provided", async () => {
      const mockHeaders = {
        verify: { Authorization: "Bearer test-token" },
        settle: { Authorization: "Bearer test-token" },
      };
      const { settle } = useFacilitator({
        url: "https://x402.org/facilitator",
        createAuthHeaders: async () => mockHeaders,
      });
      await settle(mockPaymentPayload, mockPaymentRequirements);

      expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
        headers: mockHeaders.settle,
      });
    });

    it("should throw error on non-200 response", async () => {
      vi.mocked(axios.post).mockResolvedValue({ status: 400, statusText: "Bad Request" });
      const { settle } = useFacilitator();

      await expect(settle(mockPaymentPayload, mockPaymentRequirements)).rejects.toThrow(
        "Failed to settle payment: Bad Request",
      );
    });
  });
});
