import { describe, it, expect } from "vitest";
import { computeSafeMessageHash } from "../../../../src/erc4337/stamp/safeMessageHash";
import { keccak256, encodePacked } from "viem";

describe("computeSafeMessageHash (stamp)", () => {
  const safeAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const chainId = 84532;
  const messageHash = keccak256(encodePacked(["string"], ["test message"]));

  it("should produce deterministic output for known inputs", () => {
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(safeAddress, chainId, messageHash);

    expect(hash1).toBe(hash2);
    expect(hash1).toBeDefined();
    expect(hash1.startsWith("0x")).toBe(true);
    expect(hash1.length).toBe(66); // 0x + 64 hex chars = 32 bytes
  });

  it("should produce different output for different safe address", () => {
    const otherAddress = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(otherAddress, chainId, messageHash);

    expect(hash1).not.toBe(hash2);
  });

  it("should produce different output for different chain ID", () => {
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(safeAddress, 1, messageHash);

    expect(hash1).not.toBe(hash2);
  });

  it("should produce different output for different message hash", () => {
    const otherMessage = keccak256(encodePacked(["string"], ["other message"]));
    const hash1 = computeSafeMessageHash(safeAddress, chainId, messageHash);
    const hash2 = computeSafeMessageHash(safeAddress, chainId, otherMessage);

    expect(hash1).not.toBe(hash2);
  });

  it("should produce consistent output with different valid inputs", () => {
    const hash = computeSafeMessageHash(safeAddress, chainId, messageHash);

    // Run with different inputs to ensure distinct hashes
    const differentSafe = "0x0000000000000000000000000000000000000002" as `0x${string}`;
    const differentChain = 8453;
    const differentMsg = keccak256(encodePacked(["string"], ["another message"]));

    const hash2 = computeSafeMessageHash(differentSafe, differentChain, differentMsg);
    expect(hash).not.toBe(hash2);

    // Re-running with original inputs should match
    const hashAgain = computeSafeMessageHash(safeAddress, chainId, messageHash);
    expect(hash).toBe(hashAgain);
  });

  it("should handle chain ID 0", () => {
    const hash = computeSafeMessageHash(safeAddress, 0, messageHash);
    expect(hash).toBeDefined();
    expect(hash.startsWith("0x")).toBe(true);
    expect(hash.length).toBe(66);
  });

  it("should handle large chain IDs", () => {
    const hash = computeSafeMessageHash(safeAddress, 999999999, messageHash);
    expect(hash).toBeDefined();
    expect(hash.startsWith("0x")).toBe(true);
    expect(hash.length).toBe(66);
  });
});
