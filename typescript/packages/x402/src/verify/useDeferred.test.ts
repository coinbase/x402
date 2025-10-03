import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useDeferredFacilitator } from "./useDeferred";
import { DEFAULT_FACILITATOR_URL } from "./useFacilitator";
import {
  DeferredEvmPayloadSignedVoucher,
  DeferredErrorResponse,
  DeferredVoucherResponse,
  DeferredVouchersResponse,
  PaymentRequirements,
  PaymentPayload,
} from "../types";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useDeferredFacilitator", () => {
  const customFacilitatorUrl = "https://custom.facilitator.com/api";

  const buyerAddress = "0xf33332f96E5EA32c90a5301b646Bf5e93EA1D892";
  const sellerAddress = "0x1234567890123456789012345678901234567890";
  const escrowAddress = "0xffffff12345678901234567890123456789fffff";
  const assetAddress = "0x1111111111111111111111111111111111111111";
  const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";
  const voucherSignature =
    "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

  const mockSignedVoucher: DeferredEvmPayloadSignedVoucher = {
    id: voucherId,
    buyer: buyerAddress,
    seller: sellerAddress,
    valueAggregate: "1000000",
    asset: assetAddress,
    timestamp: 1715769600,
    nonce: 0,
    escrow: escrowAddress,
    chainId: 84532,
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
    signature: voucherSignature,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("useDeferredFacilitator initialization and configuration", () => {
    it("should instantiate a valid facilitator", () => {
      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      expect(facilitator).toHaveProperty("getVoucher");
      expect(facilitator).toHaveProperty("getVoucherSeries");
      expect(facilitator).toHaveProperty("getVouchers");
      expect(facilitator).toHaveProperty("getAvailableVoucher");
      expect(facilitator).toHaveProperty("storeVoucher");
      expect(facilitator).toHaveProperty("verifyVoucher");
      expect(facilitator).toHaveProperty("settleVoucher");
      expect(facilitator).toHaveProperty("getVoucherCollections");
    });

    it("should use default facilitator URL when no config provided", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockSignedVoucher),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      await facilitator.getVoucher(voucherId, 0);

      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/${voucherId}/0`,
      );
    });

    it("should use custom facilitator URL when config provided", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockSignedVoucher),
      });

      const facilitator = useDeferredFacilitator({ url: customFacilitatorUrl });
      await facilitator.getVoucher(voucherId, 0);

      expect(mockFetch).toHaveBeenCalledWith(
        `${customFacilitatorUrl}/deferred/vouchers/${voucherId}/0`,
      );
    });
  });

  describe("getVoucher", () => {
    it("should fetch voucher successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockSignedVoucher),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucher(voucherId, 0);

      expect(result).toEqual(mockSignedVoucher);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/${voucherId}/0`,
      );
    });

    it("should throw error for non-200 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Voucher not found",
      };

      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucher(voucherId, 0)).rejects.toThrow("Voucher not found");
    });

    it("should throw error when response contains error field", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Internal server error",
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucher(voucherId, 0)).rejects.toThrow("Internal server error");
    });

    it("should use fallback error message when no error field", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucher(voucherId, 0)).rejects.toThrow(
        "Failed to fetch voucher history: Internal Server Error",
      );
    });
  });

  describe("getVoucherSeries", () => {
    it("should fetch voucher series without pagination", async () => {
      const mockResponse: DeferredVouchersResponse = {
        data: [mockSignedVoucher],
        count: 1,
        pagination: { limit: 10, offset: 0 },
      };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucherSeries(voucherId, {});

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/${voucherId}`,
      );
    });

    it("should fetch voucher series with pagination", async () => {
      const mockResponse: DeferredVouchersResponse = {
        data: [mockSignedVoucher],
        count: 1,
        pagination: { limit: 10, offset: 5 },
      };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucherSeries(voucherId, { limit: 10, offset: 5 });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/${voucherId}?limit=10&offset=5`,
      );
    });

    it("should throw error for non-200 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Series not found",
      };

      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucherSeries(voucherId, {})).rejects.toThrow("Series not found");
    });

    it("should throw error when response contains error field", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Internal server error",
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucherSeries(voucherId, {})).rejects.toThrow(
        "Internal server error",
      );
    });

    it("should use fallback error message when no error field", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucherSeries(voucherId, {})).rejects.toThrow(
        "Failed to fetch voucher history: Internal Server Error",
      );
    });
  });

  describe("getVouchers", () => {
    it("should fetch vouchers with basic query", async () => {
      const mockResponse: DeferredVouchersResponse = {
        data: [mockSignedVoucher],
        count: 1,
        pagination: { limit: 10, offset: 0 },
      };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVouchers(
        { buyer: buyerAddress, seller: sellerAddress },
        {},
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers?buyer=${buyerAddress}&seller=${sellerAddress}`,
      );
    });

    it("should fetch vouchers with pagination and filters", async () => {
      const mockResponse: DeferredVouchersResponse = {
        data: [mockSignedVoucher],
        count: 1,
        pagination: { limit: 50, offset: 10 },
      };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVouchers(
        { buyer: buyerAddress, seller: sellerAddress, latest: true },
        { limit: 50, offset: 10 },
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers?limit=50&offset=10&latest=true&buyer=${buyerAddress}&seller=${sellerAddress}`,
      );
    });

    it("should throw error for non-200 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Query failed",
      };

      mockFetch.mockResolvedValueOnce({
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.getVouchers({ buyer: buyerAddress, seller: sellerAddress }, {}),
      ).rejects.toThrow("Query failed");
    });

    it("should throw error when response contains error field", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Internal server error",
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.getVouchers({ buyer: buyerAddress, seller: sellerAddress }, {}),
      ).rejects.toThrow("Internal server error");
    });

    it("should use fallback error message when no error field", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.getVouchers({ buyer: buyerAddress, seller: sellerAddress }, {}),
      ).rejects.toThrow("Failed to fetch voucher history: Internal Server Error");
    });
  });

  describe("getAvailableVoucher", () => {
    it("should fetch available voucher successfully", async () => {
      const mockResponse: DeferredVoucherResponse = mockSignedVoucher;
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getAvailableVoucher(buyerAddress, sellerAddress);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/available/${buyerAddress}/${sellerAddress}`,
      );
    });

    it("should handle 404 status gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: () => Promise.resolve({ error: "voucher_not_found" }),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getAvailableVoucher(buyerAddress, sellerAddress);

      expect(result).toEqual({ error: "voucher_not_found" });
    });

    it("should throw error for other non-200 status codes", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Server error",
      };

      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getAvailableVoucher(buyerAddress, sellerAddress)).rejects.toThrow(
        "Server error",
      );
    });

    it("should throw error when response contains error field", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Voucher validation failed",
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getAvailableVoucher(buyerAddress, sellerAddress)).rejects.toThrow(
        "Voucher validation failed",
      );
    });

    it("should use fallback error message for non-200 status", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getAvailableVoucher(buyerAddress, sellerAddress)).rejects.toThrow(
        "Failed to fetch available voucher: Forbidden",
      );
    });
  });

  describe("verifyVoucher", () => {
    it("should verify voucher successfully", async () => {
      const mockResponse = { isValid: true, payer: buyerAddress };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.verifyVoucher(voucherId, 0);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/${voucherId}/0/verify`,
        {
          method: "POST",
        },
      );
    });

    it("should throw error for non-200 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Verification failed",
      };

      mockFetch.mockResolvedValueOnce({
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.verifyVoucher(voucherId, 0)).rejects.toThrow(
        "Failed to verify voucher: Bad Request",
      );
    });

    it("should use fallback error message", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.verifyVoucher(voucherId, 0)).rejects.toThrow(
        "Failed to verify voucher: Not Found",
      );
    });
  });

  describe("settleVoucher", () => {
    it("should settle voucher successfully", async () => {
      const mockResponse = {
        success: true,
        transaction: "0x1234567890abcdef",
        payer: buyerAddress,
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.settleVoucher(voucherId, 0);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/${voucherId}/0/settle`,
        {
          method: "POST",
        },
      );
    });

    it("should throw error for non-200 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Settlement failed",
      };

      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.settleVoucher(voucherId, 0)).rejects.toThrow(
        "Failed to settle voucher: Internal Server Error",
      );
    });

    it("should use fallback error message", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 503,
        statusText: "Service Unavailable",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.settleVoucher(voucherId, 0)).rejects.toThrow(
        "Failed to settle voucher: Service Unavailable",
      );
    });
  });

  describe("storeVoucher", () => {
    const mockPaymentPayload = {
      x402Version: 1,
      scheme: "deferred",
      network: "base-sepolia",
      payload: {
        signature: voucherSignature,
        voucher: {
          id: voucherId,
          buyer: buyerAddress,
          seller: sellerAddress,
          valueAggregate: "1000000",
          asset: assetAddress,
          timestamp: 1715769600,
          nonce: 0,
          escrow: escrowAddress,
          chainId: 84532,
          expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
        },
      },
    } as PaymentPayload;

    const mockPaymentRequirements = {
      scheme: "deferred",
      network: "base-sepolia",
      maxAmountRequired: "1000000",
      resource: "https://example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      payTo: sellerAddress,
      maxTimeoutSeconds: 300,
      asset: assetAddress,
      extra: {
        type: "new",
        voucher: {
          id: voucherId,
          escrow: escrowAddress,
        },
      },
    } as PaymentRequirements;

    it("should verify and store voucher successfully", async () => {
      const mockResponse: DeferredVoucherResponse = mockSignedVoucher;

      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.storeVoucher(mockPaymentPayload, mockPaymentRequirements);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${DEFAULT_FACILITATOR_URL}/deferred/vouchers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          x402Version: mockPaymentPayload.x402Version,
          paymentPayload: mockPaymentPayload,
          paymentRequirements: mockPaymentRequirements,
        }),
      });
    });

    it("should throw error for non-201 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Verification failed",
      };

      mockFetch.mockResolvedValueOnce({
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.storeVoucher(mockPaymentPayload, mockPaymentRequirements),
      ).rejects.toThrow("Verification failed");
    });

    it("should throw error when response contains error field", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Invalid voucher signature",
      };

      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.storeVoucher(mockPaymentPayload, mockPaymentRequirements),
      ).rejects.toThrow("Invalid voucher signature");
    });

    it("should throw error when response contains invalidReason field", async () => {
      const mockVerifyResponse = {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_signature",
        payer: buyerAddress,
      };

      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve(mockVerifyResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.storeVoucher(mockPaymentPayload, mockPaymentRequirements),
      ).rejects.toThrow("invalid_deferred_evm_payload_signature");
    });

    it("should use fallback error message when no specific error provided", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(
        facilitator.storeVoucher(mockPaymentPayload, mockPaymentRequirements),
      ).rejects.toThrow("Failed to verify and store voucher: Internal Server Error");
    });

    it("should handle complex payment requirements with aggregation", async () => {
      const aggregationRequirements = {
        ...mockPaymentRequirements,
        extra: {
          type: "aggregation",
          signature: voucherSignature,
          voucher: {
            id: voucherId,
            buyer: buyerAddress,
            seller: sellerAddress,
            valueAggregate: "500000",
            asset: assetAddress,
            timestamp: 1715769600,
            nonce: 0,
            escrow: escrowAddress,
            chainId: 84532,
            expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
          },
        },
      } as PaymentRequirements;

      const mockResponse: DeferredVoucherResponse = {
        ...mockSignedVoucher,
        valueAggregate: "1500000",
        nonce: 1,
      };

      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.storeVoucher(mockPaymentPayload, aggregationRequirements);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${DEFAULT_FACILITATOR_URL}/deferred/vouchers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          x402Version: mockPaymentPayload.x402Version,
          paymentPayload: mockPaymentPayload,
          paymentRequirements: aggregationRequirements,
        }),
      });
    });

    it("should use custom facilitator URL", async () => {
      const mockResponse: DeferredVoucherResponse = mockSignedVoucher;

      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: customFacilitatorUrl });
      const result = await facilitator.storeVoucher(mockPaymentPayload, mockPaymentRequirements);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${customFacilitatorUrl}/deferred/vouchers`,
        expect.any(Object),
      );
    });
  });

  describe("getVoucherCollections", () => {
    it("should fetch voucher collections without query or pagination", async () => {
      const mockResponse = {
        data: [
          {
            id: voucherId,
            nonce: 0,
            transaction: "0xabcdef1234567890",
            timestamp: 1715769600,
          },
        ],
        count: 1,
        pagination: { limit: 10, offset: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucherCollections({}, {});

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/collections`,
      );
    });

    it("should fetch voucher collections with id and nonce query", async () => {
      const mockResponse = {
        data: [
          {
            id: voucherId,
            nonce: 2,
            transaction: "0xabcdef1234567890",
            timestamp: 1715769600,
          },
        ],
        count: 1,
        pagination: { limit: 10, offset: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucherCollections({ id: voucherId, nonce: 2 }, {});

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/collections?id=${voucherId}&nonce=2`,
      );
    });

    it("should fetch voucher collections with pagination", async () => {
      const mockResponse = {
        data: [
          {
            id: voucherId,
            nonce: 0,
            transaction: "0xabcdef1234567890",
            timestamp: 1715769600,
          },
        ],
        count: 1,
        pagination: { limit: 20, offset: 10 },
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucherCollections({}, { limit: 20, offset: 10 });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/collections?limit=20&offset=10`,
      );
    });

    it("should fetch voucher collections with all parameters", async () => {
      const mockResponse = {
        data: [
          {
            id: voucherId,
            nonce: 3,
            transaction: "0xabcdef1234567890",
            timestamp: 1715769600,
          },
        ],
        count: 1,
        pagination: { limit: 50, offset: 25 },
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });
      const result = await facilitator.getVoucherCollections(
        { id: voucherId, nonce: 3 },
        { limit: 50, offset: 25 },
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/deferred/vouchers/collections?limit=50&offset=25&id=${voucherId}&nonce=3`,
      );
    });

    it("should throw error for non-200 status", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Collections not found",
      };

      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucherCollections({}, {})).rejects.toThrow(
        "Collections not found",
      );
    });

    it("should throw error when response contains error field", async () => {
      const mockErrorResponse: DeferredErrorResponse = {
        error: "Database error",
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucherCollections({}, {})).rejects.toThrow("Database error");
    });

    it("should use fallback error message when no error field", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      });

      const facilitator = useDeferredFacilitator({ url: DEFAULT_FACILITATOR_URL });

      await expect(facilitator.getVoucherCollections({}, {})).rejects.toThrow(
        "Failed to fetch voucher collections: Internal Server Error",
      );
    });

    it("should use custom facilitator URL", async () => {
      const mockResponse = {
        data: [],
        count: 0,
        pagination: { limit: 10, offset: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitator = useDeferredFacilitator({ url: customFacilitatorUrl });
      const result = await facilitator.getVoucherCollections({}, {});

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${customFacilitatorUrl}/deferred/vouchers/collections`,
      );
    });
  });
});
