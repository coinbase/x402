import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Address, Chain, Log, TransactionReceipt, Transport } from "viem";
import { createSigner, ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import { PaymentRequirements, SchemeContext } from "../../../types/verify";
import { DeferredPaymentPayload, DEFERRRED_SCHEME } from "../../../types/verify/schemes/deferred";
import {
  verify,
  settle,
  settleVoucher,
  depositWithAuthorization,
  flushWithAuthorization,
  getAccountData,
} from "./facilitator";
import { VoucherStore } from "./store";
import * as verifyModule from "./verify";

// Mock the verify module
vi.mock("./verify", () => ({
  verifyPaymentRequirements: vi.fn(),
  verifyVoucherContinuity: vi.fn(),
  verifyVoucherSignatureWrapper: vi.fn(),
  verifyVoucherAvailability: vi.fn(),
  verifyVoucherOnchainState: vi.fn(),
  verifyDepositAuthorizationSignatureAndContinuity: vi.fn(),
  verifyDepositAuthorizationOnchainState: vi.fn(),
  verifyFlushAuthorization: vi.fn(),
  getOnchainVerificationData: vi.fn(),
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
    vi.mocked(verifyModule.verifyVoucherSignatureWrapper).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherOnchainState).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.getOnchainVerificationData).mockResolvedValue({
      isValid: true,
      data: {
        voucherOutstanding: BigInt(1000000),
        voucherCollectable: BigInt(1000000),
        availableBalance: BigInt(1000000),
        allowance: BigInt(1000000),
        nonce: BigInt(0),
        isDepositNonceUsed: false,
      },
    });
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
    vi.mocked(verifyModule.verifyVoucherSignatureWrapper).mockResolvedValue({
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
    vi.mocked(verifyModule.verifyVoucherOnchainState).mockResolvedValue({
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
    vi.mocked(verifyModule.verifyVoucherSignatureWrapper).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherOnchainState).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.getOnchainVerificationData).mockResolvedValue({
      isValid: true,
      data: {
        voucherOutstanding: BigInt(1000000),
        voucherCollectable: BigInt(1000000),
        availableBalance: BigInt(1000000),
        allowance: BigInt(1000000),
        nonce: BigInt(0),
        isDepositNonceUsed: false,
      },
    });

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
    vi.mocked(verifyModule.verifyVoucherSignatureWrapper).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherOnchainState).mockReturnValue({ isValid: true });
    vi.mocked(verifyModule.verifyVoucherAvailability).mockResolvedValue({ isValid: true });
    vi.mocked(verifyModule.getOnchainVerificationData).mockResolvedValue({
      isValid: true,
      data: {
        voucherOutstanding: BigInt(1000000),
        voucherCollectable: BigInt(1000000),
        availableBalance: BigInt(1000000),
        allowance: BigInt(1000000),
        nonce: BigInt(0),
        isDepositNonceUsed: false,
      },
    });

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
    vi.mocked(verifyModule.verifyVoucherSignatureWrapper).mockResolvedValue({
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
    vi.mocked(verifyModule.verifyVoucherOnchainState).mockReturnValue({
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

describe("facilitator - depositWithAuthorization", () => {
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

  const mockDepositAuthorizationWithoutPermit = {
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

  let mockWallet: SignerWallet<Chain, Transport>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful verification by default
    vi.mocked(verifyModule.verifyDepositAuthorizationSignatureAndContinuity).mockResolvedValue({
      isValid: true,
    });

    // Mock successful onchain state verification by default
    vi.mocked(verifyModule.verifyDepositAuthorizationOnchainState).mockReturnValue({
      isValid: true,
    });

    vi.mocked(verifyModule.getOnchainVerificationData).mockResolvedValue({
      isValid: true,
      data: {
        voucherOutstanding: BigInt(1000000),
        voucherCollectable: BigInt(1000000),
        availableBalance: BigInt(1000000),
        allowance: BigInt(1000000),
        nonce: BigInt(0),
        isDepositNonceUsed: false,
      },
    });

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
        logs: [],
      }),
    } as unknown as SignerWallet<Chain, Transport>;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should deposit with authorization successfully with permit", async () => {
    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );

    expect(result).toEqual({
      success: true,
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have called writeContract twice (permit + depositWithAuthorization)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(2);

    // Verify permit call - args: [owner, spender, value, deadline, v, r, s]
    const permitCall = vi.mocked(mockWallet.writeContract).mock.calls[0][0];
    expect(permitCall).toMatchObject({
      address: assetAddress,
      functionName: "permit",
      chain: mockWallet.chain,
    });
    expect(permitCall.args).toHaveLength(7);
    expect(permitCall.args?.[0]).toBe(buyerAddress);
    expect((permitCall.args?.[1] as Address).toLowerCase()).toBe(escrowAddress.toLowerCase());
    expect(permitCall.args?.[2]).toBe(BigInt("1000000"));
    expect(permitCall.args?.[3]).toBe(BigInt(mockDepositAuthorizationWithPermit.permit.deadline));

    // Verify depositWithAuthorization call
    const depositCall = vi.mocked(mockWallet.writeContract).mock.calls[1][0];
    expect(depositCall).toMatchObject({
      address: escrowAddress,
      functionName: "depositWithAuthorization",
      chain: mockWallet.chain,
    });
    expect(depositCall.args).toHaveLength(2);
    expect(depositCall.args?.[0]).toMatchObject({
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      amount: BigInt("1000000"),
    });

    // Should have waited for both receipts
    expect(mockWallet.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it("should deposit with authorization successfully without permit", async () => {
    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithoutPermit,
    );

    expect(result).toEqual({
      success: true,
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have called writeContract only once (depositWithAuthorization, no permit)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);

    // Verify depositWithAuthorization call
    const depositCall = vi.mocked(mockWallet.writeContract).mock.calls[0][0];
    expect(depositCall).toMatchObject({
      address: escrowAddress,
      functionName: "depositWithAuthorization",
      chain: mockWallet.chain,
    });
    expect(depositCall.args).toHaveLength(2);
    expect(depositCall.args?.[0]).toMatchObject({
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      amount: BigInt("1000000"),
    });

    // Should have waited for only one receipt
    expect(mockWallet.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
  });

  it("should return error when deposit authorization verification fails", async () => {
    vi.mocked(verifyModule.verifyDepositAuthorizationSignatureAndContinuity).mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_permit_signature",
    });

    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_permit_signature",
      transaction: "",
      payer: buyerAddress,
    });

    // Should not have called any contract writes
    expect(mockWallet.writeContract).not.toHaveBeenCalled();
  });

  it("should return error when permit transaction fails", async () => {
    mockWallet.writeContract = vi.fn().mockRejectedValueOnce(new Error("Permit failed"));

    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: buyerAddress,
    });

    // Should have only called writeContract once (permit failed)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);
  });

  it("should return error when permit transaction receipt shows failure", async () => {
    mockWallet.waitForTransactionReceipt = vi
      .fn()
      .mockResolvedValueOnce({ status: "reverted", logs: [] });

    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have only called writeContract once (permit succeeded but reverted)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);
    expect(mockWallet.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
  });

  it("should return error when depositWithAuthorization transaction fails with permit", async () => {
    mockWallet.writeContract = vi
      .fn()
      .mockResolvedValueOnce("0x1234567890abcdef") // permit succeeds
      .mockRejectedValueOnce(new Error("Deposit failed")); // depositWithAuthorization fails

    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: buyerAddress,
    });

    // Should have called writeContract twice
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(2);
  });

  it("should return error when depositWithAuthorization transaction fails without permit", async () => {
    mockWallet.writeContract = vi.fn().mockRejectedValueOnce(new Error("Deposit failed"));

    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithoutPermit,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: buyerAddress,
    });

    // Should have called writeContract once
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);
  });

  it("should return error when depositWithAuthorization receipt shows failure", async () => {
    mockWallet.waitForTransactionReceipt = vi
      .fn()
      .mockResolvedValueOnce({ status: "success", logs: [] }) // permit succeeds
      .mockResolvedValueOnce({ status: "reverted", logs: [] }); // depositWithAuthorization reverts

    const result = await depositWithAuthorization(
      mockWallet,
      mockVoucher,
      mockDepositAuthorizationWithPermit,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have completed both transactions
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(2);
    expect(mockWallet.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  });
});

