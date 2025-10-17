import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeferredEscrowFlushAuthorizationSigned, PaymentRequirements } from "../../../types";
import {
  DeferredPaymentPayload,
  DeferredPaymentRequirements,
  DeferredEvmPayloadSignedVoucher,
  DEFERRRED_SCHEME,
} from "../../../types/verify/schemes/deferred";
import {
  verifyPaymentRequirements,
  verifyVoucherSignatureWrapper,
  verifyVoucherOnchainState,
  verifyVoucherContinuity,
  verifyVoucherAvailability,
  verifyVoucherDuplicate,
  verifyDepositAuthorizationSignatureAndContinuity,
  verifyDepositAuthorizationOnchainState,
  verifyFlushAuthorization,
} from "./verify";
import { createSigner } from "../../../types/shared/evm/wallet";
import { getNetworkId } from "../../../shared";
import { VoucherStore } from "./store";
import { getAddress } from "viem";
import { signVoucher } from "./sign";

vi.mock("../../../shared", async (original: () => Promise<Record<string, unknown>>) => {
  const actual = await original();
  return {
    ...(actual as Record<string, unknown>),
    getNetworkId: vi.fn(),
  };
});

const buyer = createSigner(
  "base-sepolia",
  "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
);
const buyerAddress = "0x05159b6100E8c7A3BbaE174A94c32E1E2e37059b";
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffFfFf12345678901234567890123456789fffFF";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";
const voucherSignature =
  "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

describe("verifyPaymentRequirements", () => {
  const mockVoucher = {
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
  };

  const mockPaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature,
      voucher: mockVoucher,
    },
  };

  const mockPaymentRequirements: PaymentRequirements = {
    scheme: DEFERRRED_SCHEME,
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
    vi.clearAllMocks();
    vi.mocked(getNetworkId).mockReturnValue(84532);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return isValid: true for valid payment requirements with new voucher", () => {
    const result = verifyPaymentRequirements(mockPaymentPayload, mockPaymentRequirements);
    expect(result).toEqual({ isValid: true });
  });

  it("should return isValid: true for valid payment requirements with aggregation voucher", () => {
    const aggregationRequirements: PaymentRequirements = {
      ...mockPaymentRequirements,
      maxAmountRequired: "500000",
      extra: {
        type: "aggregation",
        signature: voucherSignature,
        voucher: {
          ...mockVoucher,
          valueAggregate: "500000",
        },
      },
    };
    const result = verifyPaymentRequirements(mockPaymentPayload, aggregationRequirements);
    expect(result).toEqual({ isValid: true });
  });

  it("should return error if payload scheme is not deferred", () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      scheme: "immediate",
    } as unknown as DeferredPaymentPayload;
    const result = verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_scheme",
    });
  });

  it("should return error if requirements scheme is not deferred", () => {
    const invalidRequirements = {
      ...mockPaymentRequirements,
      scheme: "immediate",
    } as unknown as PaymentRequirements;
    const result = verifyPaymentRequirements(
      mockPaymentPayload,
      invalidRequirements as DeferredPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_requirements_scheme",
    });
  });

  it("should return error if payment payload network does not match payment requirements network", () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      network: "base",
    } as DeferredPaymentPayload;
    const result = verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_network_mismatch",
      payer: buyerAddress,
    });
  });

  it("should return error if network is not supported", () => {
    vi.mocked(getNetworkId).mockImplementation(() => {
      throw new Error("Unsupported network");
    });
    const result = verifyPaymentRequirements(mockPaymentPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_network_unsupported",
      payer: buyerAddress,
    });
    vi.resetAllMocks();
  });

  it("should return error if network is invalid", () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      network: "iotex",
      payload: {
        ...mockPaymentPayload.payload,
      },
    } as DeferredPaymentPayload;
    const result = verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_network_mismatch",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher value is insufficient for new voucher", () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          valueAggregate: "999999",
        },
      },
    };
    const result = verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher value is insufficient for aggregation voucher", () => {
    const aggregationRequirements: PaymentRequirements = {
      ...mockPaymentRequirements,
      extra: {
        type: "aggregation",
        signature: voucherSignature,
        voucher: {
          ...mockVoucher,
          valueAggregate: "500000",
        },
      },
    };
    const result = verifyPaymentRequirements(mockPaymentPayload, aggregationRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: buyerAddress,
    });
  });

  it("should return error if payTo does not match voucher seller", () => {
    const invalidRequirements = {
      ...mockPaymentRequirements,
      payTo: "0x9999999999999999999999999999999999999999",
    };
    const result = verifyPaymentRequirements(mockPaymentPayload, invalidRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: buyerAddress,
    });
  });

  it("should return error if asset mismatch", () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          asset: "0x2222222222222222222222222222222222222222",
        },
      },
    };
    const result = verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: buyerAddress,
    });
  });
});

