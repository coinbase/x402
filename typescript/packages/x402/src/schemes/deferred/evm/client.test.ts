import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigner } from "../../../types/shared/evm";
import { PaymentRequirements } from "../../../types/verify";
import {
  createPaymentHeader,
  preparePaymentHeader,
  signPaymentHeader,
  createNewVoucher,
  createPaymentExtraPayload,
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

vi.mock("../../../verify/useDeferred", () => ({
  useDeferredFacilitator: vi.fn(),
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

  it("should include depositAuthorization in payload when provided in extraPayload", async () => {
    const mockDepositAuthorization = {
      permit: {
        owner: buyerAddress,
        spender: escrowAddress,
        value: "1000000",
        nonce: "0",
        deadline: 1715769600 + 1000 * 60 * 60 * 24 * 30,
        domain: {
          name: "USD Coin",
          version: "2",
        },
        signature:
          "0x1ed1158f8c70dc6393f8c9a379bf4569eb13a0ae6f060465418cbb9acbf5fb536eda5bdb7a6a28317329df0b9aec501fdf15f02f04b60ac536b90da3ce6f3efb1c",
      },
      depositAuthorization: {
        buyer: buyerAddress,
        seller: sellerAddress,
        asset: assetAddress,
        amount: "1000000",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
        signature:
          "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b",
      },
    };

    const paymentHeader = await preparePaymentHeader(
      buyerAddress,
      1,
      mockPaymentRequirements,
      mockDepositAuthorization,
    );

    expect(paymentHeader.payload.depositAuthorization).toEqual(mockDepositAuthorization);
    expect(paymentHeader.payload.depositAuthorization?.permit).toBeDefined();
  });

  it("should include depositAuthorization without permit when permit is not provided", async () => {
    const mockDepositAuthorizationNoPermit = {
      depositAuthorization: {
        buyer: buyerAddress,
        seller: sellerAddress,
        asset: assetAddress,
        amount: "1000000",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
        signature:
          "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b",
      },
    };

    const paymentHeader = await preparePaymentHeader(
      buyerAddress,
      1,
      mockPaymentRequirements,
      mockDepositAuthorizationNoPermit,
    );

    expect(paymentHeader.payload.depositAuthorization).toEqual(mockDepositAuthorizationNoPermit);
    expect(paymentHeader.payload.depositAuthorization?.permit).toBeUndefined();
  });

  it("should not include depositAuthorization when extraPayload is not provided", async () => {
    const paymentHeader = await preparePaymentHeader(buyerAddress, 1, mockPaymentRequirements);

    expect(paymentHeader.payload.depositAuthorization).toBeUndefined();
  });

  it("should throw error when depositAuthorization in extraPayload is invalid", async () => {
    const invalidDepositAuthorization = {
      permit: {
        owner: "invalid-address", // Invalid address format
        spender: escrowAddress,
      },
      depositAuthorization: {
        buyer: buyerAddress,
      },
    };

    await expect(
      preparePaymentHeader(buyerAddress, 1, mockPaymentRequirements, invalidDepositAuthorization),
    ).rejects.toThrow();
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

describe("createPaymentExtraPayload", () => {
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
      account: {
        balance: "500000", // Below threshold
        assetAllowance: "0",
        assetPermitNonce: "0",
        facilitator: "https://facilitator.example.com",
      },
    },
  };

  const mockDepositConfig = {
    asset: assetAddress,
    assetDomain: {
      name: "USD Coin",
      version: "2",
    },
    threshold: "10000",
    amount: "1000000",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-05-20T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return undefined when extra.account is undefined", async () => {
    const paymentReqs = {
      ...mockPaymentRequirements,
      extra: {
        type: "new",
        voucher: {
          id: voucherId,
          escrow: escrowAddress,
        },
      },
    } as PaymentRequirements;

    const result = await createPaymentExtraPayload(buyer, paymentReqs, [mockDepositConfig]);
    expect(result).toBeUndefined();
  });

  it("should return undefined when balance is sufficient", async () => {
    const paymentReqs = {
      ...mockPaymentRequirements,
      extra: {
        ...mockPaymentRequirements.extra,
        account: {
          balance: "10000000", // High balance
          assetAllowance: "1000000",
          assetPermitNonce: "0",
          facilitator: "https://facilitator.example.com",
        },
      },
    } as PaymentRequirements;

    const result = await createPaymentExtraPayload(buyer, paymentReqs, [mockDepositConfig]);
    expect(result).toBeUndefined();
  });

  it("should return undefined when facilitator check shows sufficient balance", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "10000000", // High balance from facilitator
      assetAllowance: "1000000",
      assetPermitNonce: "0",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(mockGetEscrowAccountDetails).toHaveBeenCalledWith(
      buyerAddress,
      sellerAddress,
      assetAddress,
      escrowAddress,
      84532,
    );
    expect(result).toBeUndefined();
  });

  it("should return undefined when facilitator returns error", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      error: "facilitator_error",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeUndefined();
  });

  it("should create deposit authorization with permit when allowance is insufficient", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "500000", // Low balance
      assetAllowance: "0", // No allowance
      assetPermitNonce: "5",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeDefined();
    expect(result?.permit).toBeDefined();
    expect(result?.permit?.owner).toBe(buyerAddress);
    expect(result?.permit?.spender).toBe(escrowAddress);
    expect(result?.permit?.value).toBe("1000000");
    expect(result?.permit?.nonce).toBe("5");
    expect(result?.permit?.deadline).toBe(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);
    expect(result?.permit?.domain).toEqual({
      name: "USD Coin",
      version: "2",
    });
    expect(result?.permit?.signature).toBeDefined();

    expect(result?.depositAuthorization).toBeDefined();
    expect(result?.depositAuthorization.buyer).toBe(buyerAddress);
    expect(result?.depositAuthorization.seller).toBe(sellerAddress);
    expect(result?.depositAuthorization.asset).toBe(assetAddress);
    expect(result?.depositAuthorization.amount).toBe("1000000");
    expect(result?.depositAuthorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result?.depositAuthorization.expiry).toBe(
      Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    );
    expect(result?.depositAuthorization.signature).toBeDefined();
  });

  it("should create deposit authorization without permit when allowance is sufficient", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "500000", // Low balance
      assetAllowance: "2000000", // Sufficient allowance
      assetPermitNonce: "5",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeDefined();
    expect(result?.permit).toBeUndefined(); // No permit needed
    expect(result?.depositAuthorization).toBeDefined();
    expect(result?.depositAuthorization.buyer).toBe(buyerAddress);
    expect(result?.depositAuthorization.seller).toBe(sellerAddress);
    expect(result?.depositAuthorization.asset).toBe(assetAddress);
    expect(result?.depositAuthorization.amount).toBe("1000000");
    expect(result?.depositAuthorization.signature).toBeDefined();
  });

  it("should use default USDC config when no matching deposit config is provided", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "500000",
      assetAllowance: "2000000",
      assetPermitNonce: "0",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const usdcPaymentReqs = {
      ...mockPaymentRequirements,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    } as PaymentRequirements;

    const result = await createPaymentExtraPayload(buyer, usdcPaymentReqs, []);

    expect(result).toBeDefined();
    expect(result?.depositAuthorization.amount).toBe("1000000"); // Default 1 USDC
  });

  it("should handle balance exactly at threshold plus maxAmountRequired", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "1010000", // Exactly threshold (10000) + maxAmountRequired (1000000)
      assetAllowance: "2000000",
      assetPermitNonce: "0",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeUndefined(); // Should not need deposit
  });

  it("should create deposit when balance is one unit below threshold plus maxAmountRequired", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "1009999", // One below threshold (10000) + maxAmountRequired (1000000)
      assetAllowance: "2000000",
      assetPermitNonce: "0",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeDefined();
    expect(result?.depositAuthorization).toBeDefined();
  });

  it("should use custom deposit config when provided", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "500000",
      assetAllowance: "0",
      assetPermitNonce: "10",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const customDepositConfig = {
      asset: assetAddress,
      assetDomain: {
        name: "Custom Token",
        version: "1",
      },
      threshold: "50000",
      amount: "5000000",
    };

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      customDepositConfig,
    ]);

    expect(result).toBeDefined();
    expect(result?.depositAuthorization.amount).toBe("5000000");
    expect(result?.permit?.value).toBe("5000000");
    expect(result?.permit?.domain).toEqual({
      name: "Custom Token",
      version: "1",
    });
  });

  it("should handle allowance exactly at deposit amount", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "500000",
      assetAllowance: "1000000", // Exactly the deposit amount
      assetPermitNonce: "0",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeDefined();
    expect(result?.permit).toBeUndefined(); // Allowance is sufficient
  });

  it("should create permit when allowance is one unit below deposit amount", async () => {
    const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
    const mockGetEscrowAccountDetails = vi.fn().mockResolvedValue({
      balance: "500000",
      assetAllowance: "999999", // One below deposit amount
      assetPermitNonce: "0",
    });

    vi.mocked(useDeferredFacilitator).mockReturnValue({
      getBuyerData: mockGetEscrowAccountDetails,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createPaymentExtraPayload(buyer, mockPaymentRequirements, [
      mockDepositConfig,
    ]);

    expect(result).toBeDefined();
    expect(result?.permit).toBeDefined(); // Permit needed
  });
});
