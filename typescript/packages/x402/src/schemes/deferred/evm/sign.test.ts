import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigner } from "../../../types/shared/evm";
import {
  signVoucher,
  verifyVoucherSignature,
  signPermit,
  verifyPermitSignature,
  signDepositAuthorizationInner,
  verifyDepositAuthorizationInnerSignature,
  signFlushAuthorization,
  verifyFlushAuthorizationSignature,
} from "./sign";
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
    const isValid = await verifyVoucherSignature(mockVoucher, mockVoucherSignature, buyerAddress);
    expect(isValid).toBe(true);
  });

  it("should return false if voucher signature is valid but for a different buyer", async () => {
    const isValid = await verifyVoucherSignature(
      mockVoucher,
      mockVoucherSignature,
      anotherBuyerAddress,
    );
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

    const isValid = await verifyVoucherSignature(
      mockVoucher,
      signature.signature,
      localAccount.address,
    );
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

describe("permit signature", () => {
  const mockPermit = {
    owner: buyerAddress,
    spender: escrowAddress,
    value: "1000000",
    nonce: "0",
    deadline: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
    domain: {
      name: "USD Coin",
      version: "2",
    },
  };

  const mockPermitSignature =
    "0x1ed1158f8c70dc6393f8c9a379bf4569eb13a0ae6f060465418cbb9acbf5fb536eda5bdb7a6a28317329df0b9aec501fdf15f02f04b60ac536b90da3ce6f3efb1c";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid permit signature", async () => {
    const signature = await signPermit(buyer, mockPermit, 84532, assetAddress as `0x${string}`);
    expect(signature.signature).toBe(mockPermitSignature);
  });

  it("should verify a valid permit signature", async () => {
    const isValid = await verifyPermitSignature(
      mockPermit,
      mockPermitSignature as `0x${string}`,
      buyerAddress as `0x${string}`,
      84532,
      assetAddress as `0x${string}`,
    );
    expect(isValid).toBe(true);
  });

  it("should return false if permit signature is valid but for a different signer", async () => {
    const isValid = await verifyPermitSignature(
      mockPermit,
      mockPermitSignature as `0x${string}`,
      anotherBuyerAddress as `0x${string}`,
      84532,
      assetAddress as `0x${string}`,
    );
    expect(isValid).toBe(false);
  });

  it("should sign a permit using a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signPermit(
      localAccount,
      mockPermit,
      84532,
      assetAddress as `0x${string}`,
    );

    expect(signature.signature).toBe(mockPermitSignature);
  });

  it("should verify a permit signed by a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signPermit(
      localAccount,
      mockPermit,
      84532,
      assetAddress as `0x${string}`,
    );

    const isValid = await verifyPermitSignature(
      mockPermit,
      signature.signature,
      localAccount.address,
      84532,
      assetAddress as `0x${string}`,
    );
    expect(isValid).toBe(true);
  });

  it("should throw error if wallet client does not support signTypedData", async () => {
    const invalidWallet = {
      account: { address: buyerAddress },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      signPermit(invalidWallet, mockPermit, 84532, assetAddress as `0x${string}`),
    ).rejects.toThrow("Invalid wallet client provided does not support signTypedData");
  });

  it("should throw error if LocalAccount does not support signTypedData", async () => {
    const invalidAccount = {
      address: buyerAddress,
      type: "local",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      signPermit(invalidAccount, mockPermit, 84532, assetAddress as `0x${string}`),
    ).rejects.toThrow("Invalid wallet client provided does not support signTypedData");
  });
});

