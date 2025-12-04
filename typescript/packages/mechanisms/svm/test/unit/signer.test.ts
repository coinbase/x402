import { describe, it, expect, vi } from "vitest";
import { toClientSvmSigner, toFacilitatorSvmSigner } from "../../src/signer";
import type { ClientSvmSigner } from "../../src/signer";
import { SOLANA_DEVNET_CAIP2, SOLANA_MAINNET_CAIP2 } from "../../src/constants";

describe("SVM Signer Converters", () => {
  describe("toClientSvmSigner", () => {
    it("should return the same signer (identity function)", () => {
      const mockSigner: ClientSvmSigner = {
        address: "9xAXssX9j7vuK99c7cFwqbixzL3bFrzPy9PUhCtDPAYJ" as never,
        signTransactions: vi.fn() as never,
      };

      const result = toClientSvmSigner(mockSigner);
      expect(result).toBe(mockSigner);
      expect(result.address).toBe(mockSigner.address);
    });
  });

  describe("toFacilitatorSvmSigner", () => {
    it("should create facilitator signer with multi-address support", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const result = toFacilitatorSvmSigner(mockSigner as never);

      // Should have getAddresses() method
      expect(result.getAddresses).toBeDefined();
      expect(typeof result.getAddresses).toBe("function");
      expect(result.getAddresses()).toEqual([mockSigner.address]);

      // Should have getSigner() method
      expect(result.getSigner).toBeDefined();
      expect(typeof result.getSigner).toBe("function");

      // getSigner should return the same signer for its address
      const specificSigner = result.getSigner(mockSigner.address);
      expect(specificSigner).toBe(mockSigner);

      // Should have getRpcForNetwork() method
      expect(result.getRpcForNetwork).toBeDefined();
      expect(typeof result.getRpcForNetwork).toBe("function");

      // Should preserve original address property for backward compat
      expect(result.address).toBe(mockSigner.address);
    });

    it("should throw error when getSigner called with unknown address", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const result = toFacilitatorSvmSigner(mockSigner as never);

      expect(() => result.getSigner("UnknownAddress11111111111111111111" as never)).toThrow();
    });

    it("should create RPC client for devnet", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const facilitator = toFacilitatorSvmSigner(mockSigner as never);
      const rpc = facilitator.getRpcForNetwork(SOLANA_DEVNET_CAIP2);

      expect(rpc).toBeDefined();
      expect(rpc.getBalance).toBeDefined();
    });

    it("should create RPC client for mainnet", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const facilitator = toFacilitatorSvmSigner(mockSigner as never);
      const rpc = facilitator.getRpcForNetwork(SOLANA_MAINNET_CAIP2);

      expect(rpc).toBeDefined();
      expect(rpc.getBalance).toBeDefined();
    });

    it("should support custom RPC URL", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const facilitator = toFacilitatorSvmSigner(mockSigner as never, {
        defaultRpcUrl: "https://custom-rpc.com",
      });

      expect(facilitator.getRpcForNetwork).toBeDefined();
    });

    it("should support per-network RPC mapping", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const mockDevnetRpc = {
        getBalance: vi.fn(),
        getSlot: vi.fn(),
      } as never;

      const facilitator = toFacilitatorSvmSigner(mockSigner as never, {
        [SOLANA_DEVNET_CAIP2]: mockDevnetRpc,
      });

      const rpc = facilitator.getRpcForNetwork(SOLANA_DEVNET_CAIP2);
      expect(rpc).toBe(mockDevnetRpc);
    });

    it("should support wildcard RPC client", () => {
      const mockSigner = {
        address: "FacilitatorAddress1111111111111111111" as never,
        signTransactions: vi.fn() as never,
        signMessages: vi.fn() as never,
      };

      const mockRpc = {
        getBalance: vi.fn(),
        getSlot: vi.fn(),
      } as never;

      const facilitator = toFacilitatorSvmSigner(mockSigner as never, mockRpc);

      const rpc = facilitator.getRpcForNetwork(SOLANA_DEVNET_CAIP2);
      expect(rpc).toBeDefined();
    });
  });
});