describe("facilitator - getAccountData", () => {
  let mockClient: ConnectedClient<Transport, Chain>;
  let mockVoucherStore: VoucherStore;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      chain: { id: 84532 },
      readContract: vi.fn(),
    } as unknown as ConnectedClient<Transport, Chain>;

    mockVoucherStore = {
      getVouchers: vi.fn(),
    } as unknown as VoucherStore;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return account details successfully with no outstanding vouchers", async () => {
    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue([]);
    vi.mocked(mockClient.readContract).mockResolvedValue([
      BigInt(5000000), // balance
      BigInt(2000000), // allowance
      BigInt(10), // nonce
    ]);

    const result = await getAccountData(
      mockClient,
      buyerAddress as Address,
      sellerAddress as Address,
      assetAddress as Address,
      escrowAddress as Address,
      84532,
      mockVoucherStore,
    );

    expect(mockVoucherStore.getVouchers).toHaveBeenCalledWith(
      {
        buyer: buyerAddress,
        seller: sellerAddress,
        asset: assetAddress,
        escrow: escrowAddress,
        chainId: 84532,
        latest: true,
      },
      {
        limit: 1_000,
      },
    );

    expect(mockClient.readContract).toHaveBeenCalledWith({
      address: escrowAddress,
      abi: expect.any(Array),
      functionName: "getAccountData",
      args: [buyerAddress, sellerAddress, assetAddress, [], []],
    });

    expect(result).toEqual({
      balance: "5000000",
      assetAllowance: "2000000",
      assetPermitNonce: "10",
    });
  });

  it("should return account details successfully with outstanding vouchers", async () => {
    const mockVouchers = [
      {
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
        signature:
          "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c",
      },
      {
        id: "0x8b4f0c21f9c7af0c5f96d32c8e6f4e79bc2c8e5735c6ef49c2gg9e581bc8g5g2",
        buyer: buyerAddress,
        seller: sellerAddress,
        valueAggregate: "500000",
        asset: assetAddress,
        timestamp: 1715769700,
        nonce: 1,
        escrow: escrowAddress,
        chainId: 84532,
        expiry: 1715769700 + 1000 * 60 * 60 * 24 * 30,
        signature:
          "0x79ce97f6d1242aa7b6f4826efb553ed453fd6c7132c665d95bc226d5f3027dd5456d61ed1bd8da5de6cea4d8154070ff458300b6b84e0c9010f434af77ad3d291c",
      },
    ];

    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue(mockVouchers);
    vi.mocked(mockClient.readContract).mockResolvedValue([
      BigInt(3500000), // balance (adjusted for outstanding vouchers)
      BigInt(2000000), // allowance
      BigInt(5), // nonce
    ]);

    const result = await getAccountData(
      mockClient,
      buyerAddress as Address,
      sellerAddress as Address,
      assetAddress as Address,
      escrowAddress as Address,
      84532,
      mockVoucherStore,
    );

    expect(mockClient.readContract).toHaveBeenCalledWith({
      address: escrowAddress,
      abi: expect.any(Array),
      functionName: "getAccountData",
      args: [
        buyerAddress,
        sellerAddress,
        assetAddress,
        [voucherId, "0x8b4f0c21f9c7af0c5f96d32c8e6f4e79bc2c8e5735c6ef49c2gg9e581bc8g5g2"],
        [BigInt(1000000), BigInt(500000)],
      ],
    });

    expect(result).toEqual({
      balance: "3500000",
      assetAllowance: "2000000",
      assetPermitNonce: "5",
    });
  });

  it("should return error when contract call fails", async () => {
    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue([]);
    vi.mocked(mockClient.readContract).mockRejectedValue(new Error("Contract call failed"));

    const result = await getAccountData(
      mockClient,
      buyerAddress as Address,
      sellerAddress as Address,
      assetAddress as Address,
      escrowAddress as Address,
      84532,
      mockVoucherStore,
    );

    expect(result).toEqual({
      error: "invalid_deferred_evm_contract_call_failed_account_details",
    });
  });

  it("should handle voucher store errors gracefully", async () => {
    vi.mocked(mockVoucherStore.getVouchers).mockRejectedValue(new Error("Store error"));

    await expect(
      getAccountData(
        mockClient,
        buyerAddress as Address,
        sellerAddress as Address,
        assetAddress as Address,
        escrowAddress as Address,
        84532,
        mockVoucherStore,
      ),
    ).rejects.toThrow("Store error");
  });

  it("should handle large number of outstanding vouchers", async () => {
    const manyVouchers = Array.from({ length: 100 }, (_, i) => ({
      id: `0x${i.toString(16).padStart(64, "0")}`,
      buyer: buyerAddress,
      seller: sellerAddress,
      valueAggregate: "10000",
      asset: assetAddress,
      timestamp: 1715769600 + i,
      nonce: i,
      escrow: escrowAddress,
      chainId: 84532,
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c",
    }));

    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue(manyVouchers);
    vi.mocked(mockClient.readContract).mockResolvedValue([
      BigInt(4000000), // balance
      BigInt(1000000), // allowance
      BigInt(3), // nonce
    ]);

    const result = await getAccountData(
      mockClient,
      buyerAddress as Address,
      sellerAddress as Address,
      assetAddress as Address,
      escrowAddress as Address,
      84532,
      mockVoucherStore,
    );

    expect(result).toEqual({
      balance: "4000000",
      assetAllowance: "1000000",
      assetPermitNonce: "3",
    });

    const contractCallArgs = vi.mocked(mockClient.readContract).mock.calls[0][0];
    expect(contractCallArgs.args?.[3]).toHaveLength(100); // All voucher IDs included
    expect(contractCallArgs.args?.[4]).toHaveLength(100); // All voucher values included
  });

  it("should handle zero balance", async () => {
    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue([]);
    vi.mocked(mockClient.readContract).mockResolvedValue([
      BigInt(0), // zero balance
      BigInt(0), // zero allowance
      BigInt(0), // zero nonce
    ]);

    const result = await getAccountData(
      mockClient,
      buyerAddress as Address,
      sellerAddress as Address,
      assetAddress as Address,
      escrowAddress as Address,
      84532,
      mockVoucherStore,
    );

    expect(result).toEqual({
      balance: "0",
      assetAllowance: "0",
      assetPermitNonce: "0",
    });
  });

  it("should handle very large balances", async () => {
    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue([]);
    vi.mocked(mockClient.readContract).mockResolvedValue([
      BigInt("1000000000000000000"), // 1 ETH in wei
      BigInt("500000000000000000"), // 0.5 ETH in wei
      BigInt(999), // large nonce
    ]);

    const result = await getAccountData(
      mockClient,
      buyerAddress as Address,
      sellerAddress as Address,
      assetAddress as Address,
      escrowAddress as Address,
      84532,
      mockVoucherStore,
    );

    expect(result).toEqual({
      balance: "1000000000000000000",
      assetAllowance: "500000000000000000",
      assetPermitNonce: "999",
    });
  });

  it("should call voucher store with correct filters", async () => {
    const differentBuyer = "0x9876543210987654321098765432109876543210";
    const differentSeller = "0x8765432109876543210987654321098765432109";
    const differentAsset = "0x7654321098765432109876543210987654321098";
    const differentEscrow = "0x6543210987654321098765432109876543210987";

    vi.mocked(mockVoucherStore.getVouchers).mockResolvedValue([]);
    vi.mocked(mockClient.readContract).mockResolvedValue([
      BigInt(1000000),
      BigInt(500000),
      BigInt(1),
    ]);

    await getAccountData(
      mockClient,
      differentBuyer as Address,
      differentSeller as Address,
      differentAsset as Address,
      differentEscrow as Address,
      1,
      mockVoucherStore,
    );

    expect(mockVoucherStore.getVouchers).toHaveBeenCalledWith(
      {
        buyer: differentBuyer,
        seller: differentSeller,
        asset: differentAsset,
        escrow: differentEscrow,
        chainId: 1,
        latest: true,
      },
      {
        limit: 1_000,
      },
    );
  });
});

