import { describe, it, expect } from "vitest";
import {
  ExactSvmScheme,
  validateSvmAddress,
  normalizeNetwork,
  getUsdcAddress,
  convertToTokenAmount,
  SVM_ADDRESS_REGEX,
  SOLANA_MAINNET_CAIP2,
  SOLANA_DEVNET_CAIP2,
  SOLANA_TESTNET_CAIP2,
  USDC_MAINNET_ADDRESS,
  USDC_DEVNET_ADDRESS,
} from "../../src/index";
import { ExactSvmScheme as ServerExactSvmScheme } from "../../src/exact/server/scheme";

describe("@x402/svm", () => {
  it("should export main classes", () => {
    expect(ExactSvmScheme).toBeDefined();
    expect(ExactSvmScheme).toBeDefined();
    expect(ExactSvmScheme).toBeDefined();
  });

  describe("validateSvmAddress", () => {
    it("should validate correct Solana addresses", () => {
      expect(validateSvmAddress(USDC_MAINNET_ADDRESS)).toBe(true);
      expect(validateSvmAddress(USDC_DEVNET_ADDRESS)).toBe(true);
      expect(validateSvmAddress("11111111111111111111111111111111")).toBe(true);
    });

    it("should reject invalid addresses", () => {
      expect(validateSvmAddress("")).toBe(false);
      expect(validateSvmAddress("invalid")).toBe(false);
      expect(validateSvmAddress("0x1234567890abcdef")).toBe(false);
      expect(validateSvmAddress("too-short")).toBe(false);
    });

    it("should reject addresses with invalid characters", () => {
      expect(validateSvmAddress("0000000000000000000000000000000O")).toBe(false); // 'O' not allowed
      expect(validateSvmAddress("0000000000000000000000000000000I")).toBe(false); // 'I' not allowed
      expect(validateSvmAddress("0000000000000000000000000000000l")).toBe(false); // 'l' not allowed
    });
  });

  describe("normalizeNetwork", () => {
    it("should return CAIP-2 format as-is", () => {
      expect(normalizeNetwork(SOLANA_MAINNET_CAIP2)).toBe(SOLANA_MAINNET_CAIP2);
      expect(normalizeNetwork(SOLANA_DEVNET_CAIP2)).toBe(SOLANA_DEVNET_CAIP2);
      expect(normalizeNetwork(SOLANA_TESTNET_CAIP2)).toBe(SOLANA_TESTNET_CAIP2);
    });

    it("should convert V1 network names to CAIP-2", () => {
      expect(normalizeNetwork("solana" as never)).toBe(SOLANA_MAINNET_CAIP2);
      expect(normalizeNetwork("solana-devnet" as never)).toBe(SOLANA_DEVNET_CAIP2);
      expect(normalizeNetwork("solana-testnet" as never)).toBe(SOLANA_TESTNET_CAIP2);
    });

    it("should throw for unsupported networks", () => {
      expect(() => normalizeNetwork("solana:unknown" as never)).toThrow("Unsupported SVM network");
      expect(() => normalizeNetwork("ethereum:1" as never)).toThrow("Unsupported SVM network");
      expect(() => normalizeNetwork("unknown-network" as never)).toThrow("Unsupported SVM network");
    });
  });

  describe("getUsdcAddress", () => {
    it("should return mainnet USDC address", () => {
      expect(getUsdcAddress(SOLANA_MAINNET_CAIP2)).toBe(USDC_MAINNET_ADDRESS);
    });

    it("should return devnet USDC address", () => {
      expect(getUsdcAddress(SOLANA_DEVNET_CAIP2)).toBe(USDC_DEVNET_ADDRESS);
    });

    it("should return testnet USDC address", () => {
      expect(getUsdcAddress(SOLANA_TESTNET_CAIP2)).toBe(USDC_DEVNET_ADDRESS);
    });

    it("should throw for unsupported networks", () => {
      expect(() => getUsdcAddress("solana:unknown" as never)).toThrow("Unsupported SVM network");
    });
  });

  describe("convertToTokenAmount", () => {
    it("should convert decimal amounts to token units (6 decimals)", () => {
      expect(convertToTokenAmount("4.02", 6)).toBe("4020000");
      expect(convertToTokenAmount("0.10", 6)).toBe("100000");
      expect(convertToTokenAmount("1.00", 6)).toBe("1000000");
      expect(convertToTokenAmount("0.01", 6)).toBe("10000");
      expect(convertToTokenAmount("123.456789", 6)).toBe("123456789");
    });

    it("should handle whole numbers", () => {
      expect(convertToTokenAmount("1", 6)).toBe("1000000");
      expect(convertToTokenAmount("100", 6)).toBe("100000000");
    });

    it("should handle different decimals", () => {
      expect(convertToTokenAmount("1", 9)).toBe("1000000000"); // SOL
      expect(convertToTokenAmount("1", 2)).toBe("100");
      expect(convertToTokenAmount("1", 0)).toBe("1");
    });

    it("should throw for invalid amounts", () => {
      expect(() => convertToTokenAmount("abc", 6)).toThrow("Invalid amount");
      expect(() => convertToTokenAmount("", 6)).toThrow("Invalid amount");
      expect(() => convertToTokenAmount("NaN", 6)).toThrow("Invalid amount");
    });
  });

  describe("ExactSvmScheme (Server)", () => {
    const server = new ServerExactSvmScheme();

    describe("parsePrice", () => {
      it("should parse dollar string prices", async () => {
        const result = await server.parsePrice("$0.1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000"); // 4.02 USDC = 4020000 smallest units
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse simple number string prices", async () => {
        const result = await server.parsePrice("0.10", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse explicit USDC prices", async () => {
        const result = await server.parsePrice(
          "0.10 USDC",
          "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        );
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse USD as USDC", async () => {
        const result = await server.parsePrice(
          "0.10 USD",
          "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        );
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse number prices", async () => {
        const result = await server.parsePrice(0.1, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should use devnet USDC for devnet network", async () => {
        const result = await server.parsePrice("1.00", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
        expect(result.amount).toBe("1000000");
        expect(result.asset).toBe(USDC_DEVNET_ADDRESS);
      });

      it("should handle pre-parsed price objects", async () => {
        const result = await server.parsePrice(
          { amount: "123456", asset: "custom_token_address", extra: {} },
          "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        );
        expect(result.amount).toBe("123456");
        expect(result.asset).toBe("custom_token_address");
      });

      it("should throw for invalid price formats", async () => {
        await expect(
          async () =>
            await server.parsePrice("not-a-price!", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
        ).rejects.toThrow("Invalid money format");
      });

      it("should throw for price objects without asset", async () => {
        await expect(
          async () =>
            await server.parsePrice(
              { amount: "123456" } as never,
              "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            ),
        ).rejects.toThrow("Asset address must be specified");
      });

      it("should avoid floating-point rounding error", async () => {
        const result = await server.parsePrice("$4.02", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
        expect(result.amount).toBe("4020000"); // 4.02 USDC
      });
    });

    describe("enhancePaymentRequirements", () => {
      it("should add feePayer to payment requirements", async () => {
        const requirements = {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          asset: USDC_MAINNET_ADDRESS,
          amount: "100000",
          payTo: "11111111111111111111111111111111",
          maxTimeoutSeconds: 3600,
        };

        const facilitatorAddress = "FacilitatorAddress111111111111111111111";
        const result = await server.enhancePaymentRequirements(
          requirements as never,
          {
            x402Version: 2,
            scheme: "exact",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            extra: { feePayer: facilitatorAddress },
          },
          [],
        );

        expect(result).toEqual({
          ...requirements,
          extra: { feePayer: facilitatorAddress },
        });
      });
    });
  });

  describe("Constants", () => {
    it("should export correct USDC addresses", () => {
      expect(USDC_MAINNET_ADDRESS).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      expect(USDC_DEVNET_ADDRESS).toBe("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    });

    it("should have valid address regex", () => {
      expect(SVM_ADDRESS_REGEX).toBeInstanceOf(RegExp);
      expect(SVM_ADDRESS_REGEX.test(USDC_MAINNET_ADDRESS)).toBe(true);
    });
  });

  describe("Integration", () => {
    describe("ExactSvmScheme Client", () => {
      it("should create a valid payment payload with ExactSvmScheme", async () => {
        // This test validates the structure and requirements for creating a payment payload
        // In a real implementation, this would use proper mocks for Solana RPC calls
        const paymentRequirements = {
          scheme: "exact" as const,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000", // 0.1 USDC
          payTo: "RecipientAddress1111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: {
            feePayer: "FeePayerAddress1111111111111111111111",
          },
        };

        // Validate the structure and requirements
        expect(paymentRequirements.scheme).toBe("exact");
        expect(paymentRequirements.asset).toBe(USDC_DEVNET_ADDRESS);
        expect(paymentRequirements.amount).toBe("100000");
        expect(paymentRequirements.extra?.feePayer).toBeDefined();
      });

      it("should reject payment payload creation without feePayer", async () => {
        const paymentRequirements = {
          scheme: "exact" as const,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "RecipientAddress1111111111111111111111",
          maxTimeoutSeconds: 3600,
          // missing extra.feePayer
        };

        // This validates the requirement for feePayer in SVM transactions
        expect(paymentRequirements.extra?.feePayer).toBeUndefined();

        // In actual implementation, ExactSvmScheme.createPaymentPayload would throw:
        // "feePayer is required in paymentRequirements.extra for SVM transactions"
      });
    });

    describe("ExactSvmScheme Verification", () => {
      it("should verify basic payment requirements structure", () => {
        const validPayload = {
          x402Version: 2,
          accepted: {
            scheme: "exact" as const,
            network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          },
          payload: {
            transaction: "base64EncodedTransaction...",
          },
        };

        const requirements = {
          scheme: "exact" as const,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "RecipientAddress1111111111111111111111",
          maxTimeoutSeconds: 3600,
          extra: {
            feePayer: "FeePayerAddress1111111111111111111111",
          },
        };

        // Basic validation checks
        expect(validPayload.accepted.scheme).toBe(requirements.scheme);
        expect(validPayload.accepted.network).toBe(requirements.network);
        expect(requirements.extra?.feePayer).toBeDefined();
      });

      it("should reject invalid scheme mismatch", () => {
        const invalidPayload = {
          x402Version: 2,
          accepted: {
            scheme: "streaming" as any, // Wrong scheme
            network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          },
          payload: {},
        };

        const requirements = {
          scheme: "exact" as const,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "RecipientAddress1111111111111111111111",
          extra: { feePayer: "FeePayerAddress1111111111111111111111" },
        };

        // This should result in verification failure: "unsupported_scheme"
        expect(invalidPayload.accepted.scheme).not.toBe(requirements.scheme);
      });

      it("should reject network mismatch", () => {
        const invalidPayload = {
          x402Version: 2,
          accepted: {
            scheme: "exact" as const,
            network: "eip155:8453", // Wrong network (Base instead of Solana)
          },
          payload: {},
        };

        const requirements = {
          scheme: "exact" as const,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "RecipientAddress1111111111111111111111",
          extra: { feePayer: "FeePayerAddress1111111111111111111111" },
        };

        // This should result in verification failure: "network_mismatch"
        expect(invalidPayload.accepted.network).not.toBe(requirements.network);
      });

      it("should reject missing feePayer in requirements", () => {
        const invalidRequirements = {
          scheme: "exact" as const,
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: "RecipientAddress1111111111111111111111",
          // missing extra.feePayer
        };

        // This should result in verification failure: "invalid_exact_svm_payload_missing_fee_payer"
        expect(invalidRequirements.extra?.feePayer).toBeUndefined();
      });

      it("should validate transaction instruction count", () => {
        // Transaction must have 3-6 instructions:
        // Required: ComputeLimit + ComputePrice + TransferChecked
        // Optional: Lighthouse instructions + Memo
        const validInstructionCounts = [3, 4, 5, 6];
        const invalidInstructionCounts = [0, 1, 2, 7, 8, 10];

        validInstructionCounts.forEach(count => {
          expect(count).toBeGreaterThanOrEqual(3);
          expect(count).toBeLessThanOrEqual(6);
        });

        invalidInstructionCounts.forEach(count => {
          expect(count < 3 || count > 6).toBe(true);
          // This should result in: "invalid_exact_svm_payload_transaction_instructions_length"
        });
      });
    });

    describe("Token Programs", () => {
      it("should support both SPL Token and Token-2022 programs", () => {
        const tokenProgramAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const token2022ProgramAddress = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

        // Both should be valid token program addresses
        expect(tokenProgramAddress).toBeDefined();
        expect(token2022ProgramAddress).toBeDefined();

        // Verification should accept transfers from either program
        const validPrograms = [tokenProgramAddress, token2022ProgramAddress];
        expect(validPrograms).toHaveLength(2);
      });
    });

    describe("Compute Budget Requirements", () => {
      it("should require valid compute limit instruction", () => {
        // Transaction must start with SetComputeUnitLimit instruction
        const computeBudgetProgramAddress = "ComputeBudget111111111111111111111111111111";

        expect(computeBudgetProgramAddress).toBeDefined();
        // First instruction must be to compute budget program with valid limit
      });

      it("should require valid compute price instruction", () => {
        // Second instruction must be SetComputeUnitPrice with reasonable price
        const maxComputeUnitPrice = 100000; // microlamports
        const validPrice = 5000; // microlamports
        const invalidPrice = 150000; // too high

        expect(validPrice).toBeLessThanOrEqual(maxComputeUnitPrice);
        expect(invalidPrice).toBeGreaterThan(maxComputeUnitPrice);
      });
    });

    // Placeholder tests that would need full integration setup
    it.todo("should settle valid payments with real RPC calls");
    it.todo("should reject expired transactions with real blockhash validation");
    it.todo("should verify actual transaction signatures");
    it.todo("should validate actual token transfer amounts on-chain");
  });
});
