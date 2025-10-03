import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chain, Log, Transport } from "viem";
import { createSigner, ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import { PaymentRequirements, SchemeContext } from "../../../types/verify";
import { DeferredPaymentPayload, DEFERRRED_SCHEME } from "../../../types/verify/schemes/deferred";
import { verify, settle, settleVoucher } from "./facilitator";
import { VoucherStore } from "./store";
import * as verifyModule from "./verify";

// Mock the verify module
vi.mock("./verify", () => ({
  verifyPaymentRequirements: vi.fn(),
  verifyVoucherContinuity: vi.fn(),
  verifyVoucherSignature: vi.fn(),
  verifyVoucherAvailability: vi.fn(),
  verifyOnchainState: vi.fn(),
}));

const buyer = createSigner(
  "base-sepolia",
  "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
);
const buyerAddress = buyer.account.address;
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffffff12345678901234567890123456789fffff";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";
const voucherSignature =
  "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

/**
 * Mock VoucherStore class for testing
 */
class MockVoucherStore extends VoucherStore {
  getVoucher = vi.fn();
  getVoucherSeries = vi.fn();
  getVouchers = vi.fn();
  getAvailableVoucher = vi.fn();
  settleVoucher = vi.fn();
  storeVoucher = vi.fn();
  getVoucherCollections = vi.fn();
}

const mockVoucherStore = new MockVoucherStore();

describe("facilitator - verify", () => {
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

  let mockClient: ConnectedClient<Transport, Chain>;
  let mockSchemeContext: SchemeContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      chain: { id: 84532 },
      readContract: vi.fn(),
      writeContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    } as unknown as ConnectedClient<Transport, Chain>;

    mockSchemeContext = {
      deferred: {
        voucherStore: mockVoucherStore,
      },
    };

    // Mock all verification functions to return success by default
    vi.mocked(verifyModule.verifyPaymentRequirements).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherContinuity).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherSignature).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyOnchainState).mockResolvedValue({ isValid: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return valid response when all verifications pass", async () => {
    const result = await verify(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      isValid: true,
      invalidReason: undefined,
      payer: buyerAddress,
    });
  });

  it("should return invalid response when payment requirements verification fails", async () => {
    vi.mocked(verifyModule.verifyPaymentRequirements).mockReturnValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_scheme",
    });

    const result = await verify(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_scheme",
    });
  });

  it("should return invalid response when voucher continuity verification fails", async () => {
    vi.mocked(verifyModule.verifyVoucherContinuity).mockReturnValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: buyerAddress,
    });

    const result = await verify(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: buyerAddress,
    });
  });

  it("should return invalid response when voucher signature verification fails", async () => {
    vi.mocked(verifyModule.verifyVoucherSignature).mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: buyerAddress,
    });

    const result = await verify(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: buyerAddress,
    });
  });

  it("should verify previous voucher availability for aggregation type", async () => {
    const aggregationRequirements: PaymentRequirements = {
      ...mockPaymentRequirements,
      extra: {
        type: "aggregation",
        signature: voucherSignature,
        voucher: mockVoucher,
      },
    };

    await verify(mockClient, mockPaymentPayload, aggregationRequirements, mockSchemeContext);

    expect(verifyModule.verifyVoucherAvailability).toHaveBeenCalledWith(
      mockVoucher,
      voucherSignature,
      mockVoucher.id,
      mockVoucher.nonce, // mockVoucher is the previous voucher
      mockVoucherStore,
    );
  });

  it("should skip previous voucher verification for new voucher type", async () => {
    await verify(mockClient, mockPaymentPayload, mockPaymentRequirements, mockSchemeContext);

    expect(verifyModule.verifyVoucherAvailability).not.toHaveBeenCalled();
  });

  it("should return invalid response when onchain state verification fails", async () => {
    vi.mocked(verifyModule.verifyOnchainState).mockResolvedValue({
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: buyerAddress,
    });

    const result = await verify(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: buyerAddress,
    });
  });
});

describe("facilitator - settle", () => {
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

  let mockSchemeContext: SchemeContext;
  let mockWallet: SignerWallet<Chain, Transport>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSchemeContext = {
      deferred: {
        voucherStore: mockVoucherStore,
      },
    };

    // Mock successful verification by default
    vi.mocked(verifyModule.verifyPaymentRequirements).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherContinuity).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherSignature).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyOnchainState).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({ isValid: true });

    // Mock successful voucher store settlement
    vi.mocked(mockVoucherStore.settleVoucher).mockResolvedValue({ success: true });
    vi.mocked(mockVoucherStore.getVoucher).mockResolvedValue(mockVoucher);

    // Create a proper mock wallet with all required properties
    mockWallet = {
      account: {
        address: buyerAddress,
      },
      chain: { id: 84532 },
      readContract: vi.fn(),
      writeContract: vi.fn().mockResolvedValue("0x1234567890abcdef"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        logs: [
          {
            data: "0x000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e0000000000000000000000000000000000000000000000000000000000000050",
            topics: [
              "0xfe7c1ad1ce8265245e3420fdcd8d27904701eb6c1d348c3e1704aebfaa8a50e0",
              "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
              "0x00000000000000000000000080cdf1957ebb7a2df22dd8913753a4423ff4272e",
              "0x000000000000000000000000c93d37ad45c907ee1b27a02b2e1bd823ba9d379c",
            ],
          } as unknown as Log<bigint, number, false>,
        ],
      }),
    } as unknown as SignerWallet<Chain, Transport>;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should settle voucher successfully when all verifications pass", async () => {
    const result = await settle(
      mockWallet,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      success: true,
      network: "base-sepolia",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });
  });

  it("should return error when re-verification fails", async () => {
    vi.mocked(verifyModule.verifyPaymentRequirements).mockReturnValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_scheme",
    });

    const result = await settle(
      buyer,
      mockPaymentPayload,
      mockPaymentRequirements,
      mockSchemeContext,
    );

    expect(result).toEqual({
      success: false,
      network: "base-sepolia",
      transaction: "",
      errorReason: "invalid_deferred_evm_payload_scheme",
      payer: buyerAddress,
    });
  });
});