describe("verifyVoucherContinuity", () => {
  const baseVoucher = {
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
  };

  const basePaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature,
      voucher: baseVoucher,
    },
  };

  const aggregatedVoucher = {
    id: voucherId,
    buyer: buyerAddress,
    seller: sellerAddress,
    valueAggregate: "12000000",
    asset: assetAddress,
    timestamp: 1715769600 + 100,
    nonce: 1,
    escrow: escrowAddress,
    chainId: 84532,
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 60, // 60 days
  };

  const aggregatedPaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature, // does not matter
      voucher: aggregatedVoucher,
    },
  };

  const baseNewVoucherPaymentRequirements: PaymentRequirements = {
    scheme: DEFERRRED_SCHEME,
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

  const baseAggregationVoucherPaymentRequirements: PaymentRequirements = {
    scheme: DEFERRRED_SCHEME,
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
      signature: voucherSignature,
      voucher: baseVoucher,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock current time to be within valid range
    vi.useFakeTimers();
    vi.setSystemTime(new Date((baseVoucher.timestamp + 100) * 1000)); // 100 seconds after voucher timestamp
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("should return valid if new voucher is valid", () => {
    const result = verifyVoucherContinuity(basePaymentPayload, baseNewVoucherPaymentRequirements);
    expect(result).toEqual({
      isValid: true,
    });
  });

  it("should return valid if aggregation voucher is valid", () => {
    const result = verifyVoucherContinuity(
      aggregatedPaymentPayload,
      baseAggregationVoucherPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: true,
    });
  });

  it("should return error if voucher is expired", () => {
    const expiredPaymentPayload = {
      ...basePaymentPayload,
      payload: {
        ...basePaymentPayload.payload,
        voucher: {
          ...baseVoucher,
          expiry: baseVoucher.timestamp - 1000,
        },
      },
    };

    const result = verifyVoucherContinuity(
      expiredPaymentPayload,
      baseNewVoucherPaymentRequirements,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher timestamp is in the future", () => {
    const paymentPayload = {
      ...basePaymentPayload,
      payload: {
        ...basePaymentPayload.payload,
        voucher: {
          ...baseVoucher,
          timestamp: baseVoucher.timestamp + 3600,
        },
      },
    };

    const result = verifyVoucherContinuity(paymentPayload, baseNewVoucherPaymentRequirements);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_timestamp_too_early",
      payer: buyerAddress,
    });
  });

  describe("new voucher validation", () => {
    it("should return error if new voucher has non-zero nonce", () => {
      const paymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          voucher: {
            ...baseVoucher,
            nonce: 1,
          },
        },
      };
      const result = verifyVoucherContinuity(paymentPayload, baseNewVoucherPaymentRequirements);

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_non_zero_nonce",
        payer: buyerAddress,
      });
    });

    it("should return error if new voucher has zero value aggregate", () => {
      const paymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          voucher: { ...baseVoucher, valueAggregate: "0" },
        },
      };
      const result = verifyVoucherContinuity(paymentPayload, baseNewVoucherPaymentRequirements);

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_zero_value_aggregate",
        payer: buyerAddress,
      });
    });
  });

  describe("aggregation voucher validation", () => {
    it("should return error if voucher id doesn't match", () => {
      const mismatchedIdVoucher = {
        ...aggregatedVoucher,
        id: "0x1111111111111111111111111111111111111111111111111111111111111111",
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: mismatchedIdVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_id_mismatch",
        payer: buyerAddress,
      });
    });

    it("should return error if buyer doesn't match", () => {
      const mismatchedBuyerVoucher = {
        ...aggregatedVoucher,
        buyer: "0x9999999999999999999999999999999999999999",
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: mismatchedBuyerVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_buyer_mismatch",
        payer: "0x9999999999999999999999999999999999999999",
      });
    });

    it("should return error if seller doesn't match", () => {
      const mismatchedSellerVoucher = {
        ...aggregatedVoucher,
        seller: "0x9999999999999999999999999999999999999999",
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: mismatchedSellerVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_seller_mismatch",
        payer: buyerAddress,
      });
    });

    it("should return error if value aggregate decreases", () => {
      const decreasingValueVoucher = {
        ...aggregatedVoucher,
        valueAggregate: (BigInt(baseVoucher.valueAggregate) - BigInt(1)).toString(),
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: decreasingValueVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value_aggregate_decreasing",
        payer: buyerAddress,
      });
    });

    it("should return error if asset doesn't match", () => {
      const mismatchedAssetVoucher = {
        ...aggregatedVoucher,
        asset: "0x9999999999999999999999999999999999999999",
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: mismatchedAssetVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_asset_mismatch",
        payer: buyerAddress,
      });
    });

    it("should return error if timestamp decreases", () => {
      const decreasingTimestampVoucher = {
        ...aggregatedVoucher,
        timestamp: baseVoucher.timestamp - 100, // Earlier than previous
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: decreasingTimestampVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_timestamp_decreasing",
        payer: buyerAddress,
      });
    });

    it("should return error if nonce is not incremented by 1", () => {
      const wrongNonceVoucher = {
        ...aggregatedVoucher,
        nonce: 2, // Should be 1
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: wrongNonceVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_nonce_mismatch",
        payer: buyerAddress,
      });
    });

    it("should return error if escrow doesn't match", () => {
      const mismatchedEscrowVoucher = {
        ...aggregatedVoucher,
        escrow: "0x9999999999999999999999999999999999999999",
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: mismatchedEscrowVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_escrow_mismatch",
        payer: buyerAddress,
      });
    });

    it("should return error if chainId doesn't match", () => {
      const mismatchedChainIdVoucher = {
        ...aggregatedVoucher,
        chainId: 1, // Different chain
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: mismatchedChainIdVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_chain_id_mismatch",
        payer: buyerAddress,
      });
    });

    it("should return error if expiry decreases", () => {
      const decreasingExpiryVoucher = {
        ...aggregatedVoucher,
        expiry: baseVoucher.expiry - 1, // Earlier expiry
      };

      const paymentPayload = {
        ...aggregatedPaymentPayload,
        payload: {
          ...aggregatedPaymentPayload.payload,
          voucher: decreasingExpiryVoucher,
        },
      };

      const result = verifyVoucherContinuity(
        paymentPayload,
        baseAggregationVoucherPaymentRequirements,
      );

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_expiry_decreasing",
        payer: buyerAddress,
      });
    });
  });
});

