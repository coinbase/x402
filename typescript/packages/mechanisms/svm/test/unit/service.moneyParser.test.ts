import { describe, it, expect } from "vitest";
import { ExactSvmService } from "../../src/exact";
import { MoneyParser } from "@x402/core/types";

describe("ExactSvmService - registerMoneyParser", () => {
  describe("Single custom parser", () => {
    it("should use custom parser for Money values", async () => {
      const service = new ExactSvmService();

      const customParser: MoneyParser = async (amount, _network) => {
        // Custom logic: different conversion for large amounts
        if (amount > 100) {
          return {
            amount: (amount * 1e9).toString(), // Custom decimals
            asset: "CustomTokenMint1111111111111111111111",
            extra: { token: "CUSTOM", tier: "large" },
          };
        }
        return null; // Use default for small amounts
      };

      service.registerMoneyParser(customParser);

      // Large amount should use custom parser
      const result1 = await service.parsePrice(150, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(result1.asset).toBe("CustomTokenMint1111111111111111111111");
      expect(result1.extra?.token).toBe("CUSTOM");
      expect(result1.amount).toBe((150 * 1e9).toString());

      // Small amount should fall back to default (USDC)
      const result2 = await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(result2.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Mainnet USDC
      expect(result2.amount).toBe("50000000"); // 50 * 1e6
    });

    it("should receive decimal number, not raw string", async () => {
      const service = new ExactSvmService();
      let receivedAmount: number | null = null;
      let receivedNetwork: string | null = null;

      service.registerMoneyParser(async (amount, network) => {
        receivedAmount = amount;
        receivedNetwork = network;
        return null; // Use default
      });

      await service.parsePrice("$1.50", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(receivedAmount).toBe(1.5);
      expect(receivedNetwork).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      await service.parsePrice("5.25", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(receivedAmount).toBe(5.25);

      await service.parsePrice(10.99, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(receivedAmount).toBe(10.99);
    });

    it("should not call parser for AssetAmount (pass-through)", async () => {
      const service = new ExactSvmService();
      let parserCalled = false;

      service.registerMoneyParser(async (_amount, _network) => {
        parserCalled = true;
        return null;
      });

      const assetAmount = {
        amount: "100000",
        asset: "TokenMint1111111111111111111111111111",
        extra: { custom: true },
      };

      const result = await service.parsePrice(
        assetAmount,
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      );

      expect(parserCalled).toBe(false); // Parser not called for AssetAmount
      expect(result).toEqual(assetAmount);
    });

    it("should support async parsers", async () => {
      const service = new ExactSvmService();

      service.registerMoneyParser(async (amount, _network) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 5));

        return {
          amount: (amount * 1e6).toString(),
          asset: "AsyncTokenMint111111111111111111111",
          extra: { async: true },
        };
      });

      const result = await service.parsePrice(5, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      expect(result.asset).toBe("AsyncTokenMint111111111111111111111");
      expect(result.extra?.async).toBe(true);
    });

    it("should fall back to default if parser returns null", async () => {
      const service = new ExactSvmService();

      service.registerMoneyParser(async _amount => {
        return null; // Always delegate
      });

      const result = await service.parsePrice(1, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      // Should use default Solana mainnet USDC
      expect(result.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      expect(result.amount).toBe("1000000");
    });
  });

  describe("Multiple parsers - chain of responsibility", () => {
    it("should try parsers in registration order", async () => {
      const service = new ExactSvmService();
      const executionOrder: number[] = [];

      service
        .registerMoneyParser(async amount => {
          executionOrder.push(1);
          if (amount > 1000) return { amount: "1", asset: "Parser1Token", extra: {} };
          return null;
        })
        .registerMoneyParser(async amount => {
          executionOrder.push(2);
          if (amount > 100) return { amount: "2", asset: "Parser2Token", extra: {} };
          return null;
        })
        .registerMoneyParser(async _amount => {
          executionOrder.push(3);
          return { amount: "3", asset: "Parser3Token", extra: {} };
        });

      await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      expect(executionOrder).toEqual([1, 2, 3]); // All tried
    });

    it("should stop at first non-null result", async () => {
      const service = new ExactSvmService();
      const executionOrder: number[] = [];

      service
        .registerMoneyParser(async _amount => {
          executionOrder.push(1);
          return null;
        })
        .registerMoneyParser(async _amount => {
          executionOrder.push(2);
          return { amount: "winner", asset: "WinnerToken", extra: {} };
        })
        .registerMoneyParser(async _amount => {
          executionOrder.push(3); // Should not execute
          return { amount: "3", asset: "Parser3Token", extra: {} };
        });

      const result = await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      expect(executionOrder).toEqual([1, 2]); // Stopped after parser 2
      expect(result.asset).toBe("WinnerToken");
    });

    it("should use default if all parsers return null", async () => {
      const service = new ExactSvmService();

      service
        .registerMoneyParser(async () => null)
        .registerMoneyParser(async () => null)
        .registerMoneyParser(async () => null);

      const result = await service.parsePrice(1, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      // Should use default Solana mainnet USDC
      expect(result.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      expect(result.amount).toBe("1000000");
    });
  });

  describe("Error handling", () => {
    it("should propagate errors from parser", async () => {
      const service = new ExactSvmService();

      service.registerMoneyParser(async _amount => {
        throw new Error("Parser error: amount exceeds limit");
      });

      await expect(
        async () => await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Parser error: amount exceeds limit");
    });

    it("should throw for invalid money format", async () => {
      const service = new ExactSvmService();

      await expect(
        async () =>
          await service.parsePrice("not-a-number", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Invalid money format");
    });

    it("should throw for NaN values", async () => {
      const service = new ExactSvmService();

      await expect(
        async () => await service.parsePrice("xyz", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Invalid money format");
    });
  });

  describe("Real-world use cases", () => {
    it("should support network-specific tokens", async () => {
      const service = new ExactSvmService();

      service.registerMoneyParser(async (amount, _network) => {
        // Mainnet uses USDC, devnet uses custom test token
        if (_network.includes("EtWTRA")) {
          // Devnet
          return {
            amount: (amount * 1e6).toString(),
            asset: "TestTokenMint1111111111111111111111",
            extra: { network: "devnet", token: "TEST" },
          };
        }
        return null; // Use default for mainnet
      });

      const devnetResult = await service.parsePrice(10, "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
      expect(devnetResult.extra?.network).toBe("devnet");
      expect(devnetResult.asset).toBe("TestTokenMint1111111111111111111111");

      const mainnetResult = await service.parsePrice(10, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(mainnetResult.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Default
    });

    it("should support tiered pricing", async () => {
      const service = new ExactSvmService();

      service
        .registerMoneyParser(async amount => {
          if (amount > 1000) {
            return {
              amount: (amount * 1e9).toString(), // Different decimals
              asset: "PremiumTokenMint11111111111111111",
              extra: { tier: "premium" },
            };
          }
          return null;
        })
        .registerMoneyParser(async amount => {
          if (amount > 100) {
            return {
              amount: (amount * 1e6).toString(),
              asset: "StandardTokenMint1111111111111111",
              extra: { tier: "standard" },
            };
          }
          return null;
        });
      // < 100 uses default

      const premium = await service.parsePrice(2000, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(premium.extra?.tier).toBe("premium");

      const standard = await service.parsePrice(500, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(standard.extra?.tier).toBe("standard");

      const basic = await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(basic.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Default USDC
    });

    it("should support dynamic exchange rates with metadata", async () => {
      const service = new ExactSvmService();

      const mockRate = 0.98; // 1 USD = 0.98 USDC (fee included)

      service.registerMoneyParser(async (amount, _network) => {
        const usdcAmount = amount * mockRate;
        const timestamp = Date.now();

        return {
          amount: Math.floor(usdcAmount * 1e6).toString(),
          asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          extra: {
            exchangeRate: mockRate,
            originalUSD: amount,
            convertedUSDC: usdcAmount,
            timestamp,
            fee: amount - usdcAmount,
          },
        };
      });

      const result = await service.parsePrice(100, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      // 100 USD * 0.98 = 98 USDC
      expect(result.amount).toBe("98000000");
      expect(result.extra?.exchangeRate).toBe(0.98);
      expect(result.extra?.originalUSD).toBe(100);
      expect(result.extra?.convertedUSDC).toBe(98);
      expect(result.extra?.fee).toBe(2);
    });
  });

  describe("Multiple parsers - chain of responsibility", () => {
    it("should execute parsers in registration order", async () => {
      const service = new ExactSvmService();
      const executionOrder: number[] = [];

      service
        .registerMoneyParser(async amount => {
          executionOrder.push(1);
          if (amount > 1000) return { amount: "1", asset: "Token1", extra: {} };
          return null;
        })
        .registerMoneyParser(async amount => {
          executionOrder.push(2);
          if (amount > 100) return { amount: "2", asset: "Token2", extra: {} };
          return null;
        })
        .registerMoneyParser(async _amount => {
          executionOrder.push(3);
          return { amount: "3", asset: "Token3", extra: {} };
        });

      await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      expect(executionOrder).toEqual([1, 2, 3]); // All tried until success
    });

    it("should stop at first non-null result", async () => {
      const service = new ExactSvmService();
      const executionOrder: number[] = [];

      service
        .registerMoneyParser(async _amount => {
          executionOrder.push(1);
          return null;
        })
        .registerMoneyParser(async _amount => {
          executionOrder.push(2);
          return { amount: "winner", asset: "WinnerToken", extra: {} };
        })
        .registerMoneyParser(async _amount => {
          executionOrder.push(3); // Should not execute
          return { amount: "3", asset: "Token3", extra: {} };
        });

      const result = await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      expect(executionOrder).toEqual([1, 2]); // Stopped after parser 2
      expect(result.asset).toBe("WinnerToken");
    });

    it("should use default if all parsers return null", async () => {
      const service = new ExactSvmService();

      service
        .registerMoneyParser(async () => null)
        .registerMoneyParser(async () => null)
        .registerMoneyParser(async () => null);

      const result = await service.parsePrice(1, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      // Should use default Solana mainnet USDC
      expect(result.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      expect(result.amount).toBe("1000000");
    });

    it("should handle different networks in chain", async () => {
      const service = new ExactSvmService();

      service
        .registerMoneyParser(async (amount, network) => {
          // Devnet-specific logic
          if (network.includes("EtWTRA")) {
            return {
              amount: (amount * 1e6).toString(),
              asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
              extra: { network: "devnet" },
            };
          }
          return null;
        })
        .registerMoneyParser(async (amount, network) => {
          // Mainnet-specific logic
          if (network.includes("5eykt")) {
            return {
              amount: (amount * 1e6).toString(),
              asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              extra: { network: "mainnet" },
            };
          }
          return null;
        });

      const devnetResult = await service.parsePrice(10, "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
      expect(devnetResult.extra?.network).toBe("devnet");

      const mainnetResult = await service.parsePrice(10, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(mainnetResult.extra?.network).toBe("mainnet");
    });
  });

  describe("Error handling", () => {
    it("should propagate errors from parser", async () => {
      const service = new ExactSvmService();

      service.registerMoneyParser(async _amount => {
        throw new Error("Parser error: invalid configuration");
      });

      await expect(
        async () => await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Parser error: invalid configuration");
    });

    it("should throw for invalid money format", async () => {
      const service = new ExactSvmService();

      await expect(
        async () =>
          await service.parsePrice("invalid-number", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Invalid money format");
    });

    it("should propagate errors even with multiple parsers", async () => {
      const service = new ExactSvmService();

      service
        .registerMoneyParser(async () => null) // Skip
        .registerMoneyParser(async () => {
          throw new Error("Second parser failed");
        });

      await expect(
        async () => await service.parsePrice(50, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Second parser failed");
    });
  });

  describe("Chaining and fluent API", () => {
    it("should return this for chaining", () => {
      const service = new ExactSvmService();

      const parser1: MoneyParser = async () => null;
      const parser2: MoneyParser = async () => null;

      const result = service.registerMoneyParser(parser1).registerMoneyParser(parser2);

      expect(result).toBe(service);
    });
  });

  describe("Edge cases", () => {
    it("should handle zero amounts", async () => {
      const service = new ExactSvmService();
      let receivedAmount: number | null = null;

      service.registerMoneyParser(async amount => {
        receivedAmount = amount;
        return null;
      });

      await service.parsePrice(0, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(receivedAmount).toBe(0);
    });

    it("should handle very small decimal amounts", async () => {
      const service = new ExactSvmService();
      let receivedAmount: number | null = null;

      service.registerMoneyParser(async amount => {
        receivedAmount = amount;
        return null;
      });

      await service.parsePrice(0.000001, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(receivedAmount).toBe(0.000001);
    });

    it("should handle very large amounts", async () => {
      const service = new ExactSvmService();
      let receivedAmount: number | null = null;

      service.registerMoneyParser(async amount => {
        receivedAmount = amount;
        return null;
      });

      await service.parsePrice(999999999.99, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(receivedAmount).toBe(999999999.99);
    });

    it("should handle negative amounts (parser can validate)", async () => {
      const service = new ExactSvmService();

      service.registerMoneyParser(async amount => {
        if (amount < 0) {
          throw new Error("Negative amounts not supported");
        }
        return null;
      });

      await expect(
        async () => await service.parsePrice(-10, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
      ).rejects.toThrow("Negative amounts not supported");
    });
  });

  describe("Integration with parsePrice flow", () => {
    it("should work with all Money input formats", async () => {
      const service = new ExactSvmService();
      const callLog: Array<{ amount: number; input: any }> = [];

      service.registerMoneyParser(async amount => {
        callLog.push({ amount, input: amount });
        return null; // Use default
      });

      await service.parsePrice("$10.50", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      await service.parsePrice("25.75", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      await service.parsePrice(42.25, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

      expect(callLog).toHaveLength(3);
      expect(callLog[0].amount).toBe(10.5);
      expect(callLog[1].amount).toBe(25.75);
      expect(callLog[2].amount).toBe(42.25);
    });
  });
});
