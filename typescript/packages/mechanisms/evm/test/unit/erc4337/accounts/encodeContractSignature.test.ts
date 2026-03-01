import { describe, it, expect } from "vitest";
import { encodeContractSignature } from "../../../../src/erc4337/accounts/encodeContractSignature";
import type { Hex } from "viem";

describe("encodeContractSignature", () => {
  const ownerAddress = "0x1234567890123456789012345678901234567890" as Hex;
  const signatureData = "0xaabbccdd" as Hex;

  it("should produce a hex string", () => {
    const result = encodeContractSignature(ownerAddress, signatureData);
    expect(result).toBeDefined();
    expect(result.startsWith("0x")).toBe(true);
  });

  it("should have correct structure", () => {
    const result = encodeContractSignature(ownerAddress, signatureData);
    // Static part: 32 (r) + 32 (s) + 1 (v) = 65 bytes = 130 hex chars
    // Dynamic part: 32 (length) + 4 (data) = 36 bytes = 72 hex chars
    // Total: 65 + 36 = 101 bytes = 202 hex chars + "0x" prefix
    const totalBytes = (result.length - 2) / 2;
    expect(totalBytes).toBe(65 + 32 + 4); // static + length + data
  });

  it("should have v=0x00 at position 64 (byte index)", () => {
    const result = encodeContractSignature(ownerAddress, signatureData);
    // v is at byte 64 (after 32-byte r + 32-byte s)
    const vByte = result.slice(2 + 128, 2 + 130);
    expect(vByte).toBe("00");
  });

  it("should embed owner address in r (first 32 bytes)", () => {
    const result = encodeContractSignature(ownerAddress, signatureData);
    // r = ownerAddress padded to 32 bytes (left padded with zeros)
    const r = result.slice(2, 66); // first 32 bytes
    expect(r.toLowerCase()).toContain(ownerAddress.slice(2).toLowerCase());
  });

  it("should produce deterministic output", () => {
    const r1 = encodeContractSignature(ownerAddress, signatureData);
    const r2 = encodeContractSignature(ownerAddress, signatureData);
    expect(r1).toBe(r2);
  });
});
