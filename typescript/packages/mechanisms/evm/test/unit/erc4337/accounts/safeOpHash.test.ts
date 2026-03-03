import { describe, it, expect } from "vitest";
import { computeSafeOpHash } from "../../../../src/erc4337/accounts/computeSafeOpHash";
import type { SafeOpHashParams } from "../../../../src/erc4337/accounts/computeSafeOpHash";
import type { Hex } from "viem";

describe("computeSafeOpHash", () => {
  const baseUserOp: SafeOpHashParams = {
    sender: "0x1234567890123456789012345678901234567890" as Hex,
    nonce: 0n,
    callData: "0xdeadbeef" as Hex,
    verificationGasLimit: 100000n,
    callGasLimit: 200000n,
    preVerificationGas: 50000n,
    maxPriorityFeePerGas: 1000000000n,
    maxFeePerGas: 2000000000n,
  };
  const chainId = 84532;

  it("should compute a valid hash", () => {
    const result = computeSafeOpHash(baseUserOp, chainId);
    expect(result).toBeDefined();
    expect(result.startsWith("0x")).toBe(true);
    expect(result.length).toBe(66);
  });

  it("should produce deterministic output", () => {
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash(baseUserOp, chainId);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different chain IDs", () => {
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash(baseUserOp, 1);
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for different nonces", () => {
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash({ ...baseUserOp, nonce: 1n }, chainId);
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for different senders", () => {
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash(
      { ...baseUserOp, sender: "0x0000000000000000000000000000000000000001" as Hex },
      chainId,
    );
    expect(hash1).not.toBe(hash2);
  });

  it("should handle factory and factoryData", () => {
    const withFactory = {
      ...baseUserOp,
      factory: "0x0000000000000000000000000000000000000abc" as Hex,
      factoryData: "0x1234" as Hex,
    };
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash(withFactory, chainId);
    expect(hash1).not.toBe(hash2);
  });

  it("should handle paymaster fields", () => {
    const withPaymaster = {
      ...baseUserOp,
      paymaster: "0x0000000000000000000000000000000000000def" as Hex,
      paymasterVerificationGasLimit: 50000n,
      paymasterPostOpGasLimit: 30000n,
      paymasterData: "0xabcd" as Hex,
    };
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash(withPaymaster, chainId);
    expect(hash1).not.toBe(hash2);
  });

  it("should accept custom safe4337ModuleAddress", () => {
    const custom = "0x0000000000000000000000000000000000000999" as Hex;
    const hash1 = computeSafeOpHash(baseUserOp, chainId);
    const hash2 = computeSafeOpHash(baseUserOp, chainId, custom);
    expect(hash1).not.toBe(hash2);
  });

  it("should handle factory with null factoryData", () => {
    const withFactoryNullData = {
      ...baseUserOp,
      factory: "0x0000000000000000000000000000000000000abc" as Hex,
      factoryData: null,
    };
    const hash = computeSafeOpHash(withFactoryNullData, chainId);
    expect(hash).toBeDefined();
    expect(hash.startsWith("0x")).toBe(true);
    expect(hash.length).toBe(66);
  });

  it("should handle paymaster with null sub-fields", () => {
    const withPaymasterNullFields = {
      ...baseUserOp,
      paymaster: "0x0000000000000000000000000000000000000def" as Hex,
      paymasterVerificationGasLimit: null,
      paymasterPostOpGasLimit: null,
      paymasterData: null,
    };
    const hash = computeSafeOpHash(withPaymasterNullFields, chainId);
    expect(hash).toBeDefined();
    expect(hash.startsWith("0x")).toBe(true);
    expect(hash.length).toBe(66);

    // Should differ from base (no paymaster) since paymaster address is still set
    const baseHash = computeSafeOpHash(baseUserOp, chainId);
    expect(hash).not.toBe(baseHash);
  });
});
