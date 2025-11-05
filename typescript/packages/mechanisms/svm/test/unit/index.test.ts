import { describe, it, expect } from "vitest";
import {
  ExactSvmClient,
  ExactSvmFacilitator,
  ExactSvmService,
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

describe("@x402/svm", () => {
  it("should export main classes", () => {
    expect(ExactSvmClient).toBeDefined();
    expect(ExactSvmFacilitator).toBeDefined();
    expect(ExactSvmService).toBeDefined();
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

  describe("ExactSvmService", () => {
    const service = new ExactSvmService();

    describe("parsePrice", () => {
      it("should parse dollar string prices", () => {
        const result = service.parsePrice("$0.10", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000"); // 0.10 USDC = 100000 smallest units
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse simple number string prices", () => {
        const result = service.parsePrice("0.10", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse explicit USDC prices", () => {
        const result = service.parsePrice("0.10 USDC", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse USD as USDC", () => {
        const result = service.parsePrice("0.10 USD", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should parse number prices", () => {
        const result = service.parsePrice(0.1, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe(USDC_MAINNET_ADDRESS);
      });

      it("should use devnet USDC for devnet network", () => {
        const result = service.parsePrice("1.00", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
        expect(result.amount).toBe("1000000");
        expect(result.asset).toBe(USDC_DEVNET_ADDRESS);
      });

      it("should handle pre-parsed price objects", () => {
        const result = service.parsePrice(
          { amount: "123456", asset: "custom_token_address", extra: {} },
          "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        );
        expect(result.amount).toBe("123456");
        expect(result.asset).toBe("custom_token_address");
      });

      it("should throw for unsupported assets", () => {
        expect(() =>
          service.parsePrice("1.00 SOL", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
        ).toThrow("Unsupported asset");
      });

      it("should throw for invalid price formats", () => {
        expect(() =>
          service.parsePrice("not-a-price!", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
        ).toThrow("Invalid price format");
      });

      it("should throw for price objects without asset", () => {
        expect(() =>
          service.parsePrice(
            { amount: "123456" } as never,
            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          ),
        ).toThrow("Asset address must be specified");
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
        const result = await service.enhancePaymentRequirements(
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

  // Integration tests would require mocking Solana RPC and transaction signing
  describe("Integration (placeholder)", () => {
    it.todo("should create a valid payment payload with ExactSvmClient");
    it.todo("should verify a valid payment with ExactSvmFacilitator");
    it.todo("should reject invalid signatures");
    it.todo("should reject insufficient amounts");
    it.todo("should reject wrong recipients");
    it.todo("should reject expired transactions");
    it.todo("should settle valid payments");
    it.todo("should handle compute budget instructions");
    it.todo("should verify both SPL Token and Token-2022 transfers");
  });
});
