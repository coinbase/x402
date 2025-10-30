import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignerSepolia, SignerWallet } from "../../../types/shared/evm";
import { PaymentRequirements } from "../../../types/verify";
import {
  createPermitPaymentHeader,
  preparePermitPaymentHeader,
  signPermitPaymentHeader,
  getPermitNonce,
} from "./permit-client";
import { signPermit } from "./permit-sign";
import { encodePayment } from "./utils/paymentUtils";

vi.mock("./permit-sign", async () => {
  const actual = await vi.importActual("./permit-sign");
  return {
    ...actual,
    signPermit: vi.fn(),
  };
});

vi.mock("./utils/paymentUtils", () => ({
  encodePayment: vi.fn().mockReturnValue("encoded-permit-payment-header"),
}));

describe("getPermitNonce", () => {
  const mockTokenAddress = "0x1234567890123456789012345678901234567890";
  const mockOwnerAddress = "0xabcdef1234567890123456789012345678901234";

  const createTestClient = () => {
    const client = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    // Mock readContract on the client
    vi.spyOn(client, "readContract").mockResolvedValue(BigInt(5));
    return client as unknown as SignerWallet;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch the current nonce from the contract", async () => {
    const client = createTestClient();
    const nonce = await getPermitNonce(client, mockTokenAddress, mockOwnerAddress);

    expect(nonce).toBe("5");
    expect(client.readContract).toHaveBeenCalledWith({
      address: mockTokenAddress,
      abi: expect.arrayContaining([
        expect.objectContaining({
          name: "nonces",
          type: "function",
        }),
      ]),
      functionName: "nonces",
      args: [mockOwnerAddress],
    });
  });

  it("should throw error if contract doesn't have nonces function", async () => {
    const client = createTestClient();
    vi.spyOn(client, "readContract").mockRejectedValue(new Error("Function not found"));

    await expect(getPermitNonce(client, mockTokenAddress, mockOwnerAddress)).rejects.toThrow(
      "Function not found",
    );
  });
});

describe("preparePermitPaymentHeader", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 300,
    asset: "0x1234567890123456789012345678901234567890",
    extra: {
      facilitatorAddress: "0xfacilitator123456789012345678901234567890",
      name: "USD Coin",
      version: "2",
    },
  };

  const mockOwnerAddress = "0xabcdef1234567890123456789012345678901234";
  const mockNonce = "5";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid unsigned permit payment header", () => {
    const result = preparePermitPaymentHeader(
      mockOwnerAddress,
      1,
      mockPaymentRequirements,
      mockNonce,
    );
    const currentTime = Math.floor(Date.now() / 1000);

    expect(result).toEqual({
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      payload: {
        signature: undefined,
        permit: {
          owner: mockOwnerAddress,
          spender: mockPaymentRequirements.extra?.facilitatorAddress,
          value: mockPaymentRequirements.maxAmountRequired,
          nonce: mockNonce,
          deadline: (currentTime + mockPaymentRequirements.maxTimeoutSeconds).toString(),
          domain: {
            name: "USD Coin",
            version: "2",
            chainId: 84532,
            verifyingContract: mockPaymentRequirements.asset,
          },
        },
      },
    });
  });

  it("should use payTo as spender if facilitatorAddress is not provided", () => {
    const requirementsWithoutFacilitator = {
      ...mockPaymentRequirements,
      extra: {
        name: "USD Coin",
        version: "2",
      },
    };

    const result = preparePermitPaymentHeader(
      mockOwnerAddress,
      1,
      requirementsWithoutFacilitator,
      mockNonce,
    );

    expect(result.payload.permit.spender).toBe(mockPaymentRequirements.payTo);
  });

  it("should calculate deadline as current time plus maxTimeoutSeconds", () => {
    const result = preparePermitPaymentHeader(
      mockOwnerAddress,
      1,
      mockPaymentRequirements,
      mockNonce,
    );
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline = parseInt(result.payload.permit.deadline);

    expect(deadline).toBe(currentTime + mockPaymentRequirements.maxTimeoutSeconds);
  });

  it("should handle different x402 versions", () => {
    const result = preparePermitPaymentHeader(
      mockOwnerAddress,
      2,
      mockPaymentRequirements,
      mockNonce,
    );
    expect(result.x402Version).toBe(2);
  });

  it("should use the provided nonce", () => {
    const result = preparePermitPaymentHeader(mockOwnerAddress, 1, mockPaymentRequirements, "42");
    expect(result.payload.permit.nonce).toBe("42");
  });
});

