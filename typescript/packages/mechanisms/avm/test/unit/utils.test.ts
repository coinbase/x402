import { describe, it, expect } from "vitest";
import {
  encodeTransaction,
  decodeTransaction,
  getNetworkFromCaip2,
  isAlgorandNetwork,
  isTestnetNetwork,
  convertFromTokenAmount,
  getGenesisHashFromTransaction,
  validateGroupId,
} from "../../src/utils";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
} from "../../src/constants";

// ---------------------------------------------------------------------------
// encodeTransaction / decodeTransaction
// ---------------------------------------------------------------------------

describe("encodeTransaction / decodeTransaction", () => {
  it("should produce a base64 string from Uint8Array", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0xff]);
    const encoded = encodeTransaction(bytes);
    expect(typeof encoded).toBe("string");
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("should round-trip arbitrary bytes", () => {
    const original = new Uint8Array([10, 20, 30, 40, 50, 200, 255, 0]);
    const encoded = encodeTransaction(original);
    const decoded = decodeTransaction(encoded);
    expect(decoded).toEqual(original);
  });

  it("should handle an empty Uint8Array", () => {
    const bytes = new Uint8Array([]);
    const encoded = encodeTransaction(bytes);
    expect(encoded).toBe("");
    const decoded = decodeTransaction(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("should handle single-byte payload", () => {
    const bytes = new Uint8Array([0xab]);
    const decoded = decodeTransaction(encodeTransaction(bytes));
    expect(decoded).toEqual(bytes);
  });

  it("should handle large byte arrays", () => {
    const large = new Uint8Array(256).map((_, i) => i % 256);
    const decoded = decodeTransaction(encodeTransaction(large));
    expect(decoded).toEqual(large);
  });
});

// ---------------------------------------------------------------------------
// getNetworkFromCaip2
// ---------------------------------------------------------------------------

describe("getNetworkFromCaip2", () => {
  it("should return 'mainnet' for Algorand mainnet CAIP-2", () => {
    expect(getNetworkFromCaip2(ALGORAND_MAINNET_CAIP2)).toBe("mainnet");
  });

  it("should return 'testnet' for Algorand testnet CAIP-2", () => {
    expect(getNetworkFromCaip2(ALGORAND_TESTNET_CAIP2)).toBe("testnet");
  });

  it("should return null for an unknown algorand network", () => {
    expect(getNetworkFromCaip2("algorand:unknownHash=")).toBeNull();
  });

  it("should return null for a non-algorand CAIP-2 (EVM)", () => {
    expect(getNetworkFromCaip2("eip155:8453")).toBeNull();
  });

  it("should return null for a Solana CAIP-2", () => {
    expect(getNetworkFromCaip2("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBeNull();
  });

  it("should return null for an empty string", () => {
    expect(getNetworkFromCaip2("")).toBeNull();
  });

  it("should return null for a plain genesis hash without namespace", () => {
    expect(getNetworkFromCaip2(ALGORAND_MAINNET_GENESIS_HASH)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isAlgorandNetwork
// ---------------------------------------------------------------------------

describe("isAlgorandNetwork", () => {
  it("should return true for Algorand mainnet CAIP-2", () => {
    expect(isAlgorandNetwork(ALGORAND_MAINNET_CAIP2)).toBe(true);
  });

  it("should return true for Algorand testnet CAIP-2", () => {
    expect(isAlgorandNetwork(ALGORAND_TESTNET_CAIP2)).toBe(true);
  });

  it("should return true for any 'algorand:' prefixed string", () => {
    expect(isAlgorandNetwork("algorand:someHash")).toBe(true);
  });

  it("should return false for EVM network", () => {
    expect(isAlgorandNetwork("eip155:8453")).toBe(false);
  });

  it("should return false for Solana network", () => {
    expect(isAlgorandNetwork("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isAlgorandNetwork("")).toBe(false);
  });

  it("should return false for 'Algorand:' (wrong case)", () => {
    expect(isAlgorandNetwork("Algorand:mainnet")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTestnetNetwork
// ---------------------------------------------------------------------------

describe("isTestnetNetwork", () => {
  it("should return true for Algorand testnet CAIP-2", () => {
    expect(isTestnetNetwork(ALGORAND_TESTNET_CAIP2)).toBe(true);
  });

  it("should return false for Algorand mainnet CAIP-2", () => {
    expect(isTestnetNetwork(ALGORAND_MAINNET_CAIP2)).toBe(false);
  });

  it("should return false for EVM network", () => {
    expect(isTestnetNetwork("eip155:84532")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isTestnetNetwork("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// convertFromTokenAmount
// ---------------------------------------------------------------------------

describe("convertFromTokenAmount", () => {
  it("should convert whole-number atomic amount with 6 decimals", () => {
    // 1_000_000 µUSDC = 1 USDC
    expect(convertFromTokenAmount("1000000", 6)).toBe("1");
  });

  it("should convert fractional atomic amount", () => {
    // 1_500_000 µUSDC = 1.5 USDC
    expect(convertFromTokenAmount("1500000", 6)).toBe("1.5");
  });

  it("should convert sub-unit amount", () => {
    // 100 µUSDC = 0.0001 USDC
    expect(convertFromTokenAmount("100", 6)).toBe("0.0001");
  });

  it("should handle zero amount", () => {
    expect(convertFromTokenAmount("0", 6)).toBe("0");
  });

  it("should handle bigint input", () => {
    expect(convertFromTokenAmount(BigInt(2000000), 6)).toBe("2");
  });

  it("should strip trailing decimal zeros", () => {
    // 1_100_000 µUSDC = 1.1 USDC (not 1.100000)
    expect(convertFromTokenAmount("1100000", 6)).toBe("1.1");
  });

  it("should handle 2 decimal places", () => {
    // 150 cents = 1.50 → "1.5"
    expect(convertFromTokenAmount("150", 2)).toBe("1.5");
  });

  it("should handle large amounts", () => {
    // 1_000_000_000_000 µUSDC = 1_000_000 USDC
    expect(convertFromTokenAmount("1000000000000", 6)).toBe("1000000");
  });

  it("should handle 1 µUSDC", () => {
    expect(convertFromTokenAmount("1", 6)).toBe("0.000001");
  });
});

// ---------------------------------------------------------------------------
// getGenesisHashFromTransaction
// ---------------------------------------------------------------------------

describe("getGenesisHashFromTransaction", () => {
  it("should return base64-encoded genesis hash for a transaction with genesisHash", () => {
    const genesisBytes = Buffer.from(ALGORAND_MAINNET_GENESIS_HASH, "base64");
    const txn = { genesisHash: new Uint8Array(genesisBytes) };
    const result = getGenesisHashFromTransaction(txn);
    expect(result).toBe(ALGORAND_MAINNET_GENESIS_HASH);
  });

  it("should return base64-encoded testnet genesis hash", () => {
    const genesisBytes = Buffer.from(ALGORAND_TESTNET_GENESIS_HASH, "base64");
    const txn = { genesisHash: new Uint8Array(genesisBytes) };
    const result = getGenesisHashFromTransaction(txn);
    expect(result).toBe(ALGORAND_TESTNET_GENESIS_HASH);
  });

  it("should throw when genesisHash is undefined", () => {
    const txn = { genesisHash: undefined };
    expect(() => getGenesisHashFromTransaction(txn)).toThrow(
      "Transaction does not have a genesis hash",
    );
  });

  it("should throw when transaction is empty object", () => {
    const txn = {};
    expect(() => getGenesisHashFromTransaction(txn)).toThrow(
      "Transaction does not have a genesis hash",
    );
  });
});

// ---------------------------------------------------------------------------
// validateGroupId (edge cases that don't require real transaction bytes)
// ---------------------------------------------------------------------------

describe("validateGroupId", () => {
  it("should return true for empty array", () => {
    expect(validateGroupId([])).toBe(true);
  });

  it("should return true for single-element array", () => {
    // validateGroupId short-circuits at length <= 1
    const fakeTxnBytes = new Uint8Array([0x01]);
    expect(validateGroupId([fakeTxnBytes])).toBe(true);
  });
});
