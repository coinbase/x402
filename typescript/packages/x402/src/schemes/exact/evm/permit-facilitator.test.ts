import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { Address, parseErc6492Signature } from "viem";
import { createClientSepolia, createSignerSepolia } from "../../../types/shared/evm";
import { PaymentPayload, PaymentRequirements, ExactEvmPermitPayload } from "../../../types/verify";
import { verifyPermit, settlePermit } from "./permit-facilitator";
import { getERC20Balance } from "../../../shared/evm";

vi.mock("../../../shared/evm", () => ({
  getVersion: vi.fn().mockResolvedValue("1"),
  getERC20Balance: vi.fn().mockResolvedValue(BigInt(10000000)),
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    parseErc6492Signature: vi.fn().mockReturnValue({
      signature: "0x1234567890123456789012345678901234567890123456789012345678901234",
    }),
  };
});

describe("verifyPermit", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890" as Address,
    maxTimeoutSeconds: 300,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
    extra: {
      name: "USD Coin",
      version: "2",
      facilitatorAddress: "0x1234567890123456789012345678901234567890",
    },
  };

  const mockPermitPayload: ExactEvmPermitPayload = {
    signature: "0xabcdef1234567890123456789012345678901234567890123456789012345678901234",
    permit: {
      owner: "0xabcdef1234567890123456789012345678901234" as Address,
      spender: "0x1234567890123456789012345678901234567890" as Address,
      value: "1000000",
      nonce: "5",
      deadline: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour from now
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 84532,
        verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
      },
    },
  };

  const mockPaymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: mockPermitPayload,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return valid for a correct permit payload", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);

    const result = await verifyPermit(client, mockPaymentPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(mockPermitPayload.permit.owner);
  });

  it("should reject if scheme doesn't match", async () => {
    const client = createClientSepolia();
    const invalidPayload = { ...mockPaymentPayload, scheme: "invalid" as "exact" };

    const result = await verifyPermit(client, invalidPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("unsupported_scheme");
  });

  it("should reject if network is invalid", async () => {
    const client = createClientSepolia();
    const invalidPayload = {
      ...mockPaymentPayload,
      network: "invalid-network" as "base-sepolia",
    };

    const result = await verifyPermit(client, invalidPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_network");
  });

  it("should reject if signature is invalid", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(false);

    const result = await verifyPermit(client, mockPaymentPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_evm_permit_payload_signature");
  });

  it("should reject if spender doesn't match facilitator", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);

    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPermitPayload,
        permit: {
          ...mockPermitPayload.permit,
          spender: "0x9999999999999999999999999999999999999999" as Address,
          domain: {
            name: "USD Coin",
            version: "2",
            chainId: 84532,
            verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
          },
        },
      },
    };

    const result = await verifyPermit(client, invalidPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_evm_permit_payload_spender_mismatch");
  });

  it("should reject if deadline has expired", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);

    const expiredPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPermitPayload,
        permit: {
          ...mockPermitPayload.permit,
          deadline: "100", // Far in the past
          domain: {
            name: "USD Coin",
            version: "2",
            chainId: 84532,
            verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
          },
        },
      },
    };

    const result = await verifyPermit(client, expiredPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_evm_permit_payload_deadline");
  });

  it("should reject if owner has insufficient funds", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(100)); // Less than required

    const result = await verifyPermit(client, mockPaymentPayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("insufficient_funds");
  });

  it("should reject if permit value is less than required", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);
    // Reset balance mock to have sufficient funds so we test the value check, not balance check
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));

    const lowValuePayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPermitPayload,
        permit: {
          ...mockPermitPayload.permit,
          value: "100", // Less than maxAmountRequired (1000000)
          domain: {
            name: "USD Coin",
            version: "2",
            chainId: 84532,
            verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
          },
        },
      },
    };

    const result = await verifyPermit(client, lowValuePayload, mockPaymentRequirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_evm_permit_payload_value");
  });

  it("should call verifyTypedData with correct parameters", async () => {
    const client = createClientSepolia();
    const verifyTypedDataSpy = vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);

    await verifyPermit(client, mockPaymentPayload, mockPaymentRequirements);

    expect(verifyTypedDataSpy).toHaveBeenCalledWith({
      address: mockPermitPayload.permit.owner,
      types: expect.any(Object),
      primaryType: "Permit",
      domain: expect.objectContaining({
        name: "USD Coin",
        version: "2",
        verifyingContract: mockPaymentRequirements.asset,
      }),
      message: expect.objectContaining({
        owner: mockPermitPayload.permit.owner,
        spender: mockPermitPayload.permit.spender,
        value: BigInt(mockPermitPayload.permit.value),
        nonce: BigInt(mockPermitPayload.permit.nonce),
        deadline: BigInt(mockPermitPayload.permit.deadline),
      }),
      signature: mockPermitPayload.signature,
    });
  });

  it("should use payTo as fallback spender if facilitatorAddress is not provided", async () => {
    const client = createClientSepolia();
    vi.spyOn(client, "verifyTypedData").mockResolvedValue(true);
    // Reset balance mock to have sufficient funds
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));

    const requirementsWithoutFacilitator = {
      ...mockPaymentRequirements,
      extra: {
        name: "USD Coin",
        version: "2",
      },
    };

    const payloadWithPayToSpender = {
      ...mockPaymentPayload,
      payload: {
        ...mockPermitPayload,
        permit: {
          ...mockPermitPayload.permit,
          spender: mockPaymentRequirements.payTo,
          domain: {
            name: "USD Coin",
            version: "2",
            chainId: 84532,
            verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
          },
        },
      },
    };

    const result = await verifyPermit(
      client,
      payloadWithPayToSpender,
      requirementsWithoutFacilitator,
    );

    expect(result.isValid).toBe(true);
  });
});

