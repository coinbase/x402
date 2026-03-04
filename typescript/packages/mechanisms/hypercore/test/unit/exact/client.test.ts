import { describe, it, expect, vi } from "vitest";
import { ExactHypercoreScheme } from "../../../src/exact/client/scheme.js";
import type { HyperliquidSigner } from "../../../src/exact/types.js";

describe("ExactHypercoreScheme (Client)", () => {
  const mockSigner: HyperliquidSigner = {
    signSendAsset: vi.fn(async () => ({
      r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      v: 27,
    })),
    getAddress: () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  };

  it("should have correct scheme", () => {
    const client = new ExactHypercoreScheme(mockSigner);
    expect(client.scheme).toBe("exact");
  });

  it("should create payment payload with correct structure", async () => {
    const client = new ExactHypercoreScheme(mockSigner);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    const result = await client.createPaymentPayload(2, requirements);

    expect(result.x402Version).toBe(2);
    expect(result.payload).toBeDefined();
    expect(result.payload.action).toBeDefined();
    expect(result.payload.signature).toBeDefined();
    expect(result.payload.nonce).toBeDefined();
  });

  it("should format amount correctly (8 decimals)", async () => {
    const client = new ExactHypercoreScheme(mockSigner);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    const result = await client.createPaymentPayload(2, requirements);

    expect(result.payload.action.amount).toBe("0.01000000");
  });

  it("should use mainnet chain for mainnet network", async () => {
    const client = new ExactHypercoreScheme(mockSigner);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    const result = await client.createPaymentPayload(2, requirements);

    expect(result.payload.action.hyperliquidChain).toBe("Mainnet");
  });

  it("should use testnet chain for testnet network", async () => {
    const client = new ExactHypercoreScheme(mockSigner);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:testnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
      extra: { isMainnet: false },
    };

    const result = await client.createPaymentPayload(2, requirements);

    expect(result.payload.action.hyperliquidChain).toBe("Testnet");
  });

  it("should normalize destination address to lowercase", async () => {
    const client = new ExactHypercoreScheme(mockSigner);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    const result = await client.createPaymentPayload(2, requirements);

    expect(result.payload.action.destination).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
  });

  it("should generate timestamp-based nonce", async () => {
    const client = new ExactHypercoreScheme(mockSigner);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    const before = Date.now();
    const result = await client.createPaymentPayload(2, requirements);
    const after = Date.now();

    expect(result.payload.nonce).toBeGreaterThanOrEqual(before);
    expect(result.payload.nonce).toBeLessThanOrEqual(after);
  });

  it("should call signer with correct action", async () => {
    const signSpy = vi.fn(async () => ({
      r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      v: 27,
    }));

    const signer: HyperliquidSigner = {
      signSendAsset: signSpy,
      getAddress: () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    };

    const client = new ExactHypercoreScheme(signer);

    const requirements = {
      scheme: "exact" as const,
      network: "hypercore:mainnet" as const,
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
      asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    };

    await client.createPaymentPayload(2, requirements);

    expect(signSpy).toHaveBeenCalledOnce();
    const calledWith = signSpy.mock.calls[0][0];
    expect(calledWith.type).toBe("sendAsset");
    expect(calledWith.destination).toBe("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
    expect(calledWith.token).toBe("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b");
  });
});
