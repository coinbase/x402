import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignerSepolia, SignerWallet } from "../../../../types/shared/evm";
import { PaymentRequirements } from "../../../../types/verify";
import { createPaymentHeader, preparePaymentHeader, signPaymentHeader } from "./client";
import { signPermit2 } from "./sign";
import { encodePayment } from "../utils/paymentUtils";

vi.mock("./sign", async () => {
  const actual = await vi.importActual("./sign");
  return {
    ...actual,
    signPermit2: vi.fn(),
  };
});

vi.mock("../utils/paymentUtils", () => ({
  encodePayment: vi.fn().mockReturnValue("encoded-payment-header"),
}));

describe("Permit2 preparePaymentHeader", () => {
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
  };

  const mockFromAddress = "0xabcdef1234567890123456789012345678901234";

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid unsigned Permit2 payment header", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    const currentTime = Math.floor(Date.now() / 1000);

    expect(result).toEqual({
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      payload: {
        authorizationType: "permit2",
        signature: undefined,
        authorization: {
          owner: mockFromAddress,
          spender: mockPaymentRequirements.payTo,
          token: mockPaymentRequirements.asset,
          amount: mockPaymentRequirements.maxAmountRequired,
          deadline: (currentTime + mockPaymentRequirements.maxTimeoutSeconds).toString(),
        },
      },
    });
  });

  it("should calculate deadline as current time plus maxTimeoutSeconds", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline = parseInt(result.payload.authorization.deadline);

    expect(deadline).toBe(currentTime + mockPaymentRequirements.maxTimeoutSeconds);
  });

  it("should handle different x402 versions", () => {
    const result = preparePaymentHeader(mockFromAddress, 2, mockPaymentRequirements);
    expect(result.x402Version).toBe(2);
  });

  it("should set authorizationType to permit2", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    expect(result.payload.authorizationType).toBe("permit2");
  });

  it("should not include nonce in unsigned header", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    expect(result.payload.authorization.nonce).toBeUndefined();
  });

  it("should include token address from asset field", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    expect(result.payload.authorization.token).toBe(mockPaymentRequirements.asset);
  });

  it("should use owner instead of from", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    expect(result.payload.authorization.owner).toBe(mockFromAddress);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.payload.authorization as any).from).toBeUndefined();
  });

  it("should use amount instead of value", () => {
    const result = preparePaymentHeader(mockFromAddress, 1, mockPaymentRequirements);
    expect(result.payload.authorization.amount).toBe(mockPaymentRequirements.maxAmountRequired);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.payload.authorization as any).value).toBeUndefined();
  });
});

describe("Permit2 signPaymentHeader", () => {
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
  };

  const mockUnsignedHeader = {
    x402Version: 1,
    scheme: "exact" as const,
    network: "base-sepolia" as const,
    payload: {
      authorizationType: "permit2" as const,
      signature: undefined,
      authorization: {
        owner: "0xabcdef1234567890123456789012345678901234" as `0x${string}`,
        spender: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        token: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        amount: "1000000",
        deadline: "1704067495",
      },
    },
  };

  const mockSignature = "0x1234567890123456789012345678901234567890123456789012345678901234";
  const mockNonce = "10";

  const createTestClient = () => {
    return createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signPermit2).mockResolvedValue({
      signature: mockSignature,
      nonce: mockNonce,
    });
  });

  it("should sign the Permit2 payment header and return a complete payload", async () => {
    const client = createTestClient();
    const result = await signPaymentHeader(client, mockPaymentRequirements, mockUnsignedHeader);

    expect(signPermit2).toHaveBeenCalledWith(
      client,
      mockUnsignedHeader.payload.authorization,
      mockPaymentRequirements,
    );

    expect(result).toEqual({
      ...mockUnsignedHeader,
      payload: {
        authorizationType: "permit2",
        signature: mockSignature,
        authorization: {
          ...mockUnsignedHeader.payload.authorization,
          nonce: mockNonce,
        },
      },
    });
  });

  it("should include nonce in signed header", async () => {
    const client = createTestClient();
    const result = await signPaymentHeader(client, mockPaymentRequirements, mockUnsignedHeader);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.payload as any).authorization.nonce).toBe(mockNonce);
  });

  it("should preserve all original fields in the signed payload", async () => {
    const client = createTestClient();
    const result = await signPaymentHeader(client, mockPaymentRequirements, mockUnsignedHeader);

    expect(result.x402Version).toBe(mockUnsignedHeader.x402Version);
    expect(result.scheme).toBe(mockUnsignedHeader.scheme);
    expect(result.network).toBe(mockUnsignedHeader.network);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.payload as any).authorization.owner).toBe(
      mockUnsignedHeader.payload.authorization.owner,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.payload as any).authorization.spender).toBe(
      mockUnsignedHeader.payload.authorization.spender,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.payload as any).authorization.token).toBe(
      mockUnsignedHeader.payload.authorization.token,
    );
  });

  it("should throw an error if signing fails", async () => {
    const client = createTestClient();
    const error = new Error("Signing failed");
    vi.mocked(signPermit2).mockRejectedValue(error);

    await expect(
      signPaymentHeader(client, mockPaymentRequirements, mockUnsignedHeader),
    ).rejects.toThrow("Signing failed");
  });
});

describe("Permit2 createPaymentHeader", () => {
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
  };

  const mockSignature = "0x1234567890123456789012345678901234567890123456789012345678901234";
  const mockNonce = "10";

  const createTestClient = () => {
    const client = createSignerSepolia(
      "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
    );
    return client as unknown as SignerWallet;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signPermit2).mockResolvedValue({
      signature: mockSignature,
      nonce: mockNonce,
    });
  });

  it("should create and encode a Permit2 payment header", async () => {
    const client = createTestClient();
    const result = await createPaymentHeader(client, 1, mockPaymentRequirements);

    expect(result).toBe("encoded-payment-header");
    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: expect.objectContaining({
          authorizationType: "permit2",
          signature: mockSignature,
          authorization: expect.objectContaining({
            owner: client.account!.address,
            spender: mockPaymentRequirements.payTo,
            token: mockPaymentRequirements.asset,
            amount: mockPaymentRequirements.maxAmountRequired,
            nonce: mockNonce,
          }),
        }),
      }),
    );
  });

  it("should handle different x402 versions", async () => {
    const client = createTestClient();
    await createPaymentHeader(client, 2, mockPaymentRequirements);

    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 2,
      }),
    );
  });

  it("should throw an error if signing fails", async () => {
    const client = createTestClient();
    const error = new Error("Signing failed");
    vi.mocked(signPermit2).mockRejectedValue(error);

    await expect(createPaymentHeader(client, 1, mockPaymentRequirements)).rejects.toThrow(
      "Signing failed",
    );
  });

  it("should throw an error if encoding fails", async () => {
    const client = createTestClient();
    const error = new Error("Encoding failed");
    vi.mocked(encodePayment).mockImplementation(() => {
      throw error;
    });

    await expect(createPaymentHeader(client, 1, mockPaymentRequirements)).rejects.toThrow(
      "Encoding failed",
    );
  });
});
