import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address, getAddress } from "viem";
import {
  DeferredEvmPayloadSignedVoucher,
  DeferredPaymentRequirements,
  PaymentPayload,
} from "../../../types";
import { getPaymentRequirementsExtra } from "./server";
import * as idModule from "./id";
import * as paymentUtilsModule from "./utils/paymentUtils";

// Mock dependencies
vi.mock("./id", () => ({
  generateVoucherId: vi.fn(),
}));

vi.mock("./utils/paymentUtils", () => ({
  decodePayment: vi.fn(),
}));

describe("getPaymentRequirementsExtra", () => {
  const mockSeller: Address = "0x1234567890123456789012345678901234567890";
  const mockEscrow: Address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const mockBuyer: Address = "0x9876543210987654321098765432109876543210";
  const mockVoucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";
  const mockSignature =
    "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

  const mockVoucher = {
    id: mockVoucherId,
    buyer: mockBuyer,
    seller: mockSeller,
    valueAggregate: "1000000",
    asset: "0x1111111111111111111111111111111111111111",
    timestamp: 1715769600,
    nonce: 5,
    escrow: mockEscrow,
    chainId: 84532,
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
    signature: mockSignature,
  };

  const mockGetAvailableVoucher = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(idModule.generateVoucherId).mockReturnValue(mockVoucherId);
  });

  describe("when no headers are provided", () => {
    it("should return a new voucher extra", async () => {
      const result = await getPaymentRequirementsExtra(
        undefined,
        undefined,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "new",
        voucher: {
          id: mockVoucherId,
          escrow: mockEscrow,
        },
      });

      expect(mockGetAvailableVoucher).not.toHaveBeenCalled();
      expect(idModule.generateVoucherId).toHaveBeenCalledOnce();
    });
  });

  describe("when only X-BUYER header is provided", () => {
    it("should return aggregation extra when previous voucher exists", async () => {
      mockGetAvailableVoucher.mockResolvedValue(mockVoucher);

      const result = await getPaymentRequirementsExtra(
        undefined,
        mockBuyer,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "aggregation",
        signature: mockSignature,
        voucher: mockVoucher,
      });

      expect(mockGetAvailableVoucher).toHaveBeenCalledWith(mockBuyer, mockSeller);
      expect(mockGetAvailableVoucher).toHaveBeenCalledOnce();
    });

    it("should return new voucher extra when no previous voucher exists", async () => {
      mockGetAvailableVoucher.mockResolvedValue(null);

      const result = await getPaymentRequirementsExtra(
        undefined,
        mockBuyer,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "new",
        voucher: {
          id: mockVoucherId,
          escrow: mockEscrow,
        },
      });

      expect(mockGetAvailableVoucher).toHaveBeenCalledWith(mockBuyer, mockSeller);
    });
  });

  describe("when only X-PAYMENT header is provided", () => {
    const mockPaymentHeader = "base64encodedheader";

    it("should return aggregation extra when payment header is valid and previous voucher exists", async () => {
      vi.mocked(paymentUtilsModule.decodePayment).mockReturnValue({
        x402Version: 1,
        scheme: "deferred",
        network: "base-sepolia",
        payload: {
          signature: mockSignature,
          voucher: mockVoucher,
        },
      });

      mockGetAvailableVoucher.mockResolvedValue(mockVoucher);

      const result = await getPaymentRequirementsExtra(
        mockPaymentHeader,
        undefined,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "aggregation",
        signature: mockSignature,
        voucher: mockVoucher,
      });

      expect(paymentUtilsModule.decodePayment).toHaveBeenCalledWith(mockPaymentHeader);
      expect(mockGetAvailableVoucher).toHaveBeenCalledWith(mockBuyer, mockSeller);
    });

    it("should return new voucher extra when payment header is invalid", async () => {
      vi.mocked(paymentUtilsModule.decodePayment).mockReturnValue({
        x402Version: 1,
        scheme: "deferred",
        network: "base-sepolia",
        payload: {
          invalidField: "invalid",
        },
      } as unknown as PaymentPayload);

      const result = await getPaymentRequirementsExtra(
        mockPaymentHeader,
        undefined,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "new",
        voucher: {
          id: mockVoucherId,
          escrow: mockEscrow,
        },
      });

      expect(paymentUtilsModule.decodePayment).toHaveBeenCalledWith(mockPaymentHeader);
      expect(mockGetAvailableVoucher).not.toHaveBeenCalled();
    });

    it("should return new voucher extra when payment header is valid but no previous voucher exists", async () => {
      vi.mocked(paymentUtilsModule.decodePayment).mockReturnValue({
        x402Version: 1,
        scheme: "deferred",
        network: "base-sepolia",
        payload: {
          signature: mockSignature,
          voucher: mockVoucher,
        },
      });

      mockGetAvailableVoucher.mockResolvedValue(null);

      const result = await getPaymentRequirementsExtra(
        mockPaymentHeader,
        undefined,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "new",
        voucher: {
          id: mockVoucherId,
          escrow: mockEscrow,
        },
      });

      expect(mockGetAvailableVoucher).toHaveBeenCalledWith(mockBuyer, mockSeller);
    });
  });

  describe("when both headers are provided", () => {
    it("should prioritize X-PAYMENT header over X-BUYER header", async () => {
      const differentBuyer: Address = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

      vi.mocked(paymentUtilsModule.decodePayment).mockReturnValue({
        x402Version: 1,
        scheme: "deferred",
        network: "base-sepolia",
        payload: {
          signature: mockSignature,
          voucher: {
            ...mockVoucher,
            buyer: differentBuyer,
          },
        },
      });

      const voucherResponse: DeferredEvmPayloadSignedVoucher = {
        ...mockVoucher,
        buyer: differentBuyer,
      };
      mockGetAvailableVoucher.mockResolvedValue(voucherResponse);

      const result = await getPaymentRequirementsExtra(
        "paymentHeader",
        mockBuyer, // This should be ignored
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      );

      expect(result).toEqual({
        type: "aggregation",
        signature: mockSignature,
        voucher: {
          ...mockVoucher,
          buyer: differentBuyer,
        },
      });

      // Should use buyer from payment header, not from X-BUYER header
      // getAddress normalizes the address to checksum format
      expect(mockGetAvailableVoucher).toHaveBeenCalledWith(getAddress(differentBuyer), mockSeller);
      expect(mockGetAvailableVoucher).not.toHaveBeenCalledWith(mockBuyer, mockSeller);
    });
  });

  describe("edge cases", () => {
    it("should handle getAvailableVoucher throwing an error", async () => {
      mockGetAvailableVoucher.mockRejectedValue(new Error("Database error"));

      await expect(
        getPaymentRequirementsExtra(
          undefined,
          mockBuyer,
          mockSeller,
          mockEscrow,
          mockGetAvailableVoucher,
        ),
      ).rejects.toThrow("Database error");
    });

    it("should handle decodePayment throwing an error", async () => {
      vi.mocked(paymentUtilsModule.decodePayment).mockImplementation(() => {
        throw new Error("Invalid base64");
      });

      await expect(
        getPaymentRequirementsExtra(
          "invalid-header",
          undefined,
          mockSeller,
          mockEscrow,
          mockGetAvailableVoucher,
        ),
      ).rejects.toThrow("Invalid base64");
    });

    it("should generate unique voucher IDs for each new voucher request", async () => {
      const voucherId1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const voucherId2 = "0x2222222222222222222222222222222222222222222222222222222222222222";

      vi.mocked(idModule.generateVoucherId)
        .mockReturnValueOnce(voucherId1)
        .mockReturnValueOnce(voucherId2);

      const result1 = (await getPaymentRequirementsExtra(
        undefined,
        undefined,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      )) as DeferredPaymentRequirements["extra"];

      const result2 = (await getPaymentRequirementsExtra(
        undefined,
        undefined,
        mockSeller,
        mockEscrow,
        mockGetAvailableVoucher,
      )) as DeferredPaymentRequirements["extra"];

      expect(result1.voucher.id).toBe(voucherId1);
      expect(result2.voucher.id).toBe(voucherId2);
      expect(result1.voucher.id).not.toBe(result2.voucher.id);
    });
  });
});
