import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaymentHeader } from "./createPaymentHeader";
import { PaymentRequirements } from "../types/verify";
import * as exactEvmClient from "../schemes/exact/evm/client";
import * as exactEvmPermitClient from "../schemes/exact/evm/permit-client";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createWalletClient, http } from "viem";

vi.mock("../schemes/exact/evm/client", () => ({
  createPaymentHeader: vi.fn(),
}));

vi.mock("../schemes/exact/evm/permit-client", () => ({
  createPermitPaymentHeader: vi.fn(),
}));

describe("createPaymentHeader - Signature Type Auto-Detection", () => {
  const testPrivateKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
  let evmSigner: ReturnType<typeof createWalletClient>;
  let basePaymentRequirements: PaymentRequirements;

  beforeEach(() => {
    // Create a test wallet client
    const account = privateKeyToAccount(testPrivateKey);
    evmSigner = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    });

    // Base payment requirements for testing
    basePaymentRequirements = {
      scheme: "exact",
      network: "base-sepolia",
      payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      maxAmountRequired: "1000000",
      resource: "http://example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      maxTimeoutSeconds: 60,
      extra: {
        name: "USD Coin",
        version: "2",
      },
    };

    // Clear mocks before each test
    vi.clearAllMocks();
  });

  describe("Authorization (EIP-3009) Flow", () => {
    it("should use authorization when signatureType is 'authorization'", async () => {
      // Arrange
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          ...basePaymentRequirements.extra,
          signatureType: "authorization" as const,
        },
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue(
        "mock_authorization_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, paymentRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledWith(
        evmSigner,
        1,
        paymentRequirements,
      );
      expect(exactEvmPermitClient.createPermitPaymentHeader).not.toHaveBeenCalled();
      expect(result).toBe("mock_authorization_header");
    });

    it("should use authorization by default when signatureType is not specified", async () => {
      // Arrange - no signatureType in extra
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue(
        "mock_default_authorization_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, basePaymentRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledWith(
        evmSigner,
        1,
        basePaymentRequirements,
      );
      expect(exactEvmPermitClient.createPermitPaymentHeader).not.toHaveBeenCalled();
      expect(result).toBe("mock_default_authorization_header");
    });

    it("should use authorization when extra is undefined", async () => {
      // Arrange
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: undefined,
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue(
        "mock_no_extra_authorization_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, paymentRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmPermitClient.createPermitPaymentHeader).not.toHaveBeenCalled();
      expect(result).toBe("mock_no_extra_authorization_header");
    });
  });

  describe("Permit (ERC-2612) Flow", () => {
    it("should use permit when signatureType is 'permit'", async () => {
      // Arrange
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          ...basePaymentRequirements.extra,
          signatureType: "permit" as const,
        },
      };
      vi.mocked(exactEvmPermitClient.createPermitPaymentHeader).mockResolvedValue(
        "mock_permit_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, paymentRequirements);

      // Assert
      expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalledWith(
        evmSigner,
        1,
        paymentRequirements,
      );
      expect(exactEvmClient.createPaymentHeader).not.toHaveBeenCalled();
      expect(result).toBe("mock_permit_header");
    });

    it("should use permit with facilitatorAddress when provided", async () => {
      // Arrange
      const facilitatorAddress = "0x1234567890123456789012345678901234567890";
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          ...basePaymentRequirements.extra,
          signatureType: "permit" as const,
          facilitatorAddress,
        },
      };
      vi.mocked(exactEvmPermitClient.createPermitPaymentHeader).mockResolvedValue(
        "mock_permit_with_facilitator_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, paymentRequirements);

      // Assert
      expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalledWith(
        evmSigner,
        1,
        expect.objectContaining({
          extra: expect.objectContaining({
            facilitatorAddress,
          }),
        }),
      );
      expect(result).toBe("mock_permit_with_facilitator_header");
    });
  });

  describe("Backward Compatibility", () => {
    it("should maintain backward compatibility with existing code", async () => {
      // Arrange - old-style payment requirements without signatureType
      const oldStyleRequirements = {
        scheme: "exact" as const,
        network: "base-sepolia" as const,
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "1000000",
        resource: "http://example.com/resource" as const,
        description: "Test payment",
        mimeType: "application/json",
        maxTimeoutSeconds: 60,
        extra: {
          name: "USD Coin",
          version: "2",
          // No signatureType specified
        },
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue(
        "mock_backward_compatible_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, oldStyleRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmPermitClient.createPermitPaymentHeader).not.toHaveBeenCalled();
      expect(result).toBe("mock_backward_compatible_header");
    });

    it("should work with minimal payment requirements", async () => {
      // Arrange - minimal requirements
      const minimalRequirements: PaymentRequirements = {
        scheme: "exact",
        network: "base-sepolia",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "1000000",
        resource: "http://example.com/resource",
        description: "",
        mimeType: "",
        maxTimeoutSeconds: 60,
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue("mock_minimal_header");

      // Act
      const result = await createPaymentHeader(evmSigner, 1, minimalRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(result).toBe("mock_minimal_header");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty extra object", async () => {
      // Arrange
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {},
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue("mock_empty_extra_header");

      // Act
      const result = await createPaymentHeader(evmSigner, 1, paymentRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(result).toBe("mock_empty_extra_header");
    });

    it("should handle extra with only name and version (no signatureType)", async () => {
      // Arrange
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          name: "Test Token",
          version: "1",
        },
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue("mock_name_version_header");

      // Act
      const result = await createPaymentHeader(evmSigner, 1, paymentRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmPermitClient.createPermitPaymentHeader).not.toHaveBeenCalled();
      expect(result).toBe("mock_name_version_header");
    });

    it("should handle different networks correctly", async () => {
      // Arrange
      const networks = ["base", "base-sepolia", "polygon", "polygon-amoy"] as const;
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue("mock_network_header");

      // Act & Assert
      for (const network of networks) {
        const paymentRequirements = {
          ...basePaymentRequirements,
          network,
        };

        await createPaymentHeader(evmSigner, 1, paymentRequirements);

        expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledWith(
          evmSigner,
          1,
          expect.objectContaining({ network }),
        );

        vi.clearAllMocks();
      }
    });
  });

  describe("Type Safety", () => {
    it("should accept valid signatureType values", async () => {
      // Arrange
      const validTypes = ["authorization", "permit"] as const;
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue("mock_auth_header");
      vi.mocked(exactEvmPermitClient.createPermitPaymentHeader).mockResolvedValue(
        "mock_permit_header",
      );

      // Act & Assert
      for (const signatureType of validTypes) {
        const paymentRequirements = {
          ...basePaymentRequirements,
          extra: {
            ...basePaymentRequirements.extra,
            signatureType,
          },
        };

        await createPaymentHeader(evmSigner, 1, paymentRequirements);

        if (signatureType === "authorization") {
          expect(exactEvmClient.createPaymentHeader).toHaveBeenCalled();
        } else {
          expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalled();
        }

        vi.clearAllMocks();
      }
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete authorization flow with all extra fields", async () => {
      // Arrange
      const completeAuthRequirements = {
        ...basePaymentRequirements,
        extra: {
          name: "USD Coin",
          version: "2",
          signatureType: "authorization" as const,
          facilitatorAddress: "0x1234567890123456789012345678901234567890",
        },
      };
      vi.mocked(exactEvmClient.createPaymentHeader).mockResolvedValue("mock_complete_auth_header");

      // Act
      const result = await createPaymentHeader(evmSigner, 1, completeAuthRequirements);

      // Assert
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmClient.createPaymentHeader).toHaveBeenCalledWith(
        evmSigner,
        1,
        completeAuthRequirements,
      );
      expect(result).toBe("mock_complete_auth_header");
    });

    it("should handle complete permit flow with all extra fields", async () => {
      // Arrange
      const completePermitRequirements = {
        ...basePaymentRequirements,
        extra: {
          name: "Test Token",
          version: "1",
          signatureType: "permit" as const,
          facilitatorAddress: "0x9876543210987654321098765432109876543210",
        },
      };
      vi.mocked(exactEvmPermitClient.createPermitPaymentHeader).mockResolvedValue(
        "mock_complete_permit_header",
      );

      // Act
      const result = await createPaymentHeader(evmSigner, 1, completePermitRequirements);

      // Assert
      expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalledTimes(1);
      expect(exactEvmPermitClient.createPermitPaymentHeader).toHaveBeenCalledWith(
        evmSigner,
        1,
        completePermitRequirements,
      );
      expect(result).toBe("mock_complete_permit_header");
    });
  });
});