describe("verifyVoucherSignature", async () => {
  const mockPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
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
  const { signature } = await signVoucher(buyer, mockPaymentPayload.payload.voucher);

  it("should return isValid: true for valid voucher signature", async () => {
    const result = await verifyVoucherSignatureWrapper(
      mockPaymentPayload.payload.voucher,
      signature,
    );
    expect(result).toEqual({ isValid: true });
  });

  it("should return isValid: false for invalid voucher signature", async () => {
    const result = await verifyVoucherSignatureWrapper(
      mockPaymentPayload.payload.voucher,
      "0x999b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c",
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: buyerAddress,
    });
  });
});

describe("verifyVoucherAvailability", () => {
  const mockVoucher = {
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
  };

  const mockSignedVoucher: DeferredEvmPayloadSignedVoucher = {
    ...mockVoucher,
    signature: voucherSignature,
  };

  let mockVoucherStore: VoucherStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVoucherStore = {
      getVoucher: vi.fn(),
    } as unknown as VoucherStore;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return valid response when previous voucher is found and matches", async () => {
    vi.mocked(mockVoucherStore.getVoucher).mockResolvedValue(mockSignedVoucher);

    const result = await verifyVoucherAvailability(
      mockVoucher,
      voucherSignature,
      mockVoucher.id,
      mockVoucher.nonce,
      mockVoucherStore,
    );

    expect(result).toEqual({
      isValid: true,
    });

    expect(mockVoucherStore.getVoucher).toHaveBeenCalledWith(voucherId, 0);
  });

  it("should return error when previous voucher is not found in store", async () => {
    vi.mocked(mockVoucherStore.getVoucher).mockResolvedValue(null);

    const result = await verifyVoucherAvailability(
      mockVoucher,
      voucherSignature,
      mockVoucher.id,
      mockVoucher.nonce,
      mockVoucherStore,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_found",
      payer: buyerAddress,
    });
  });

  it("should return error when previous voucher is found but doesn't match", async () => {
    const mismatchedVoucher: DeferredEvmPayloadSignedVoucher = {
      ...mockSignedVoucher,
      valueAggregate: "500000", // Different value
    };

    vi.mocked(mockVoucherStore.getVoucher).mockResolvedValue(mismatchedVoucher);

    const result = await verifyVoucherAvailability(
      mockVoucher,
      voucherSignature,
      mockVoucher.id,
      mockVoucher.nonce,
      mockVoucherStore,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_found_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should handle voucher store errors", async () => {
    vi.mocked(mockVoucherStore.getVoucher).mockRejectedValue(new Error("Store error"));

    await expect(
      verifyVoucherAvailability(
        mockVoucher,
        voucherSignature,
        mockVoucher.id,
        mockVoucher.nonce,
        mockVoucherStore,
      ),
    ).rejects.toThrow("Store error");
  });
});

