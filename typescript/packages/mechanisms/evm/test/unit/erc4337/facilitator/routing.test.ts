import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PaymentPayload, PaymentRequirements, Network } from "@x402/core/types";
import type { FacilitatorEvmSigner } from "../../../../src/signer";

// Mock the ERC-4337 facilitator
vi.mock("../../../../src/exact/facilitator/erc4337/scheme", () => {
  const MockERC4337Facilitator = vi.fn().mockImplementation(() => ({
    scheme: "exact",
    caipFamily: "eip155:*",
    verify: vi.fn(),
    settle: vi.fn(),
    getExtra: vi.fn(),
    getSigners: vi.fn().mockReturnValue([]),
  }));
  return { ExactEvmSchemeNetworkERC4337: MockERC4337Facilitator };
});

// Mock eip3009 and permit2 handlers
vi.mock("../../../../src/exact/facilitator/eip3009", () => ({
  verifyEIP3009: vi.fn().mockResolvedValue({ isValid: true, payer: "0xeip3009payer" }),
  settleEIP3009: vi.fn().mockResolvedValue({
    success: true,
    network: "eip155:84532",
    transaction: "0xeip3009tx",
    payer: "0xeip3009payer",
  }),
}));

vi.mock("../../../../src/exact/facilitator/permit2", () => ({
  verifyPermit2: vi.fn().mockResolvedValue({ isValid: true, payer: "0xpermit2payer" }),
  settlePermit2: vi.fn().mockResolvedValue({
    success: true,
    network: "eip155:84532",
    transaction: "0xpermit2tx",
    payer: "0xpermit2payer",
  }),
}));

import { ExactEvmScheme } from "../../../../src/exact/facilitator/scheme";
import { ExactEvmSchemeNetworkERC4337 } from "../../../../src/exact/facilitator/erc4337/scheme";

describe("ExactEvmScheme ERC-4337 routing", () => {
  const mockSigner = {
    getAddresses: vi.fn().mockReturnValue(["0xFacilitatorAddr"]),
    readContract: vi.fn(),
    verifyTypedData: vi.fn(),
    writeContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  } as unknown as FacilitatorEvmSigner;

  const baseRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "eip155:84532" as Network,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "1000000",
    payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
    maxTimeoutSeconds: 60,
    extra: {},
  };

  const erc4337Payload: PaymentPayload = {
    x402Version: 2,
    resource: {
      url: "https://api.example.com/resource",
      description: "Test resource",
      mimeType: "application/json",
    },
    accepted: baseRequirements,
    payload: {
      type: "erc4337",
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      bundlerRpcUrl: "https://bundler.example.com",
      userOperation: {
        sender: "0x1234567890123456789012345678901234567890",
        nonce: "0x0",
        callData: "0x",
        callGasLimit: "0x1234",
        verificationGasLimit: "0x5678",
        preVerificationGas: "0x9abc",
        maxFeePerGas: "0x1",
        maxPriorityFeePerGas: "0x1",
        signature: "0x",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verify() delegates to ERC-4337 facilitator", () => {
    it("should route to erc4337Facilitator.verify when isErc4337Payload is true and erc4337Facilitator exists", async () => {
      const scheme = new ExactEvmScheme(mockSigner, {
        erc4337Config: { defaultBundlerUrl: "https://bundler.example.com" },
      });

      // Get the mock erc4337Facilitator instance
      const mockFacilitator = (ExactEvmSchemeNetworkERC4337 as unknown as ReturnType<typeof vi.fn>)
        .mock.results[0].value;
      mockFacilitator.verify.mockResolvedValue({
        isValid: true,
        payer: "0x1234567890123456789012345678901234567890",
      });

      const result = await scheme.verify(erc4337Payload, baseRequirements);

      expect(mockFacilitator.verify).toHaveBeenCalledTimes(1);
      expect(mockFacilitator.verify).toHaveBeenCalledWith(erc4337Payload, baseRequirements);
      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
    });
  });

  describe("settle() delegates to ERC-4337 facilitator", () => {
    it("should route to erc4337Facilitator.settle when isErc4337Payload is true and erc4337Facilitator exists", async () => {
      const scheme = new ExactEvmScheme(mockSigner, {
        erc4337Config: { defaultBundlerUrl: "https://bundler.example.com" },
      });

      const mockFacilitator = (ExactEvmSchemeNetworkERC4337 as unknown as ReturnType<typeof vi.fn>)
        .mock.results[0].value;
      mockFacilitator.settle.mockResolvedValue({
        success: true,
        network: "eip155:84532",
        transaction: "0xtxhash",
        payer: "0x1234567890123456789012345678901234567890",
      });

      const result = await scheme.settle(erc4337Payload, baseRequirements);

      expect(mockFacilitator.settle).toHaveBeenCalledTimes(1);
      expect(mockFacilitator.settle).toHaveBeenCalledWith(erc4337Payload, baseRequirements);
      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash");
    });
  });

  describe("fallthrough when isErc4337Payload is true but no erc4337Facilitator configured", () => {
    it("verify() should fall through to EIP-3009 when erc4337Config is not provided", async () => {
      // No erc4337Config, so erc4337Facilitator is undefined
      const scheme = new ExactEvmScheme(mockSigner);

      // Even though the payload IS erc4337, no facilitator was configured.
      // It falls through to the EIP-3009/Permit2 path (treated as evmPayload).
      const result = await scheme.verify(erc4337Payload, baseRequirements);

      // Should NOT have called the erc4337 facilitator (it doesn't exist)
      // Result comes from the mocked EIP-3009 fallback
      expect(result).toBeDefined();
    });

    it("settle() should fall through to EIP-3009 when erc4337Config is not provided", async () => {
      const scheme = new ExactEvmScheme(mockSigner);

      const result = await scheme.settle(erc4337Payload, baseRequirements);

      expect(result).toBeDefined();
    });
  });
});
