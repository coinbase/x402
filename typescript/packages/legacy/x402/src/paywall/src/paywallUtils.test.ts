import { describe, expect, it } from "vitest";

import type { PaymentRequirements } from "../../types/verify";
import {
  assertValidProviderConfig,
  choosePaymentRequirement,
  getNetworkDisplayName,
  isEvmNetwork,
  isSvmNetwork,
  normalizePaymentRequirements,
  validateProviderConfig,
} from "./paywallUtils";

const baseRequirement: PaymentRequirements = {
  scheme: "exact",
  network: "base",
  maxAmountRequired: "1000",
  resource: "https://example.com/protected",
  description: "Base resource",
  mimeType: "application/json",
  payTo: "0x0000000000000000000000000000000000000001",
  maxTimeoutSeconds: 60,
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  extra: {
    feePayer: "0x0000000000000000000000000000000000000003",
  },
};

const baseSepoliaRequirement: PaymentRequirements = {
  ...baseRequirement,
  network: "base-sepolia",
  description: "Base Sepolia resource",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const solanaRequirement: PaymentRequirements = {
  scheme: "exact",
  network: "solana",
  maxAmountRequired: "1000",
  resource: "https://example.com/solana",
  description: "Solana resource",
  mimeType: "application/json",
  payTo: "2Zt8RZ8kW1nWcJ6YyqHq9kTjY8QpM2R2t1xXUQ1e1VQa",
  maxTimeoutSeconds: 60,
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  extra: {
    feePayer: "3d9yxXikBVYjgvPbJF4dPSt31Z87Nb5fV9jXYzQ3QAtc",
  },
};

describe("paywallUtils", () => {
  it("normalizes single payment requirement into an array", () => {
    const normalized = normalizePaymentRequirements(baseRequirement);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toBe(baseRequirement);
  });

  it("selects first available payment from preferred networks on mainnet", () => {
    const selected = choosePaymentRequirement([baseRequirement, solanaRequirement], false);
    expect(["base", "solana"]).toContain(selected.network);
  });

  it("selects first available payment from preferred networks on testnet", () => {
    const selected = choosePaymentRequirement([baseSepoliaRequirement, solanaRequirement], true);
    expect(["base-sepolia", "solana-devnet"]).toContain(selected.network);
  });

  it("falls back to solana when no evm networks exist", () => {
    const selected = choosePaymentRequirement([solanaRequirement], false);
    expect(selected.network).toBe("solana");
  });

  it("returns display names for known networks", () => {
    expect(getNetworkDisplayName("base")).toBe("Base");
    expect(getNetworkDisplayName("solana-devnet")).toBe("Solana Devnet");
  });

  it("identifies supported network families", () => {
    expect(isEvmNetwork("base")).toBe(true);
    expect(isEvmNetwork("solana")).toBe(false);
    expect(isSvmNetwork("solana")).toBe(true);
    expect(isSvmNetwork("base")).toBe(false);
  });
});

describe("validateProviderConfig", () => {
  it("returns error when config is null or undefined", () => {
    const result = validateProviderConfig(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("x402 configuration is missing");
  });

  it("returns error when paymentRequirements is missing", () => {
    const result = validateProviderConfig({
      cdpClientKey: "test-key",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("paymentRequirements"))).toBe(true);
  });

  it("returns error when paymentRequirements is empty array", () => {
    const result = validateProviderConfig({
      cdpClientKey: "test-key",
      paymentRequirements: [],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("empty"))).toBe(true);
  });

  it("returns error when payment requirement is missing network", () => {
    const result = validateProviderConfig({
      cdpClientKey: "test-key",
      paymentRequirements: { scheme: "exact" } as PaymentRequirements,
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("network"))).toBe(true);
  });

  it("returns error when payment requirement is missing scheme", () => {
    const result = validateProviderConfig({
      cdpClientKey: "test-key",
      paymentRequirements: { network: "base" } as PaymentRequirements,
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("scheme"))).toBe(true);
  });

  it("returns error when cdpClientKey is missing and required", () => {
    const result = validateProviderConfig(
      { paymentRequirements: baseRequirement },
      { requireApiKey: true },
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("cdpClientKey"))).toBe(true);
  });

  it("returns warning when cdpClientKey is missing but not required", () => {
    const result = validateProviderConfig(
      { paymentRequirements: baseRequirement },
      { requireApiKey: false },
    );
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.includes("cdpClientKey"))).toBe(true);
  });

  it("returns warning when appName is missing", () => {
    const result = validateProviderConfig({
      paymentRequirements: baseRequirement,
      cdpClientKey: "test-key",
    });
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.includes("appName"))).toBe(true);
  });

  it("returns valid result for complete configuration", () => {
    const result = validateProviderConfig({
      paymentRequirements: baseRequirement,
      cdpClientKey: "test-key",
      appName: "Test App",
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("assertValidProviderConfig", () => {
  it("throws descriptive error for invalid config", () => {
    expect(() => assertValidProviderConfig(null)).toThrow(
      /OnchainKitProvider configuration is invalid/,
    );
  });

  it("throws error with numbered list of issues", () => {
    expect(() => assertValidProviderConfig(null)).toThrow(/1\./);
  });

  it("throws error with documentation link", () => {
    expect(() => assertValidProviderConfig(null)).toThrow(/github\.com\/coinbase\/x402/);
  });

  it("does not throw for valid config", () => {
    expect(() =>
      assertValidProviderConfig(
        {
          paymentRequirements: baseRequirement,
          cdpClientKey: "test-key",
        },
        { requireApiKey: true },
      ),
    ).not.toThrow();
  });
});