describe("verifyVoucherDuplicate", () => {
  const baseVoucher: DeferredEvmPayloadSignedVoucher = {
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

  it("should return valid response for identical vouchers", () => {
    const identicalVoucher = { ...baseVoucher };

    const result = verifyVoucherDuplicate(baseVoucher, identicalVoucher);

    expect(result).toEqual({
      isValid: true,
    });
  });

  it("should return error if voucher IDs don't match", () => {
    const differentIdVoucher = {
      ...baseVoucher,
      id: "0x1111111111111111111111111111111111111111111111111111111111111111",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentIdVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if buyer addresses don't match", () => {
    const differentBuyerVoucher = {
      ...baseVoucher,
      buyer: "0x9999999999999999999999999999999999999999",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentBuyerVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if seller addresses don't match", () => {
    const differentSellerVoucher = {
      ...baseVoucher,
      seller: "0x9999999999999999999999999999999999999999",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentSellerVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if value aggregates don't match", () => {
    const differentValueVoucher = {
      ...baseVoucher,
      valueAggregate: "2000000",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentValueVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if assets don't match", () => {
    const differentAssetVoucher = {
      ...baseVoucher,
      asset: "0x2222222222222222222222222222222222222222",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentAssetVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if timestamps don't match", () => {
    const differentTimestampVoucher = {
      ...baseVoucher,
      timestamp: 1715769700,
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentTimestampVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if nonces don't match", () => {
    const differentNonceVoucher = {
      ...baseVoucher,
      nonce: 1,
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentNonceVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if escrow addresses don't match", () => {
    const differentEscrowVoucher = {
      ...baseVoucher,
      escrow: "0x9999999999999999999999999999999999999999",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentEscrowVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if chain IDs don't match", () => {
    const differentChainIdVoucher = {
      ...baseVoucher,
      chainId: 1,
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentChainIdVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if expiry times don't match", () => {
    const differentExpiryVoucher = {
      ...baseVoucher,
      expiry: baseVoucher.expiry + 3600,
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentExpiryVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should return error if signatures don't match", () => {
    const differentSignatureVoucher = {
      ...baseVoucher,
      signature:
        "0x79ce97f6d1242aa7b6f4826efb553ed453fd6c7132c665d95bc226d5f3027dd5456d61ed1bd8da5de6cea4d8154070ff458300b6b84e0c9010f434af77ad3d291c",
    };

    const result = verifyVoucherDuplicate(baseVoucher, differentSignatureVoucher);

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
      payer: buyerAddress,
    });
  });

  it("should handle case-insensitive ID and signature comparison", () => {
    const upperCaseIdVoucher = {
      ...baseVoucher,
      id: voucherId.toUpperCase(),
      signature: voucherSignature.toUpperCase(),
    };

    const resultUpperCase = verifyVoucherDuplicate(baseVoucher, upperCaseIdVoucher);

    expect(resultUpperCase).toEqual({
      isValid: true,
    });

    const lowerCaseIdVoucher = {
      ...baseVoucher,
      id: voucherId.toLowerCase(),
      signature: voucherSignature.toLowerCase(),
    };

    const resultLowerCase = verifyVoucherDuplicate(baseVoucher, lowerCaseIdVoucher);

    expect(resultLowerCase).toEqual({
      isValid: true,
    });
  });

  it("should handle lower case address comparison", () => {
    const mixedCaseVoucher = {
      ...baseVoucher,
      buyer: buyerAddress.toLowerCase(),
      seller: sellerAddress.toLowerCase(),
      asset: assetAddress.toLowerCase(),
      escrow: escrowAddress.toLowerCase(),
    };

    const result = verifyVoucherDuplicate(baseVoucher, mixedCaseVoucher);

    expect(result).toEqual({
      isValid: true,
    });
  });

  it("should handle checksummed address comparison", () => {
    const mixedCaseVoucher = {
      ...baseVoucher,
      escrow: getAddress(escrowAddress),
      asset: getAddress(assetAddress),
      buyer: getAddress(buyerAddress),
      seller: getAddress(sellerAddress),
    };

    const result = verifyVoucherDuplicate(baseVoucher, mixedCaseVoucher);

    expect(result).toEqual({
      isValid: true,
    });
  });
});

describe("verifyVoucherOnchainState", () => {
  const mockVoucher = {
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
  };

  it("should return valid if voucher is valid", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(1_000_000),
      availableBalance: BigInt(10_000_000),
      allowance: BigInt(1_000_000),
      nonce: BigInt(0),
      isDepositNonceUsed: false,
    };
    const result = verifyVoucherOnchainState(mockVoucher, undefined, onchainData);
    expect(result).toEqual({ isValid: true });
  });

  it("should return valid if voucher is valid with deposit authorization", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(500_000),
      availableBalance: BigInt(400_000), // Not enough without deposit auth
      allowance: BigInt(1_000_000),
      nonce: BigInt(0),
      isDepositNonceUsed: false,
    };
    const depositAuthorization = {
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
          "0x1ed1158f8c70dc6393f8c9a379bf4569eb13a0ae6f060465418cbb9acbf5fb536eda5bdb7a6a28317329df0b9aec501fdf15f02f04b60ac536b90da3ce6f3efb1c" as `0x${string}`,
      },
      depositAuthorization: {
        buyer: buyerAddress,
        seller: sellerAddress,
        asset: assetAddress,
        amount: "600000", // Enough to cover the outstanding
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
        signature:
          "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
      },
    };
    const result = verifyVoucherOnchainState(mockVoucher, depositAuthorization, onchainData);
    expect(result).toEqual({ isValid: true });
  });

  it("should return error if insufficient balance", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(100_000),
      availableBalance: BigInt(100_000),
      allowance: BigInt(1_000_000),
      nonce: BigInt(0),
      isDepositNonceUsed: false,
    };
    const result = verifyVoucherOnchainState(mockVoucher, undefined, onchainData);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: buyerAddress,
    });
  });
});

