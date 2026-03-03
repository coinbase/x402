import { describe, it, expect } from "vitest";
import { computeSafeMessageHash } from "../../../../src/erc4337/accounts/computeSafeMessageHash";
import { keccak256, encodePacked } from "viem";

describe("computeSafeMessageHash", () => {
  const safeAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const chainId = 84532;
  const messageHash = keccak256(encodePacked(["string"], ["test message"]));

  it("should compute a valid hash", () => {
    const result = computeSafeMessageHash(safeAddress, chainId, messageHash);
    expect(result).toBeDefined();
    expect(result.startsWith("0x")).toBe(true);
    expect(result.length).toBe(66); // 0x + 64 hex chars = 32 bytes
  });

  it("should produce deterministic output", () => {
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different safe addresses", () => {
    const other = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(other, chainId, messageHash);
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for different chain IDs", () => {
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(safeAddress, 1, messageHash);
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for different messages", () => {
    const other = keccak256(encodePacked(["string"], ["other message"]));
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(safeAddress, chainId, other);
    expect(hash1).not.toBe(hash2);
  });
});
