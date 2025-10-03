import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigner } from "../../../types/shared/evm";
import { PaymentRequirements } from "../../../types/verify";
import {
  createPaymentHeader,
  preparePaymentHeader,
  signPaymentHeader,
  createNewVoucher,
} from "./client";
import {
  DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  DeferredPaymentPayloadSchema,
  DeferredPaymentRequirementsSchema,
  UnsignedDeferredPaymentPayload,
} from "../../../types/verify/schemes/deferred";
import { encodePayment } from "./utils/paymentUtils";

vi.mock("./utils/paymentUtils", () => ({
  encodePayment: vi.fn().mockReturnValue("encoded-payment-header"),
}));

const buyer = createSigner(
  "base-sepolia",
  "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
);
const buyerAddress = buyer.account.address;
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffFfFf12345678901234567890123456789fffFF";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";

describe("preparePaymentHeader: new voucher", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
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
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-05-20T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid unsigned payment header", async () => {
    const paymentHeader = await preparePaymentHeader(buyerAddress, 1, mockPaymentRequirements);

    const parsedPaymentRequirements =
      DeferredPaymentRequirementsSchema.parse(mockPaymentRequirements);

    expect(paymentHeader).toEqual({
      x402Version: 1,
      scheme: "deferred",
      network: "base-sepolia",
      payload: {
        signature: undefined,
        voucher: {
          id: voucherId,
          buyer: buyerAddress,
          seller: sellerAddress,
          valueAggregate: parsedPaymentRequirements.maxAmountRequired,
          asset: assetAddress,
          timestamp: expect.any(Number),
          nonce: 0,
          escrow: escrowAddress,
          chainId: 84532,
          expiry: expect.any(Number),
        },
      },
    });
  });

  it("should revert if paymentRequirement.extra required fields are missing", async () => {
    const requiredFields = ["id", "escrow"];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      delete badPaymentRequirements.extra!.voucher[field];
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should revert if paymentRequirement.extra required fields have invalid values", async () => {
    const requiredFields = ["id", "escrow"];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      badPaymentRequirements.extra!.voucher[field] = "0x";
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should handle different x402 versions", async () => {
    const result = await preparePaymentHeader(buyerAddress, 2, mockPaymentRequirements);
    expect(result.x402Version).toBe(2);
  });
});

describe("createNewVoucher", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
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
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-05-20T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid new voucher with correct properties", () => {
    const voucher = createNewVoucher(buyerAddress, mockPaymentRequirements);

    expect(voucher).toEqual({
      id: voucherId,
      buyer: buyerAddress,
      seller: sellerAddress,
      valueAggregate: "1000000",
      asset: assetAddress,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: 0,
      escrow: escrowAddress,
      chainId: 84532,
      expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
    });
  });

  it("should use buyer address as provided", () => {
    const differentBuyerAddress = "0x9876543210987654321098765432109876543210";
    const voucher = createNewVoucher(differentBuyerAddress, mockPaymentRequirements);

    expect(voucher.buyer).toBe(differentBuyerAddress);
  });

  it("should set nonce to 0 for new vouchers", () => {
    const voucher = createNewVoucher(buyerAddress, mockPaymentRequirements);

    expect(voucher.nonce).toBe(0);
  });

  it("should calculate expiry time correctly", () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const voucher = createNewVoucher(buyerAddress, mockPaymentRequirements);

    expect(voucher.expiry).toBe(currentTime + 60 * 60 * 24 * 30);
  });

  it("should throw if payment requirements are invalid", () => {
    const invalidRequirements = {
      ...mockPaymentRequirements,
      extra: {
        type: "new",
        // Missing voucher property
      },
    } as PaymentRequirements;

    expect(() => createNewVoucher(buyerAddress, invalidRequirements)).toThrow();
  });
});