describe("verifyDepositAuthorizationSignatureAndContinuity", () => {
  const mockVoucher = {
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
  };

  const mockDepositAuthorizationWithPermit = {
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
        "0x1ed1158f8c70dc6393f8c9a379bf4569eb13a0ae6f060465418cbb9acbf5fb536eda5bdb7a6a28317329df0b9aec501fdf15f02f04b60ac536b90da3ce6f3efb1c" as `0x${string}`,
    },
    depositAuthorization: {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      amount: "1000000",
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    },
  };

  const mockDepositAuthorizationWithoutPermit = {
    depositAuthorization: {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      amount: "1000000",
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockVoucher.timestamp * 1000 + 100000)); // 100 seconds after voucher timestamp
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("should return valid if deposit authorization is valid with permit", async () => {
    const result = await verifyDepositAuthorizationSignatureAndContinuity(
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );
    expect(result).toEqual({ isValid: true });
  });

  it("should return valid if deposit authorization is valid without permit", async () => {
    const result = await verifyDepositAuthorizationSignatureAndContinuity(
      mockVoucher,
      mockDepositAuthorizationWithoutPermit,
    );
    expect(result).toEqual({ isValid: true });
  });

  it("should return error if permit signature is invalid", async () => {
    const invalidPermit = {
      ...mockDepositAuthorizationWithPermit,
      permit: {
        ...mockDepositAuthorizationWithPermit.permit!,
        signature:
          "0x999b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c" as `0x${string}`,
      },
    };

    const result = await verifyDepositAuthorizationSignatureAndContinuity(
      mockVoucher,
      invalidPermit,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_permit_signature",
      payer: buyerAddress,
    });
  });

  it("should return error if deposit authorization signature is invalid", async () => {
    const invalidDepositAuth = {
      ...mockDepositAuthorizationWithPermit,
      depositAuthorization: {
        ...mockDepositAuthorizationWithPermit.depositAuthorization,
        signature:
          "0x999b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c" as `0x${string}`,
      },
    };

    const result = await verifyDepositAuthorizationSignatureAndContinuity(
      mockVoucher,
      invalidDepositAuth,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_signature",
      payer: buyerAddress,
    });
  });
});

