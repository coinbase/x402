import { describe, expect, it } from "vitest";
import { convertToAtomicAmount } from "../../src/utils";

describe("Hedera utils", () => {
  it("preserves whole-number amounts when decimals is zero", () => {
    expect(convertToAtomicAmount("5", 0)).toBe("5");
  });

  it("truncates extra fractional digits beyond configured decimals", () => {
    expect(convertToAtomicAmount("1.123456", 6)).toBe("1123456");
  });
});