describe("preparePaymentHeader: aggregated voucher", () => {
  const mockAggregatedPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: {
      type: "aggregation",
      signature:
        "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c",
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
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-05-20T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid unsigned payment header", async () => {
    const paymentHeader = await preparePaymentHeader(
      buyerAddress,
      1,
      mockAggregatedPaymentRequirements,
    );

    const parsedExtra = DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema.parse(
      mockAggregatedPaymentRequirements.extra,
    );

    expect(paymentHeader).toEqual({
      x402Version: 1,
      scheme: "deferred",
      network: "base-sepolia",
      payload: {
        signature: undefined,
        voucher: {
          id: voucherId,
          buyer: buyerAddress,
          seller: sellerAddress,
          valueAggregate: (
            BigInt(mockAggregatedPaymentRequirements.maxAmountRequired) +
            BigInt(parsedExtra.voucher.valueAggregate)
          ).toString(),
          asset: assetAddress,
          timestamp: expect.any(Number),
          nonce: 1,
          escrow: escrowAddress,
          chainId: 84532,
          expiry: expect.any(Number),
        },
      },
    });
  });

  it("should revert if voucher signature is invalid", async () => {
    // Inject incorrect signature into mockAggregatedPaymentRequirements
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    // @ts-expect-error - TODO: fix this
    paymentRequirements.extra!.signature =
      "0x79ce97f6d1242aa7b6f4826efb553ed453fd6c7132c665d95bc226d5f3027dd5456d61ed1bd8da5de6cea4d8154070ff458300b6b84e0c9010f434af77ad3d291c";

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Invalid voucher signature",
    );
  });

  it("should revert if paymentRequirement.extra required fields are missing", async () => {
    const requiredFields = [
      "id",
      "buyer",
      "seller",
      "valueAggregate",
      "asset",
      "timestamp",
      "nonce",
      "escrow",
      "chainId",
      "expiry",
    ];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      delete badPaymentRequirements.extra!.voucher[field];
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should revert if paymentRequirement.extra required fields have invalid values", async () => {
    const requiredFields = [
      "id",
      "buyer",
      "seller",
      "valueAggregate",
      "asset",
      "timestamp",
      "nonce",
      "escrow",
      "chainId",
      "expiry",
    ];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      badPaymentRequirements.extra!.voucher[field] = "0x";
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should handle different x402 versions", async () => {
    const result = await preparePaymentHeader(buyerAddress, 2, mockAggregatedPaymentRequirements);
    expect(result.x402Version).toBe(2);
  });

  it("should revert if voucher seller doesn't match payment requirements", async () => {
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    paymentRequirements.payTo = "0x9999999999999999999999999999999999999999";

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Invalid voucher seller",
    );
  });

  it("should revert if voucher asset doesn't match payment requirements", async () => {
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    paymentRequirements.asset = "0x2222222222222222222222222222222222222222";

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Invalid voucher asset",
    );
  });

  it("should revert if voucher chainId doesn't match payment requirements", async () => {
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    paymentRequirements.network = "base";

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Invalid voucher chainId",
    );
  });

  it("should revert if voucher is expired", async () => {
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    // Set voucher expiry to a past date
    // @ts-expect-error - TODO: fix this
    paymentRequirements.extra!.voucher.expiry = 1715769600 - 1; // 1 second before timestamp

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Voucher expired",
    );
  });

  it("should revert if voucher timestamp is in the future", async () => {
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    // Set voucher timestamp to future
    // @ts-expect-error - TODO: fix this
    paymentRequirements.extra!.voucher.timestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Voucher timestamp is in the future",
    );
  });
});

describe("signPaymentHeader", () => {
  const mockUnsignedHeader: UnsignedDeferredPaymentPayload = {
    x402Version: 1,
    scheme: "deferred",
    network: "base-sepolia",
    payload: {
      signature: undefined,
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
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };
  const mockVoucherSignature =
    "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

  it("should sign the payment header and return a complete payload", async () => {
    const signedPaymentPayload = await signPaymentHeader(buyer, mockUnsignedHeader);

    expect(signedPaymentPayload).toEqual({
      ...mockUnsignedHeader,
      payload: {
        ...mockUnsignedHeader.payload,
        signature: mockVoucherSignature,
      },
    });
  });

  it("should preserve all original fields in the signed payload", async () => {
    let signedPaymentPayload = await signPaymentHeader(buyer, mockUnsignedHeader);
    signedPaymentPayload = DeferredPaymentPayloadSchema.parse(signedPaymentPayload);

    // Check that all original fields are preserved
    expect(signedPaymentPayload.x402Version).toBe(mockUnsignedHeader.x402Version);
    expect(signedPaymentPayload.scheme).toBe(mockUnsignedHeader.scheme);
    expect(signedPaymentPayload.network).toBe(mockUnsignedHeader.network);
    expect(signedPaymentPayload.payload.voucher).toEqual(mockUnsignedHeader.payload.voucher);
  });

  it("should throw an error if signing fails", async () => {
    const badUnsignedHeader = {} as UnsignedDeferredPaymentPayload;
    await expect(signPaymentHeader(buyer, badUnsignedHeader)).rejects.toThrow();
  });
});

describe("createPaymentHeader", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: {
      type: "aggregation",
      signature:
        "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c",
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
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };

  const mockSignedPayment = {
    x402Version: 1,
    scheme: "deferred",
    network: "base-sepolia",
    payload: {
      signature:
        "0x583c4822217a0a8d9f079800a4abf48ea4f366438181cf24a53a95567e1430442d3c8974edbd0b9d3d9c0d1231c6bbf837848986a7157f7f6056e2f6d4d7433a1b",
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        valueAggregate: "2000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 1,
        escrow: escrowAddress,
        chainId: 84532,
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-05-20T00:00:00Z"));
    vi.clearAllMocks();
  });

  it("should create and encode a payment header", async () => {
    const result = await createPaymentHeader(buyer, 1, mockPaymentRequirements);
    expect(result).toBe("encoded-payment-header");
    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        scheme: "deferred",
        network: "base-sepolia",
        payload: expect.objectContaining({
          signature: expect.any(String),
          voucher: expect.objectContaining({
            id: mockSignedPayment.payload.voucher.id,
            buyer: mockSignedPayment.payload.voucher.buyer,
            seller: mockSignedPayment.payload.voucher.seller,
            valueAggregate: mockSignedPayment.payload.voucher.valueAggregate,
            asset: mockSignedPayment.payload.voucher.asset,
            timestamp: expect.any(Number),
            nonce: mockSignedPayment.payload.voucher.nonce,
            escrow: mockSignedPayment.payload.voucher.escrow,
            chainId: mockSignedPayment.payload.voucher.chainId,
            expiry: expect.any(Number),
          }),
        }),
      }),
    );
  });

  it("should throw an error if signing fails", async () => {
    await expect(createPaymentHeader(buyer, 1, {} as PaymentRequirements)).rejects.toThrow();
  });

  it("should throw an error if encoding fails", async () => {
    const error = new Error("Encoding failed");
    vi.mocked(encodePayment).mockImplementation(() => {
      throw error;
    });

    await expect(createPaymentHeader(buyer, 1, mockPaymentRequirements)).rejects.toThrow(
      "Encoding failed",
    );
  });
});