describe("settlePermit", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890" as Address,
    maxTimeoutSeconds: 300,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
    extra: {
      name: "USD Coin",
      version: "2",
      facilitatorAddress: "0x1234567890123456789012345678901234567890",
    },
  };

  const mockPermitPayload: ExactEvmPermitPayload = {
    signature: "0xabcdef1234567890123456789012345678901234567890123456789012345678901234",
    permit: {
      owner: "0xabcdef1234567890123456789012345678901234" as Address,
      spender: "0x1234567890123456789012345678901234567890" as Address,
      value: "1000000",
      nonce: "5",
      deadline: (Math.floor(Date.now() / 1000) + 3600).toString(),
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 84532,
        verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
      },
    },
  };

  const mockPaymentPayload: PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: mockPermitPayload,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should settle permit successfully", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    // Reset balance mock for verification
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    vi.spyOn(wallet, "writeContract").mockResolvedValue("0xpermittxhash");
    vi.spyOn(wallet, "waitForTransactionReceipt").mockResolvedValue({
      status: "success",
    });

    const result = await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(result.success).toBe(true);
    expect(result.payer).toBe(mockPermitPayload.permit.owner);
    expect(wallet.writeContract).toHaveBeenCalledTimes(2); // permit + transferFrom
  });

  it("should fail if verification fails", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(false);

    const result = await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("invalid_exact_evm_permit_payload_signature");
  });

  it("should fail if permit transaction fails", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    vi.spyOn(wallet, "writeContract").mockResolvedValue("0xpermittxhash");
    vi.spyOn(wallet, "waitForTransactionReceipt").mockResolvedValue({
      status: "reverted",
    });

    const result = await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("invalid_transaction_state");
  });

  it("should fail if transferFrom transaction fails", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    const writeContractSpy = vi
      .spyOn(wallet, "writeContract")
      .mockResolvedValueOnce("0xpermittxhash")
      .mockResolvedValueOnce("0xtransfertxhash");
    const waitForReceiptSpy = vi
      .spyOn(wallet, "waitForTransactionReceipt")
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "reverted" });

    const result = await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("invalid_transaction_state");
    expect(writeContractSpy).toHaveBeenCalledTimes(2);
    expect(waitForReceiptSpy).toHaveBeenCalledTimes(2);
  });

  it("should call permit with correct parameters", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    const writeContractSpy = vi.spyOn(wallet, "writeContract").mockResolvedValue("0xtxhash");
    vi.spyOn(wallet, "waitForTransactionReceipt").mockResolvedValue({
      status: "success",
    });

    await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    // First call should be to permit
    expect(writeContractSpy).toHaveBeenNthCalledWith(1, {
      address: mockPaymentRequirements.asset,
      abi: expect.any(Array),
      functionName: "permit",
      args: [
        mockPermitPayload.permit.owner,
        mockPermitPayload.permit.spender,
        BigInt(mockPermitPayload.permit.value),
        BigInt(mockPermitPayload.permit.deadline),
        expect.any(String),
      ],
      chain: wallet.chain,
    });
  });

  it("should call transferFrom with correct parameters", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    const writeContractSpy = vi.spyOn(wallet, "writeContract").mockResolvedValue("0xtxhash");
    vi.spyOn(wallet, "waitForTransactionReceipt").mockResolvedValue({
      status: "success",
    });

    await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    // Second call should be to transferFrom
    expect(writeContractSpy).toHaveBeenNthCalledWith(2, {
      address: mockPaymentRequirements.asset,
      abi: expect.any(Array),
      functionName: "transferFrom",
      args: [
        mockPermitPayload.permit.owner,
        mockPaymentRequirements.payTo,
        BigInt(mockPermitPayload.permit.value),
      ],
      chain: wallet.chain,
    });
  });

  it("should parse ERC6492 signature if present", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    vi.spyOn(wallet, "writeContract").mockResolvedValue("0xtxhash");
    vi.spyOn(wallet, "waitForTransactionReceipt").mockResolvedValue({
      status: "success",
    });

    await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(parseErc6492Signature).toHaveBeenCalledWith(mockPermitPayload.signature);
  });

  it("should handle errors gracefully", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    vi.spyOn(wallet, "writeContract").mockRejectedValue(new Error("Transaction failed"));

    const result = await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("unexpected_settle_error");
  });

  it("should return the transferFrom transaction hash on success", async () => {
    const wallet = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    vi.mocked(getERC20Balance).mockResolvedValue(BigInt(10000000));
    vi.spyOn(wallet, "verifyTypedData").mockResolvedValue(true);
    vi.spyOn(wallet, "writeContract")
      .mockResolvedValueOnce("0xpermittxhash")
      .mockResolvedValueOnce("0xtransfertxhash");
    vi.spyOn(wallet, "waitForTransactionReceipt").mockResolvedValue({
      status: "success",
    });

    const result = await settlePermit(wallet, mockPaymentPayload, mockPaymentRequirements);

    expect(result.transaction).toBe("0xtransfertxhash");
  });
});
