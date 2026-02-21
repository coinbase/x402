import { describe, expect, it } from "vitest";

import { isWSResponseMessage } from "../../src/utils";

describe("isWSResponseMessage", () => {
  it("returns false for plain business result objects", () => {
    expect(isWSResponseMessage({ echoed: { message: "hello" } })).toBe(false);
  });

  it("returns true for valid response envelopes", () => {
    expect(
      isWSResponseMessage({
        id: 1,
        result: { echoed: { message: "hello" } },
      }),
    ).toBe(true);
  });
});
