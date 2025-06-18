import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { base, baseSepolia, sei, seiTestnet } from "viem/chains";
import { getChainConfig } from "./scripts";
import { PaymentRequirements } from "../types";

// Mock the global window object
declare global {
  interface Window {
    x402: {
      amount?: number;
      testnet?: boolean;
      paymentRequirements: Partial<PaymentRequirements>;
      currentUrl: string;
      config: {
        chainConfig: Record<
          string,
          {
            usdcAddress: string;
            usdcName: string;
          }
        >;
      };
    };
  }
}

describe("getChainConfig", () => {
  // Save original window object
  const originalWindow = global.window;

  beforeEach(() => {
    // Mock window object for testing
    global.window = {
      x402: {
        paymentRequirements: {},
        currentUrl: "https://example.com",
        config: {
          chainConfig: {},
        },
      },
    } as Window;
  });

  afterEach(() => {
    // Restore original window object
    global.window = originalWindow;
  });

  it("should return Base configuration when network is 'base'", () => {
    global.window.x402 = {
      paymentRequirements: { network: "base" },
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: base,
      network: "base",
      chainName: "Base",
    });
  });

  it("should return Base Sepolia configuration when network is 'base-sepolia'", () => {
    global.window.x402 = {
      paymentRequirements: { network: "base-sepolia" },
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: baseSepolia,
      network: "base-sepolia",
      chainName: "Base Sepolia",
    });
  });

  it("should return Sei configuration when network is 'sei'", () => {
    global.window.x402 = {
      paymentRequirements: { network: "sei" },
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: sei,
      network: "sei",
      chainName: "Sei",
    });
  });

  it("should return Sei Testnet configuration when network is 'sei-testnet'", () => {
    global.window.x402 = {
      paymentRequirements: { network: "sei-testnet" },
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: seiTestnet,
      network: "sei-testnet",
      chainName: "Sei Testnet",
    });
  });

  it("should default to Base when testnet is false and network is not specified", () => {
    global.window.x402 = {
      testnet: false,
      paymentRequirements: {},
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: base,
      network: "base",
      chainName: "Base",
    });
  });

  it("should default to Base Sepolia when testnet is true and network is not specified", () => {
    global.window.x402 = {
      testnet: true,
      paymentRequirements: {},
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: baseSepolia,
      network: "base-sepolia",
      chainName: "Base Sepolia",
    });
  });

  it("should handle array of payment requirements", () => {
    global.window.x402 = {
      paymentRequirements: [{ network: "sei" }],
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
    };

    const result = getChainConfig(window.x402);

    expect(result).toEqual({
      chain: sei,
      network: "sei",
      chainName: "Sei",
    });
  });

  it("should log a warning and default to fallback network when an unknown network is provided", () => {
    // Spy on console.warn
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    global.window.x402 = {
      paymentRequirements: { network: "unknown-network" },
      currentUrl: "https://example.com",
      config: { chainConfig: {} },
      testnet: true,
    };

    const result = getChainConfig(window.x402);

    // Should default to base-sepolia (the fallback for unknown networks)
    expect(result).toEqual({
      chain: baseSepolia,
      network: "base-sepolia",
      chainName: "Base Sepolia",
    });

    // Should have logged a warning
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Unknown network "unknown-network", defaulting to "base-sepolia"',
    );

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });
});
