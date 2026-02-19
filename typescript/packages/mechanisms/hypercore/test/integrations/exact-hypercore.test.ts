import { describe, it, expect } from "vitest";
import { ExactHypercoreScheme as ClientScheme } from "../../src/exact/client/scheme.js";
import { ExactHypercoreScheme as ServerScheme } from "../../src/exact/server/scheme.js";
import { ExactHypercoreScheme as FacilitatorScheme } from "../../src/exact/facilitator/scheme.js";
import type { HyperliquidSigner } from "../../src/exact/types.js";

describe("Hypercore Exact Scheme Integration", () => {
  const mockSigner: HyperliquidSigner = {
    signSendAsset: async _action => {
      return {
        r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
        v: 27,
      };
    },
    getAddress: () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  };

  it("should create and verify payment payload", async () => {
    const client = new ClientScheme(mockSigner);
    const server = new ServerScheme();
    const facilitator = new FacilitatorScheme({
      apiUrl: "https://api.hyperliquid.xyz",
    });

    const assetAmount = await server.parsePrice("$0.01", "hypercore:mainnet");
    expect(assetAmount.amount).toBe("1000000");
    expect(assetAmount.asset).toBe("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b");

    const baseRequirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: assetAmount.amount,
      asset: assetAmount.asset,
    };

    const enhancedRequirements = await server.enhancePaymentRequirements(
      baseRequirements,
      {
        x402Version: 2,
        scheme: "exact",
        network: "hypercore:mainnet",
      },
      [],
    );

    expect(enhancedRequirements.extra?.signatureChainId).toBe(999);
    expect(enhancedRequirements.extra?.isMainnet).toBe(true);

    const payload = await client.createPaymentPayload(2, enhancedRequirements);

    expect(payload.x402Version).toBe(2);
    expect(payload.payload.action.type).toBe("sendAsset");
    expect(payload.payload.action.destination).toBe("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
    expect(payload.payload.action.amount).toBe("0.01000000");
    expect(payload.payload.signature).toBeDefined();

    const fullPayload = {
      x402Version: 2,
      scheme: "exact" as const,
      accepted: {
        scheme: "exact" as const,
        network: "hypercore:mainnet" as const,
        extra: {},
      },
      payload: payload.payload,
    };

    const verifyResult = await facilitator.verify(fullPayload, baseRequirements);

    expect(verifyResult.isValid).toBe(true);
  });

  it("should handle multiple networks", async () => {
    const client = new ClientScheme(mockSigner);
    const server = new ServerScheme();

    const mainnetRequirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    const mainnetEnhanced = await server.enhancePaymentRequirements(
      mainnetRequirements,
      {
        x402Version: 2,
        scheme: "exact",
        network: "hypercore:mainnet",
      },
      [],
    );

    const mainnetPayload = await client.createPaymentPayload(2, mainnetEnhanced);
    expect(mainnetPayload.payload.action.hyperliquidChain).toBe("Mainnet");

    const testnetRequirements = {
      scheme: "exact" as const,
      network: "hypercore:testnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
      extra: { isMainnet: false },
    };

    const testnetEnhanced = await server.enhancePaymentRequirements(
      testnetRequirements,
      {
        x402Version: 2,
        scheme: "exact",
        network: "hypercore:testnet",
      },
      [],
    );

    const testnetPayload = await client.createPaymentPayload(2, testnetEnhanced);
    expect(testnetPayload.payload.action.hyperliquidChain).toBe("Testnet");
  });
});
