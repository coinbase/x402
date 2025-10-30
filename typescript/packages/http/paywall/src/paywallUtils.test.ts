import { describe, expect, it } from "vitest";
import type { PaymentRequirements } from "x402/types";
import {
  choosePaymentRequirement,
  getNetworkDisplayName,
  isEvmNetwork,
  isSvmNetwork,
  normalizePaymentRequirements,
  isTestnetNetwork,
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
  describe("normalizePaymentRequirements", () => {
    it("normalizes single payment requirement into an array", () => {
      const normalized = normalizePaymentRequirements(baseRequirement);
      expect(normalized).toHaveLength(1);
      expect(normalized[0]).toBe(baseRequirement);
    });

    it("returns array as-is when already an array", () => {
      const requirements = [baseRequirement, solanaRequirement];
      const normalized = normalizePaymentRequirements(requirements);
      expect(normalized).toBe(requirements);
      expect(normalized).toHaveLength(2);
    });
  });

  describe("choosePaymentRequirement", () => {
    it("selects base payment on mainnet preference", () => {
      const selected = choosePaymentRequirement([solanaRequirement, baseRequirement], false);
      expect(selected.network).toBe("base");
    });

    it("selects base sepolia payment on testnet preference", () => {
      const selected = choosePaymentRequirement([solanaRequirement, baseSepoliaRequirement], true);
      expect(selected.network).toBe("base-sepolia");
    });

    it("falls back to solana when no evm networks exist", () => {
      const selected = choosePaymentRequirement([solanaRequirement], false);
      expect(selected.network).toBe("solana");
    });

    it("returns first requirement when no preferred networks match", () => {
      const customRequirement = { ...baseRequirement, network: "polygon" };
      const selected = choosePaymentRequirement([customRequirement], true);
      expect(selected).toBe(customRequirement);
    });
  });

  describe("getNetworkDisplayName", () => {
    it("returns display names for v1 legacy networks", () => {
      expect(getNetworkDisplayName("base")).toBe("Base");
      expect(getNetworkDisplayName("base-sepolia")).toBe("Base Sepolia");
      expect(getNetworkDisplayName("solana")).toBe("Solana");
      expect(getNetworkDisplayName("solana-devnet")).toBe("Solana Devnet");
    });

    it("returns display names for v2 CAIP-2 EVM networks", () => {
      expect(getNetworkDisplayName("eip155:8453")).toBe("Base");
      expect(getNetworkDisplayName("eip155:84532")).toBe("Base Sepolia");
      expect(getNetworkDisplayName("eip155:1")).toBe("EVM Chain 1");
    });

    it("returns display names for v2 CAIP-2 Solana networks", () => {
      expect(getNetworkDisplayName("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toContain("Solana");
    });

    it("returns network as-is for unknown networks", () => {
      expect(getNetworkDisplayName("unknown")).toBe("unknown");
    });
  });

  describe("isEvmNetwork", () => {
    it("identifies v1 legacy EVM networks", () => {
      expect(isEvmNetwork("base")).toBe(true);
      expect(isEvmNetwork("base-sepolia")).toBe(true);
      expect(isEvmNetwork("polygon")).toBe(true);
    });

    it("identifies v2 CAIP-2 EVM networks", () => {
      expect(isEvmNetwork("eip155:8453")).toBe(true);
      expect(isEvmNetwork("eip155:84532")).toBe(true);
      expect(isEvmNetwork("eip155:1")).toBe(true);
    });

    it("rejects non-EVM networks", () => {
      expect(isEvmNetwork("solana")).toBe(false);
      expect(isEvmNetwork("solana-devnet")).toBe(false);
      expect(isEvmNetwork("solana:5eykt")).toBe(false);
    });
  });

  describe("isSvmNetwork", () => {
    it("identifies v1 legacy Solana networks", () => {
      expect(isSvmNetwork("solana")).toBe(true);
      expect(isSvmNetwork("solana-devnet")).toBe(true);
    });

    it("identifies v2 CAIP-2 Solana networks", () => {
      expect(isSvmNetwork("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(true);
      expect(isSvmNetwork("solana:devnet")).toBe(true);
    });

    it("rejects non-Solana networks", () => {
      expect(isSvmNetwork("base")).toBe(false);
      expect(isSvmNetwork("eip155:8453")).toBe(false);
    });
  });

  describe("isTestnetNetwork", () => {
    it("identifies EVM testnets", () => {
      expect(isTestnetNetwork("base-sepolia")).toBe(true);
      expect(isTestnetNetwork("polygon-amoy")).toBe(true);
    });

    it("identifies Solana testnets", () => {
      expect(isTestnetNetwork("solana-devnet")).toBe(true);
    });

    it("rejects mainnets", () => {
      expect(isTestnetNetwork("base")).toBe(false);
      expect(isTestnetNetwork("solana")).toBe(false);
    });
  });
});

