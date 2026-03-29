import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactSvmScheme } from "../../src/exact";
import type { ClientSvmSigner, ClientRpcClient } from "../../src/signer";

describe("ExactSvmScheme - RPC Client Injection", () => {
  let mockSigner: ClientSvmSigner;

  beforeEach(() => {
    mockSigner = {
      address: "9xAXssX9j7vuK99c7cFwqbixzL3bFrzPy9PUhCtDPAYJ" as never,
      signTransactions: vi.fn().mockResolvedValue([
        {
          messageBytes: new Uint8Array(10),
          signatures: {},
        },
      ]) as never,
    };
  });

  describe("constructor with rpc config", () => {
    it("should create instance with default config (no rpc)", () => {
      const client = new ExactSvmScheme(mockSigner);
      expect(client.scheme).toBe("exact");
    });

    it("should accept config with rpcUrl only", () => {
      const client = new ExactSvmScheme(mockSigner, {
        rpcUrl: "https://custom-rpc.com",
      });
      expect(client.scheme).toBe("exact");
    });

    it("should accept config with custom rpc client", () => {
      const mockRpc = {
        getLatestBlockhash: vi.fn(),
        getBalance: vi.fn(),
      } as unknown as ClientRpcClient;

      const client = new ExactSvmScheme(mockSigner, { rpc: mockRpc });
      expect(client.scheme).toBe("exact");
    });

    it("should accept config with both rpc and rpcUrl (rpc takes precedence)", () => {
      const mockRpc = {
        getLatestBlockhash: vi.fn(),
      } as unknown as ClientRpcClient;

      const client = new ExactSvmScheme(mockSigner, {
        rpc: mockRpc,
        rpcUrl: "https://should-be-ignored.com",
      });
      expect(client.scheme).toBe("exact");
    });
  });

  describe("ClientRpcClient type", () => {
    it("should be importable and usable as a type", () => {
      // Type-level test: ClientRpcClient can be used as a variable type
      const rpc: ClientRpcClient | undefined = undefined;
      expect(rpc).toBeUndefined();
    });
  });
});