describe("facilitator - flushWithAuthorization", () => {
  const mockFlushAuthorization = {
    buyer: buyerAddress,
    seller: sellerAddress,
    asset: assetAddress,
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
    signature:
      "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
  };

  let mockWallet: SignerWallet<Chain, Transport>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful verification by default
    vi.mocked(verifyModule.verifyFlushAuthorization).mockResolvedValue({ isValid: true });

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
        logs: [],
      }),
    } as unknown as SignerWallet<Chain, Transport>;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should flush with authorization successfully", async () => {
    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: true,
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have called writeContract once (flushWithAuthorization)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);

    // Verify flushWithAuthorization call
    const flushCall = vi.mocked(mockWallet.writeContract).mock.calls[0][0];
    expect(flushCall).toMatchObject({
      address: escrowAddress,
      functionName: "flushWithAuthorization",
    });

    // Verify the args structure
    expect(flushCall.args?.[0]).toMatchObject({
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: assetAddress,
      nonce: mockFlushAuthorization.nonce,
    });
    expect((flushCall.args?.[0] as { expiry: bigint }).expiry).toBe(
      BigInt(mockFlushAuthorization.expiry),
    );
    expect(flushCall.args?.[1]).toBe(mockFlushAuthorization.signature);
  });

  it("should return error if flush authorization verification fails", async () => {
    vi.mocked(verifyModule.verifyFlushAuthorization).mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_flush_authorization_signature",
    });

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_flush_authorization_signature",
      transaction: "",
      payer: buyerAddress,
    });

    expect(mockWallet.writeContract).not.toHaveBeenCalled();
  });

  it("should return error when flushWithAuthorization transaction reverts", async () => {
    vi.mocked(mockWallet.writeContract).mockRejectedValueOnce(new Error("Flush failed"));

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: buyerAddress,
    });
  });

  it("should return error when flushWithAuthorization transaction has failed status", async () => {
    vi.mocked(mockWallet.waitForTransactionReceipt).mockResolvedValueOnce({
      status: "reverted",
      logs: [],
    } as unknown as TransactionReceipt);

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });
  });

  it("should call flushAllWithAuthorization when seller is undefined", async () => {
    const mockFlushAllAuthorization = {
      buyer: buyerAddress,
      seller: undefined,
      asset: undefined,
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    };

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAllAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: true,
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have called writeContract once (flushAllWithAuthorization)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);

    // Verify flushAllWithAuthorization call
    const flushCall = vi.mocked(mockWallet.writeContract).mock.calls[0][0];
    expect(flushCall).toMatchObject({
      address: escrowAddress,
      functionName: "flushAllWithAuthorization",
    });

    // Verify the args structure (no seller/asset in args)
    expect(flushCall.args?.[0]).toMatchObject({
      buyer: buyerAddress,
      nonce: mockFlushAllAuthorization.nonce,
    });
    expect((flushCall.args?.[0] as { expiry: bigint }).expiry).toBe(
      BigInt(mockFlushAllAuthorization.expiry),
    );
    expect(flushCall.args?.[1]).toBe(mockFlushAllAuthorization.signature);
    // Ensure seller and asset are NOT in the args
    expect(flushCall.args?.[0]).not.toHaveProperty("seller");
    expect(flushCall.args?.[0]).not.toHaveProperty("asset");
  });

  it("should call flushAllWithAuthorization when asset is undefined", async () => {
    const mockFlushAllAuthorization = {
      buyer: buyerAddress,
      seller: sellerAddress,
      asset: undefined,
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    };

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAllAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: true,
      transaction: "0x1234567890abcdef",
      payer: buyerAddress,
    });

    // Should have called writeContract once (flushAllWithAuthorization)
    expect(mockWallet.writeContract).toHaveBeenCalledTimes(1);

    // Verify flushAllWithAuthorization call
    const flushCall = vi.mocked(mockWallet.writeContract).mock.calls[0][0];
    expect(flushCall).toMatchObject({
      address: escrowAddress,
      functionName: "flushAllWithAuthorization",
    });

    // Verify the args structure (no seller/asset in args)
    expect(flushCall.args?.[0]).toMatchObject({
      buyer: buyerAddress,
      nonce: mockFlushAllAuthorization.nonce,
    });
    expect((flushCall.args?.[0] as { expiry: bigint }).expiry).toBe(
      BigInt(mockFlushAllAuthorization.expiry),
    );
    expect(flushCall.args?.[1]).toBe(mockFlushAllAuthorization.signature);
  });

  it("should handle flushAllWithAuthorization verification failure", async () => {
    const mockFlushAllAuthorization = {
      buyer: buyerAddress,
      seller: undefined,
      asset: undefined,
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    };

    vi.mocked(verifyModule.verifyFlushAuthorization).mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_flush_authorization_signature",
    });

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAllAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_deferred_evm_payload_flush_authorization_signature",
      transaction: "",
      payer: buyerAddress,
    });

    expect(mockWallet.writeContract).not.toHaveBeenCalled();
  });

  it("should handle flushAllWithAuthorization transaction revert", async () => {
    const mockFlushAllAuthorization = {
      buyer: buyerAddress,
      seller: undefined,
      asset: undefined,
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
      signature:
        "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b" as `0x${string}`,
    };

    vi.mocked(mockWallet.writeContract).mockRejectedValueOnce(new Error("Flush all failed"));

    const result = await flushWithAuthorization(
      mockWallet,
      mockFlushAllAuthorization,
      escrowAddress as `0x${string}`,
    );

    expect(result).toEqual({
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: buyerAddress,
    });
  });
});