describe("verifyDepositAuthorizationOnchainState", () => {
  const mockVoucher = {
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
  };

  const mockDepositAuthorizationWithPermit = {
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
        "0x1ed1158f8c70dc6393f8c9a379bf4569eb13a0ae6f060465418cbb9acbf5fb536eda5bdb7a6a28317329df0b9aec501fdf15f02f04b60ac536b90da3ce6f3efb1c" as `0x${string}`,
    },
    depositAuthorization: {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      amount: "1000000",
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    },
  };

  const mockDepositAuthorizationWithoutPermit = {
    depositAuthorization: {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      amount: "1000000",
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    },
  };

  it("should return valid if deposit authorization is valid with permit", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(1_000_000),
      availableBalance: BigInt(1_000_000),
      allowance: BigInt(500_000),
      nonce: BigInt(0), // Matches permit nonce
      isDepositNonceUsed: false,
    };

    const result = verifyDepositAuthorizationOnchainState(
      mockVoucher,
      mockDepositAuthorizationWithPermit,
      onchainData,
    );
    expect(result).toEqual({ isValid: true });
  });

  it("should return valid if deposit authorization is valid without permit", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(1_000_000),
      availableBalance: BigInt(1_000_000),
      allowance: BigInt(2_000_000), // Sufficient allowance
      nonce: BigInt(0),
      isDepositNonceUsed: false,
    };

    const result = verifyDepositAuthorizationOnchainState(
      mockVoucher,
      mockDepositAuthorizationWithoutPermit,
      onchainData,
    );
    expect(result).toEqual({ isValid: true });
  });

  it("should return error if allowance is insufficient when no permit", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(1_000_000),
      availableBalance: BigInt(1_000_000),
      allowance: BigInt(500_000), // Insufficient allowance
      nonce: BigInt(0),
      isDepositNonceUsed: false,
    };

    const result = verifyDepositAuthorizationOnchainState(
      mockVoucher,
      mockDepositAuthorizationWithoutPermit,
      onchainData,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_insufficient_allowance",
      payer: buyerAddress,
    });
  });

  it("should return error if permit nonce is invalid", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(1_000_000),
      availableBalance: BigInt(1_000_000),
      allowance: BigInt(500_000),
      nonce: BigInt(5), // Different nonce
      isDepositNonceUsed: false,
    };

    const result = verifyDepositAuthorizationOnchainState(
      mockVoucher,
      mockDepositAuthorizationWithPermit,
      onchainData,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_permit_nonce_invalid",
      payer: buyerAddress,
    });
  });

  it("should return error if deposit authorization nonce is already used", () => {
    const onchainData = {
      voucherOutstanding: BigInt(1_000_000),
      voucherCollectable: BigInt(1_000_000),
      availableBalance: BigInt(1_000_000),
      allowance: BigInt(500_000),
      nonce: BigInt(0), // permit nonce ok
      isDepositNonceUsed: true, // deposit authorization nonce already used
    };

    const result = verifyDepositAuthorizationOnchainState(
      mockVoucher,
      mockDepositAuthorizationWithPermit,
      onchainData,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_nonce_invalid",
      payer: buyerAddress,
    });
  });
});