describe("deposit authorization signature", () => {
  const mockDepositAuth = {
    buyer: buyerAddress,
    seller: sellerAddress,
    asset: assetAddress,
    amount: "1000000",
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
  };

  const mockDepositAuthSignature =
    "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid deposit authorization signature", async () => {
    const signature = await signDepositAuthorizationInner(
      buyer,
      mockDepositAuth,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(signature.signature).toBe(mockDepositAuthSignature);
  });

  it("should verify a valid deposit authorization signature", async () => {
    const isValid = await verifyDepositAuthorizationInnerSignature(
      mockDepositAuth,
      mockDepositAuthSignature as `0x${string}`,
      buyerAddress as `0x${string}`,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(isValid).toBe(true);
  });

  it("should return false if deposit authorization signature is valid but for a different signer", async () => {
    const isValid = await verifyDepositAuthorizationInnerSignature(
      mockDepositAuth,
      mockDepositAuthSignature as `0x${string}`,
      anotherBuyerAddress as `0x${string}`,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(isValid).toBe(false);
  });

  it("should sign a deposit authorization using a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signDepositAuthorizationInner(
      localAccount,
      mockDepositAuth,
      84532,
      escrowAddress as `0x${string}`,
    );

    expect(signature.signature).toBe(mockDepositAuthSignature);
  });

  it("should verify a deposit authorization signed by a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signDepositAuthorizationInner(
      localAccount,
      mockDepositAuth,
      84532,
      escrowAddress as `0x${string}`,
    );

    const isValid = await verifyDepositAuthorizationInnerSignature(
      mockDepositAuth,
      signature.signature,
      localAccount.address,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(isValid).toBe(true);
  });

  it("should throw error if wallet client does not support signTypedData", async () => {
    const invalidWallet = {
      account: { address: buyerAddress },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      signDepositAuthorizationInner(
        invalidWallet,
        mockDepositAuth,
        84532,
        escrowAddress as `0x${string}`,
      ),
    ).rejects.toThrow("Invalid wallet client provided does not support signTypedData");
  });

  it("should throw error if LocalAccount does not support signTypedData", async () => {
    const invalidAccount = {
      address: buyerAddress,
      type: "local",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      signDepositAuthorizationInner(
        invalidAccount,
        mockDepositAuth,
        84532,
        escrowAddress as `0x${string}`,
      ),
    ).rejects.toThrow("Invalid wallet client provided does not support signTypedData");
  });
});

describe("flush authorization signature", () => {
  const mockFlushAuth = {
    buyer: buyerAddress,
    seller: sellerAddress,
    asset: assetAddress,
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid flush authorization signature", async () => {
    const signature = await signFlushAuthorization(
      buyer,
      mockFlushAuth,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(signature.signature).toBeDefined();
    expect(signature.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it("should verify a valid flush authorization signature", async () => {
    const signature = await signFlushAuthorization(
      buyer,
      mockFlushAuth,
      84532,
      escrowAddress as `0x${string}`,
    );

    const isValid = await verifyFlushAuthorizationSignature(
      mockFlushAuth,
      signature.signature,
      buyerAddress as `0x${string}`,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(isValid).toBe(true);
  });

  it("should return false if flush authorization signature is valid but for a different signer", async () => {
    const signature = await signFlushAuthorization(
      buyer,
      mockFlushAuth,
      84532,
      escrowAddress as `0x${string}`,
    );

    const isValid = await verifyFlushAuthorizationSignature(
      mockFlushAuth,
      signature.signature,
      anotherBuyerAddress as `0x${string}`,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(isValid).toBe(false);
  });

  it("should sign a flush authorization using a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signFlushAuthorization(
      localAccount,
      mockFlushAuth,
      84532,
      escrowAddress as `0x${string}`,
    );

    expect(signature.signature).toBeDefined();
    expect(signature.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it("should verify a flush authorization signed by a LocalAccount", async () => {
    const localAccount = privateKeyToAccount(
      "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
    );
    const signature = await signFlushAuthorization(
      localAccount,
      mockFlushAuth,
      84532,
      escrowAddress as `0x${string}`,
    );

    const isValid = await verifyFlushAuthorizationSignature(
      mockFlushAuth,
      signature.signature,
      localAccount.address,
      84532,
      escrowAddress as `0x${string}`,
    );
    expect(isValid).toBe(true);
  });

  it("should throw error if wallet client does not support signTypedData", async () => {
    const invalidWallet = {
      account: { address: buyerAddress },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      signFlushAuthorization(invalidWallet, mockFlushAuth, 84532, escrowAddress as `0x${string}`),
    ).rejects.toThrow("Invalid wallet client provided does not support signTypedData");
  });

  it("should throw error if LocalAccount does not support signTypedData", async () => {
    const invalidAccount = {
      address: buyerAddress,
      type: "local",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      signFlushAuthorization(invalidAccount, mockFlushAuth, 84532, escrowAddress as `0x${string}`),
    ).rejects.toThrow("Invalid wallet client provided does not support signTypedData");
  });
});