describe("signPermitPaymentHeader", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 300,
    asset: "0x1234567890123456789012345678901234567890",
    extra: {
      name: "USD Coin",
      version: "2",
    },
  };

  const mockUnsignedHeader = {
    x402Version: 1,
    scheme: "exact" as const,
    network: "base-sepolia" as const,
    payload: {
      signature: undefined,
      permit: {
        owner: "0xabcdef1234567890123456789012345678901234",
        spender: "0xfacilitator123456789012345678901234567890",
        value: "1000000",
        nonce: "5",
        deadline: "1704067495",
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: 84532,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
      },
    },
  };

  const mockSignature = "0x1234567890123456789012345678901234567890123456789012345678901234";

  const createTestClient = () => {
    return createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signPermit).mockResolvedValue({ signature: mockSignature });
  });

  it("should sign the permit payment header and return a complete payload", async () => {
    const client = createTestClient();
    const result = await signPermitPaymentHeader(
      client,
      mockPaymentRequirements,
      mockUnsignedHeader,
    );

    expect(signPermit).toHaveBeenCalledWith(client, mockUnsignedHeader.payload.permit);

    expect(result).toEqual({
      ...mockUnsignedHeader,
      payload: {
        ...mockUnsignedHeader.payload,
        signature: mockSignature,
      },
    });
  });

  it("should preserve all original fields in the signed payload", async () => {
    const client = createTestClient();
    const result = await signPermitPaymentHeader(
      client,
      mockPaymentRequirements,
      mockUnsignedHeader,
    );

    expect(result.x402Version).toBe(mockUnsignedHeader.x402Version);
    expect(result.scheme).toBe(mockUnsignedHeader.scheme);
    expect(result.network).toBe(mockUnsignedHeader.network);
    expect("permit" in result.payload).toBe(true);
    if ("permit" in result.payload) {
      expect(result.payload.permit).toEqual(mockUnsignedHeader.payload.permit);
    }
  });

  it("should throw an error if signing fails", async () => {
    const client = createTestClient();
    const error = new Error("Signing failed");
    vi.mocked(signPermit).mockRejectedValue(error);

    await expect(
      signPermitPaymentHeader(client, mockPaymentRequirements, mockUnsignedHeader),
    ).rejects.toThrow("Signing failed");
  });
});

describe("createPermitPaymentHeader", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 300,
    asset: "0x1234567890123456789012345678901234567890",
    extra: {
      name: "USD Coin",
      version: "2",
    },
  };

  const mockSignature = "0x1234567890123456789012345678901234567890123456789012345678901234";

  const createTestClient = () => {
    const client = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
    // Mock readContract for nonce fetching
    vi.spyOn(client, "readContract").mockResolvedValue(BigInt(5));
    return client as unknown as SignerWallet;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signPermit).mockResolvedValue({ signature: mockSignature });
  });

  it("should create and encode a permit payment header", async () => {
    const client = createTestClient();
    const result = await createPermitPaymentHeader(client, 1, mockPaymentRequirements);

    expect(result).toBe("encoded-permit-payment-header");
    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: expect.objectContaining({
          signature: mockSignature,
          permit: expect.objectContaining({
            owner: client.account!.address,
            spender: mockPaymentRequirements.payTo,
            value: mockPaymentRequirements.maxAmountRequired,
            nonce: "5",
          }),
        }),
      }),
    );
  });

  it("should fetch nonce from the contract", async () => {
    const client = createTestClient();
    await createPermitPaymentHeader(client, 1, mockPaymentRequirements);

    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockPaymentRequirements.asset,
        functionName: "nonces",
        args: [client.account!.address],
      }),
    );
  });

  it("should handle different x402 versions", async () => {
    const client = createTestClient();
    await createPermitPaymentHeader(client, 2, mockPaymentRequirements);

    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 2,
      }),
    );
  });

  it("should throw an error if signing fails", async () => {
    const client = createTestClient();
    const error = new Error("Signing failed");
    vi.mocked(signPermit).mockRejectedValue(error);

    await expect(createPermitPaymentHeader(client, 1, mockPaymentRequirements)).rejects.toThrow(
      "Signing failed",
    );
  });

  it("should throw an error if encoding fails", async () => {
    const client = createTestClient();
    const error = new Error("Encoding failed");
    vi.mocked(encodePayment).mockImplementation(() => {
      throw error;
    });

    await expect(createPermitPaymentHeader(client, 1, mockPaymentRequirements)).rejects.toThrow(
      "Encoding failed",
    );
  });

  it("should throw error when nonce fetching fails", async () => {
    const client = createTestClient();
    // Reset encodePayment mock to return the default value
    vi.mocked(encodePayment).mockReturnValue("encoded-permit-payment-header");
    vi.spyOn(client, "readContract").mockRejectedValue(new Error("Contract not found"));

    await expect(createPermitPaymentHeader(client, 1, mockPaymentRequirements)).rejects.toThrow(
      "Contract not found",
    );
  });
});