describe("verifyFlushAuthorization", () => {
  let mockFlushAuthorization: DeferredEscrowFlushAuthorizationSigned;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1715769600 * 1000 + 100000)); // 100 seconds after timestamp

    // Import signFlushAuthorization to generate a valid signature
    const { signFlushAuthorization } = await import("./sign");
    const buyer = createSigner(
      "base-sepolia",
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );

    const flushAuthBase = {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
    };

    const { signature } = await signFlushAuthorization(
      buyer,
      flushAuthBase,
      84532,
      escrowAddress as `0x${string}`,
    );

    mockFlushAuthorization = {
      ...flushAuthBase,
      signature,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("should return valid if flush authorization is valid", async () => {
    const result = await verifyFlushAuthorization(
      mockFlushAuthorization,
      escrowAddress as `0x${string}`,
      84532,
    );
    expect(result).toEqual({ isValid: true });
  });

  it("should return error if flush authorization signature is invalid", async () => {
    const invalidFlushAuth = {
      ...mockFlushAuthorization,
      signature: "0xinvalidsignature" as `0x${string}`,
    };

    const result = await verifyFlushAuthorization(
      invalidFlushAuth,
      escrowAddress as `0x${string}`,
      84532,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_flush_authorization_signature",
      payer: buyerAddress,
    });
  });

  it("should return error if flush authorization is expired", async () => {
    const { signFlushAuthorization } = await import("./sign");
    const buyer = createSigner(
      "base-sepolia",
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );

    const expiredFlushAuthBase = {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 - 1000, // expired
    };

    const { signature } = await signFlushAuthorization(
      buyer,
      expiredFlushAuthBase,
      84532,
      escrowAddress as `0x${string}`,
    );

    const expiredFlushAuth = {
      ...expiredFlushAuthBase,
      signature,
    };

    const result = await verifyFlushAuthorization(
      expiredFlushAuth,
      escrowAddress as `0x${string}`,
      84532,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_flush_authorization_continuity",
      payer: buyerAddress,
    });
  });
});
