/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRpcClient, getRpcSubscriptions } from "./rpc";
import * as solanaKit from "@solana/kit";

// Mock the Solana Kit functions
vi.mock("@solana/kit", () => ({
  createSolanaRpc: vi.fn(),
  createSolanaRpcSubscriptions: vi.fn(),
  devnet: vi.fn((url?: string) => url || "https://api.devnet.solana.com"),
  mainnet: vi.fn((url?: string) => url || "https://api.mainnet-beta.solana.com"),
}));

describe("RPC Helper Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRpcClient", () => {
    it("should return devnet client for solana-devnet network", () => {
      const mockRpcClient = { mock: "devnet" };
      vi.mocked(solanaKit.createSolanaRpc).mockReturnValue(mockRpcClient as any);

      const result = getRpcClient("solana-devnet");

      expect(solanaKit.devnet).toHaveBeenCalledWith("https://api.devnet.solana.com");
      expect(result).toBe(mockRpcClient);
    });

    it("should return mainnet client for solana network", () => {
      const mockRpcClient = { mock: "mainnet" };
      vi.mocked(solanaKit.createSolanaRpc).mockReturnValue(mockRpcClient as any);

      const result = getRpcClient("solana");

      expect(solanaKit.mainnet).toHaveBeenCalledWith("https://api.mainnet-beta.solana.com");
      expect(result).toBe(mockRpcClient);
    });

    it("should use custom URL when provided for devnet", () => {
      const mockRpcClient = { mock: "devnet-custom" };
      const customUrl = "http://localhost:8899";
      vi.mocked(solanaKit.createSolanaRpc).mockReturnValue(mockRpcClient as any);

      const result = getRpcClient("solana-devnet", customUrl);

      expect(solanaKit.devnet).toHaveBeenCalledWith(customUrl);
      expect(result).toBe(mockRpcClient);
    });

    it("should use custom URL when provided for mainnet", () => {
      const mockRpcClient = { mock: "mainnet-custom" };
      const customUrl = "https://custom-rpc.com";
      vi.mocked(solanaKit.createSolanaRpc).mockReturnValue(mockRpcClient as any);

      const result = getRpcClient("solana", customUrl);

      expect(solanaKit.mainnet).toHaveBeenCalledWith(customUrl);
      expect(result).toBe(mockRpcClient);
    });

    it("should throw error for invalid network", () => {
      expect(() => getRpcClient("invalid-network" as any)).toThrow("Invalid network");
    });
  });

  describe("getRpcSubscriptions", () => {
    it("should return devnet subscriptions with default URL", () => {
      const mockSubscriptions = { mock: "devnet-subscriptions" };
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana-devnet");

      expect(solanaKit.devnet).toHaveBeenCalledWith("wss://api.devnet.solana.com");
      expect(solanaKit.createSolanaRpcSubscriptions).toHaveBeenCalled();
      expect(result).toBe(mockSubscriptions);
    });

    it("should return mainnet subscriptions with default URL", () => {
      const mockSubscriptions = { mock: "mainnet-subscriptions" };
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana");

      expect(solanaKit.mainnet).toHaveBeenCalledWith("wss://api.mainnet-beta.solana.com");
      expect(solanaKit.createSolanaRpcSubscriptions).toHaveBeenCalled();
      expect(result).toBe(mockSubscriptions);
    });

    it("should use custom URL when provide (devnet)", () => {
      const mockSubscriptions = { mock: "custom-subscriptions" };
      const customUrl = "wss://custom-rpc.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana-devnet", customUrl);

      expect(solanaKit.devnet).toHaveBeenCalledWith(customUrl);
      expect(solanaKit.createSolanaRpcSubscriptions).toHaveBeenCalled();
      expect(result).toBe(mockSubscriptions);
    });

    it("should use custom URL when provided (mainnet)", () => {
      const mockSubscriptions = { mock: "custom-subscriptions" };
      const customUrl = "wss://custom-rpc.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana", customUrl);

      expect(solanaKit.mainnet).toHaveBeenCalledWith(customUrl);
      expect(solanaKit.createSolanaRpcSubscriptions).toHaveBeenCalled();
      expect(result).toBe(mockSubscriptions);
    });

    it("should throw error for invalid network", () => {
      expect(() => getRpcSubscriptions("invalid-network" as any)).toThrow("Invalid network");
    });

    it("should use custom subscriptionsUrl when provided (devnet)", () => {
      const mockSubscriptions = { mock: "custom-ws-subscriptions" };
      const customWsUrl = "wss://custom-ws.example.com";
      const httpUrl = "https://custom-rpc.example.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana-devnet", httpUrl, customWsUrl);

      expect(solanaKit.devnet).toHaveBeenCalledWith(customWsUrl);
      expect(solanaKit.createSolanaRpcSubscriptions).toHaveBeenCalled();
      expect(result).toBe(mockSubscriptions);
    });

    it("should use custom subscriptionsUrl when provided (mainnet)", () => {
      const mockSubscriptions = { mock: "custom-ws-subscriptions" };
      const customWsUrl = "wss://custom-ws.example.com";
      const httpUrl = "https://custom-rpc.example.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana", httpUrl, customWsUrl);

      expect(solanaKit.mainnet).toHaveBeenCalledWith(customWsUrl);
      expect(solanaKit.createSolanaRpcSubscriptions).toHaveBeenCalled();
      expect(result).toBe(mockSubscriptions);
    });

    it("should prioritize subscriptionsUrl over url parameter", () => {
      const mockSubscriptions = { mock: "prioritized-subscriptions" };
      const customWsUrl = "wss://priority-ws.example.com";
      const httpUrl = "https://should-not-use.example.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      getRpcSubscriptions("solana-devnet", httpUrl, customWsUrl);

      // Should use the custom WS URL, not convert the HTTP URL
      expect(solanaKit.devnet).toHaveBeenCalledWith(customWsUrl);
      expect(solanaKit.devnet).not.toHaveBeenCalledWith("wss://should-not-use.example.com");
    });

    it("should convert http://127.0.0.1:8899 to ws://127.0.0.1:8900", () => {
      const mockSubscriptions = { mock: "localhost-subscriptions" };
      const localhostUrl = "http://127.0.0.1:8899";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      const result = getRpcSubscriptions("solana-devnet", localhostUrl);

      expect(solanaKit.devnet).toHaveBeenCalledWith("ws://127.0.0.1:8900");
      expect(result).toBe(mockSubscriptions);
    });

    it("should convert http to ws for non-localhost URLs", () => {
      const mockSubscriptions = { mock: "converted-subscriptions" };
      const httpUrl = "https://custom-rpc.example.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      getRpcSubscriptions("solana-devnet", httpUrl);

      expect(solanaKit.devnet).toHaveBeenCalledWith("wss://custom-rpc.example.com");
    });

    it("should use url as-is if it's already a websocket URL", () => {
      const mockSubscriptions = { mock: "ws-subscriptions" };
      const wsUrl = "wss://already-ws.example.com";
      vi.mocked(solanaKit.createSolanaRpcSubscriptions).mockReturnValue(mockSubscriptions as any);

      getRpcSubscriptions("solana-devnet", wsUrl);

      expect(solanaKit.devnet).toHaveBeenCalledWith(wsUrl);
    });
  });
});
