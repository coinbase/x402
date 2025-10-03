import { describe, expect, it } from "vitest";
import { generateVoucherId } from "./id";

describe("generateVoucherId", () => {
  it("should generate a valid voucher ID with 0x prefix", () => {
    const voucherId = generateVoucherId();

    expect(voucherId).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(voucherId).toHaveLength(66); // 0x + 64 hex characters
  });

  it("should generate unique IDs on multiple calls", () => {
    const ids = new Set();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      ids.add(generateVoucherId());
    }

    expect(ids.size).toBe(count);
  });

  it("should generate IDs with proper hex format", () => {
    const voucherId = generateVoucherId();

    // Should start with 0x
    expect(voucherId.startsWith("0x")).toBe(true);

    // Should contain only valid hex characters after 0x
    const hexPart = voucherId.slice(2);
    expect(hexPart).toMatch(/^[a-f0-9]+$/i);
    expect(hexPart).toHaveLength(64);
  });
});