describe("facilitator - settleVoucher", () => {
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

  let mockVoucherStore: VoucherStore;
  let mockWallet: SignerWallet<Chain, Transport>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVoucherStore = {
      settleVoucher: vi.fn().mockResolvedValue({ success: true }),
      getVoucher: vi.fn().mockResolvedValue(mockVoucher),
    } as unknown as VoucherStore;

    // Mock successful verification by default
    vi.mocked(verifyModule.verifyVoucherSignature).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyOnchainState).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({ isValid: true });

    // Mock successful voucher store settlement
    vi.mocked(mockVoucherStore.settleVoucher).mockResolvedValue({ success: true });

    // Create a proper mock wallet with all required properties
    mockWallet = {
      account: {
        address: buyerAddress,
      },
      chain: { id: 84532 },
      readContract: vi.fn(),
      writeContract: vi.fn().mockResolvedValue("0x1234567890abcdef"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        logs: [
          {
            data: "0x000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e0000000000000000000000000000000000000000000000000000000000000050",
            topics: [
              "0xfe7c1ad1ce8265245e3420fdcd8d27904701eb6c1d348c3e1704aebfaa8a50e0",
              "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
              "0x00000000000000000000000080cdf1957ebb7a2df22dd8913753a4423ff4272e",
              "0x000000000000000000000000c93d37ad45c907ee1b27a02b2e1bd823ba9d379c",
            ],
          } as unknown as Log<bigint, number, false>,
        ],
      }),
    } as unknown as SignerWallet<Chain, Transport>;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should settle voucher successfully", async () => {
    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: true,
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    expect(mockVoucherStore.settleVoucher).toHaveBeenCalledWith(
      mockVoucher,
      "0x1234567890abcdef",
      0n, // mocked amount in log
    );
  });

  it("should return error when voucher not found in store", async () => {
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_found",
    });

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(verifyModule.verifyVoucherAvailability).toHaveBeenCalledWith(
      mockVoucher,
      voucherSignature,
      mockVoucher.id,
      mockVoucher.nonce,
      mockVoucherStore,
    );
    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_voucher_not_found",
      transaction: "",
      payer: buyerAddress,
    });
  });

  it("should return error when voucher signature verification fails", async () => {
    vi.mocked(verifyModule.verifyVoucherSignature).mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
    });

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_signature",
      transaction: "",
      payer: buyerAddress,
    });
  });

  it("should return error when onchain state verification fails", async () => {
    vi.mocked(verifyModule.verifyOnchainState).mockResolvedValue({
      isValid: false,
      invalidReason: "insufficient_funds",
    });

    const result = await settleVoucher(buyer, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: false,
      errorReason: "insufficient_funds",
      transaction: "",
      payer: buyerAddress,
    });
  });

  it("should return error when contract transaction fails", async () => {
    mockWallet.writeContract = vi.fn().mockRejectedValue(new Error("Transaction failed"));

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: buyerAddress,
    });
  });

  it("should return error when transaction receipt shows failure", async () => {
    mockWallet.waitForTransactionReceipt = vi.fn().mockResolvedValue({
      status: "reverted",
      logs: [],
    });

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });
  });

  it("should return error when voucher store settlement fails", async () => {
    vi.mocked(mockVoucherStore.settleVoucher).mockResolvedValue({ success: false });

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_voucher_could_not_settle_store",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });
  });

  it("should return error when voucher store throws exception", async () => {
    vi.mocked(mockVoucherStore.settleVoucher).mockRejectedValue(new Error("Store error"));

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_voucher_error_settling_store",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });
  });

  it("should handle empty logs when parsing voucher collected event", async () => {
    mockWallet.waitForTransactionReceipt = vi.fn().mockResolvedValue({
      status: "success",
      logs: [],
    });

    const result = await settleVoucher(mockWallet, mockVoucher, voucherSignature, mockVoucherStore);

    expect(result.success).toBe(true);
    expect(mockVoucherStore.settleVoucher).toHaveBeenCalledWith(
      mockVoucher,
      "0x1234567890abcdef",
      0n, // Default amount when no logs
    );
  });
});
