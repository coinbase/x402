import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigner } from "../../../types/shared/evm";
import { signVoucher, verifyVoucher } from "./sign";
import { privateKeyToAccount } from "viem/accounts";

const buyer = createSigner(
  "base-sepolia",
  "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
);
const buyerAddress = buyer.account.address;
const anotherBuyerAddress = "0x9234567890123456789012345678901234567890";
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffffff12345678901234567890123456789fffff";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";

describe("voucher signature", () => {
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

  const mockVoucherSignature =
    "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid voucher signature", async () => {
    const signature = await signVoucher(buyer, mockVoucher);
    expect(signature.signature).toBe(mockVoucherSignature);
  });

  it("should verify a valid voucher signature", async () => {
    const isValid = await verifyVoucher(mockVoucher, mockVoucherSignature, buyerAddress);
    expect(isValid).toBe(true);
  });

  it("should return false if voucher signature is valid but for a different buyer", async () => {
    const isValid = await verifyVoucher(mockVoucher, mockVoucherSignature, anotherBuyerAddress);
    expect(isValid).toBe(false);
  });

  it("should sign a voucher using a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signVoucher(localAccount, mockVoucher);

    expect(signature.signature).toBe(mockVoucherSignature);
  });

  it("should verify a voucher signed by a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signVoucher(localAccount, mockVoucher);

    const isValid = await verifyVoucher(mockVoucher, signature.signature, localAccount.address);
    expect(isValid).toBe(true);
  });

  it("should throw error if wallet client does not support signTypedData", async () => {
    const invalidWallet = {
      account: { address: buyerAddress },
      // Missing signTypedData method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(signVoucher(invalidWallet, mockVoucher)).rejects.toThrow(
      "Invalid wallet client provided does not support signTypedData",
    );
  });

  it("should throw error if LocalAccount does not support signTypedData", async () => {
    const invalidAccount = {
      address: buyerAddress,
      type: "local",
      // Missing signTypedData method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(signVoucher(invalidAccount, mockVoucher)).rejects.toThrow(
      "Invalid wallet client provided does not support signTypedData",
    );
  });
});
