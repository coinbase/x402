import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PaymentRequirements, Network } from "@x402/core/types";
import { ExactEvmSchemeERC4337 } from "../../../../src/exact/server/erc4337";
import { SUPPORTED_CHAINS } from "../../../../src/erc4337/networks/registry";

describe("ExactEvmSchemeERC4337 (server)", () => {
  let scheme: ExactEvmSchemeERC4337;

  beforeEach(() => {
    vi.clearAllMocks();
    scheme = new ExactEvmSchemeERC4337();
  });

  describe("constructor", () => {
    it("should patch getDefaultAsset for all registry chains", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getDefaultAsset = (scheme as any).getDefaultAsset;
      expect(typeof getDefaultAsset).toBe("function");

      // Verify it works for every chain in the registry
      for (const chain of Object.values(SUPPORTED_CHAINS)) {
        const asset = getDefaultAsset(chain.caip2);
        expect(asset).toBeDefined();
        expect(asset.address).toBe(chain.usdcAddress);
        expect(asset.name).toBe("USDC");
        expect(asset.version).toBe("2");
        expect(asset.decimals).toBe(6);
      }
    });
  });

  describe("getDefaultAsset", () => {
    it("should return correct USDC for Base (eip155:8453)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (scheme as any).getDefaultAsset("eip155:8453");
      expect(asset.address).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      expect(asset.name).toBe("USDC");
      expect(asset.version).toBe("2");
      expect(asset.decimals).toBe(6);
    });

    it("should return correct USDC for Base Sepolia (eip155:84532)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (scheme as any).getDefaultAsset("eip155:84532");
      expect(asset.address).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
      expect(asset.name).toBe("USDC");
      expect(asset.version).toBe("2");
      expect(asset.decimals).toBe(6);
    });

    it("should return correct USDC for Optimism (eip155:10)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (scheme as any).getDefaultAsset("eip155:10");
      expect(asset.address).toBe("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85");
      expect(asset.name).toBe("USDC");
      expect(asset.version).toBe("2");
      expect(asset.decimals).toBe(6);
    });

    it("should return correct USDC for Optimism Sepolia (eip155:11155420)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (scheme as any).getDefaultAsset("eip155:11155420");
      expect(asset.address).toBe("0x5fd84259d66Cd46123540766Be93DFE6D43130D7");
      expect(asset.name).toBe("USDC");
      expect(asset.version).toBe("2");
      expect(asset.decimals).toBe(6);
    });

    it("should return correct USDC for Arbitrum (eip155:42161)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (scheme as any).getDefaultAsset("eip155:42161");
      expect(asset.address).toBe("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
      expect(asset.name).toBe("USDC");
      expect(asset.version).toBe("2");
      expect(asset.decimals).toBe(6);
    });

    it("should return correct USDC for Arbitrum Sepolia (eip155:421614)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (scheme as any).getDefaultAsset("eip155:421614");
      expect(asset.address).toBe("0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d");
      expect(asset.name).toBe("USDC");
      expect(asset.version).toBe("2");
      expect(asset.decimals).toBe(6);
    });

    it("should throw for unknown network", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getDefaultAsset = (scheme as any).getDefaultAsset;
      expect(() => getDefaultAsset("eip155:999999")).toThrow(
        "No default asset configured for network eip155:999999",
      );
    });

    it("should throw for invalid CAIP-2 format", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getDefaultAsset = (scheme as any).getDefaultAsset;
      expect(() => getDefaultAsset("invalid-network")).toThrow();
    });
  });

  describe("enhancePaymentRequirements", () => {
    const basePaymentRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "eip155:84532" as Network,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount: "1000000",
      payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
      maxTimeoutSeconds: 60,
      extra: {},
    };

    const supportedKind = {
      x402Version: 2,
      scheme: "exact",
      network: "eip155:84532" as Network,
    };

    it("should preserve userOperation from paymentRequirements.extra", async () => {
      const requirementsWithUserOp: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
            entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          },
        },
      };

      const result = await scheme.enhancePaymentRequirements(
        requirementsWithUserOp,
        supportedKind,
        [],
      );

      expect(result.extra).toBeDefined();
      expect(result.extra!.userOperation).toBeDefined();
      expect(result.extra!.userOperation).toEqual({
        supported: true,
        bundlerUrl: "https://bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });
    });

    it("should ensure extra exists when missing and no userOperation", async () => {
      const requirementsWithoutExtra: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: undefined,
      };

      const result = await scheme.enhancePaymentRequirements(
        requirementsWithoutExtra,
        supportedKind,
        [],
      );

      expect(result.extra).toBeDefined();
      expect(result.extra).toEqual({});
    });

    it("should preserve existing extra fields alongside userOperation", async () => {
      const requirementsWithMixedExtra: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          customField: "customValue",
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      };

      const result = await scheme.enhancePaymentRequirements(
        requirementsWithMixedExtra,
        supportedKind,
        [],
      );

      expect(result.extra).toBeDefined();
      expect(result.extra!.userOperation).toEqual({
        supported: true,
        bundlerUrl: "https://bundler.example.com",
      });
    });

    it("should return enhanced requirements as-is when extra exists but no userOperation", async () => {
      const requirementsWithExtraNoUserOp: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          someField: "someValue",
        },
      };

      const result = await scheme.enhancePaymentRequirements(
        requirementsWithExtraNoUserOp,
        supportedKind,
        [],
      );

      expect(result.extra).toBeDefined();
      expect(result.extra!.someField).toBe("someValue");
      expect(result.extra!.userOperation).toBeUndefined();
    });

    it("should not inject userOperation when supported is false", async () => {
      const requirementsWithUnsupported: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: false,
          },
        },
      };

      const result = await scheme.enhancePaymentRequirements(
        requirementsWithUnsupported,
        supportedKind,
        [],
      );

      // extractUserOperationCapability returns undefined when supported !== true
      // so the code does NOT re-inject userOperation via the capability path.
      // The original extra (including the unsupported userOperation) passes through unchanged.
      expect(result.extra).toBeDefined();
      expect(result.extra!.userOperation).toEqual({ supported: false });
    });

    it("should pass extensionKeys through to parent enhancePaymentRequirements", async () => {
      // The parent ExactEvmScheme.enhancePaymentRequirements currently passes through
      // requirements as-is (voiding extensionKeys), but our override receives them.
      // When extra has values matching extensionKeys, the result should still preserve
      // the original extra fields unchanged.
      const requirementsWithExtensions: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          myExtension: "extensionValue",
          anotherExtension: { nested: true },
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      };

      const result = await scheme.enhancePaymentRequirements(
        requirementsWithExtensions,
        supportedKind,
        ["myExtension", "anotherExtension"],
      );

      // extensionKeys should not affect the result (parent passes through as-is)
      // but userOperation should be preserved
      expect(result.extra).toBeDefined();
      expect(result.extra!.userOperation).toEqual({
        supported: true,
        bundlerUrl: "https://bundler.example.com",
      });
      // The original extension fields should still be present
      expect(result.extra!.myExtension).toBe("extensionValue");
      expect(result.extra!.anotherExtension).toEqual({ nested: true });
    });
  });
});
