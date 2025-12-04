/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNetworkPassphrase, getRpcUrl, getRpcClient } from "./rpc";
import { rpc } from "@stellar/stellar-sdk";
import { X402Config } from "../../types/config";

// Mock the Stellar SDK
vi.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: vi.fn(),
  },
}));

describe("Stellar RPC Helper Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getNetworkPassphrase", () => {
    it("should return the correct passphrase for stellar (mainnet)", () => {
      const result = getNetworkPassphrase("stellar");
      expect(result).toBe("Public Global Stellar Network ; September 2015");
    });

    it("should return the correct passphrase for stellar testnet", () => {
      const result = getNetworkPassphrase("stellar-testnet");
      expect(result).toBe("Test SDF Network ; September 2015");
    });

    it("should throw error for unknown network", () => {
      expect(() => getNetworkPassphrase("invalid-network" as any)).toThrow(
        "Unknown Stellar network: invalid-network",
      );
    });
  });

  describe("getRpcUrl", () => {
    describe("stellar-testnet", () => {
      it("should return default testnet URL when no config provided", () => {
        const result = getRpcUrl("stellar-testnet");
        expect(result).toBe("https://soroban-testnet.stellar.org");
      });

      it("should return custom URL when provided in stellarConfig", () => {
        const customUrl = "https://custom-stellar-testnet-rpc.example.com";
        const config: X402Config = {
          stellarConfig: {
            rpcUrl: customUrl,
          },
        } as X402Config;
        const result = getRpcUrl("stellar-testnet", config);
        expect(result).toBe(customUrl);
      });
    });

    describe("stellar mainnet", () => {
      it("should throw error when no config provided for mainnet", () => {
        expect(() => getRpcUrl("stellar")).toThrow(
          "Stellar mainnet requires a non-empty rpcUrl. For a list of RPC providers, see https://developers.stellar.org/docs/data/apis/rpc/providers#publicly-accessible-apis",
        );
      });

      it("should throw error when stellarConfig without rpcUrl provided for mainnet", () => {
        const config: X402Config = {
          stellarConfig: {},
        } as X402Config;
        expect(() => getRpcUrl("stellar", config)).toThrow(
          "Stellar mainnet requires a non-empty rpcUrl. For a list of RPC providers, see https://developers.stellar.org/docs/data/apis/rpc/providers#publicly-accessible-apis",
        );
      });

      it("should return custom URL when provided in stellarConfig for mainnet", () => {
        const customUrl = "https://custom-stellar-mainnet-rpc.example.com";
        const config: X402Config = {
          stellarConfig: {
            rpcUrl: customUrl,
          },
        } as X402Config;
        const result = getRpcUrl("stellar", config);
        expect(result).toBe(customUrl);
      });
    });

    describe("invalid networks", () => {
      it("should throw error for unknown network", () => {
        expect(() => getRpcUrl("invalid-network" as any)).toThrow(
          "Unknown Stellar network: invalid-network",
        );
      });
    });
  });

  describe("getRpcClient", () => {
    describe("stellar-testnet", () => {
      it("should create RPC client with default testnet URL when no config provided", () => {
        const mockServer = { mock: "testnet-server" };
        vi.mocked(rpc.Server).mockReturnValue(mockServer as any);

        const result = getRpcClient("stellar-testnet");

        expect(rpc.Server).toHaveBeenCalledWith("https://soroban-testnet.stellar.org", {
          allowHttp: true,
        });
        expect(result).toBe(mockServer);
      });

      it("should create RPC client with custom URL when provided in stellarConfig", () => {
        const customUrl = "https://custom-testnet-rpc.com";
        const mockServer = { mock: "testnet-server-custom" };
        vi.mocked(rpc.Server).mockReturnValue(mockServer as any);

        const config: X402Config = {
          network: "stellar-testnet",
          stellarConfig: {
            rpcUrl: customUrl,
          },
        } as X402Config;

        const result = getRpcClient("stellar-testnet", config);

        expect(rpc.Server).toHaveBeenCalledWith(customUrl, {
          allowHttp: true,
        });
        expect(result).toBe(mockServer);
      });

      it("should allow HTTP for testnet", () => {
        const mockServer = { mock: "testnet-server" };
        vi.mocked(rpc.Server).mockReturnValue(mockServer as any);

        getRpcClient("stellar-testnet");

        expect(rpc.Server).toHaveBeenCalledWith(expect.any(String), {
          allowHttp: true,
        });
      });
    });

    describe("stellar mainnet", () => {
      it("should throw error when no config provided for mainnet", () => {
        expect(() => getRpcClient("stellar")).toThrow(
          "Stellar mainnet requires a non-empty rpcUrl. For a list of RPC providers, see https://developers.stellar.org/docs/data/apis/rpc/providers#publicly-accessible-apis",
        );
      });

      it("should create RPC client with custom URL for mainnet", () => {
        const customUrl = "https://custom-mainnet-rpc.com";
        const mockServer = { mock: "mainnet-server" };
        vi.mocked(rpc.Server).mockReturnValue(mockServer as any);

        const config: X402Config = {
          network: "stellar",
          stellarConfig: {
            rpcUrl: customUrl,
          },
        } as X402Config;

        const result = getRpcClient("stellar", config);

        expect(rpc.Server).toHaveBeenCalledWith(customUrl, {
          allowHttp: false,
        });
        expect(result).toBe(mockServer);
      });

      it("should not allow HTTP for mainnet", () => {
        const customUrl = "https://custom-mainnet-rpc.com";
        const mockServer = { mock: "mainnet-server" };
        vi.mocked(rpc.Server).mockReturnValue(mockServer as any);

        const config: X402Config = {
          network: "stellar",
          stellarConfig: {
            rpcUrl: customUrl,
          },
        } as X402Config;

        getRpcClient("stellar", config);

        expect(rpc.Server).toHaveBeenCalledWith(expect.any(String), {
          allowHttp: false,
        });
      });
    });

    describe("invalid networks", () => {
      it("should throw error for unknown network", () => {
        expect(() => getRpcClient("invalid-network" as any)).toThrow(
          "Unknown Stellar network: invalid-network",
        );
      });

      it("should throw error for non-Stellar network", () => {
        expect(() => getRpcClient("base" as any)).toThrow("Unknown Stellar network: base");
      });
    });
  });
});
