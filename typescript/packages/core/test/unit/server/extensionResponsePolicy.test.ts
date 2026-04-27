import { describe, it, expect } from "vitest";
import {
  assertAcceptsAllowlistedAfterExtensionEnrich,
  assertSettleResponseCoreUnchanged,
  isVacantStringField,
  snapshotPaymentRequirementsList,
  snapshotSettleResponseCore,
} from "../../../src/server/extensionResponsePolicy";
import { buildPaymentRequirements, buildSettleResponse } from "../../mocks";
import type { Network } from "../../../src/types";

describe("extensionResponsePolicy", () => {
  describe("isVacantStringField", () => {
    it("treats empty and whitespace-only strings as vacant", () => {
      expect(isVacantStringField("")).toBe(true);
      expect(isVacantStringField("   ")).toBe(true);
      expect(isVacantStringField("0xabc")).toBe(false);
    });
  });

  describe("snapshotPaymentRequirementsList", () => {
    it("returns a deep copy where scalar fields match the source", () => {
      const req = buildPaymentRequirements({ payTo: "0xabc", amount: "500", asset: "USDC" });
      const snapshot = snapshotPaymentRequirementsList([req]);
      expect(snapshot[0].payTo).toBe("0xabc");
      expect(snapshot[0].amount).toBe("500");
      expect(snapshot[0].asset).toBe("USDC");
    });

    it("deep-clones the extra field so mutations do not affect the snapshot", () => {
      const req = buildPaymentRequirements({ extra: { nested: { value: 1 } } });
      const snapshot = snapshotPaymentRequirementsList([req]);
      // Mutate the original extra after snapshotting
      (req.extra as { nested: { value: number } }).nested.value = 99;
      expect((snapshot[0].extra as { nested: { value: number } }).nested.value).toBe(1);
    });

    it("handles an empty requirements list", () => {
      expect(snapshotPaymentRequirementsList([])).toEqual([]);
    });

    it("preserves all entries in order", () => {
      const reqs = [
        buildPaymentRequirements({ payTo: "0x1" }),
        buildPaymentRequirements({ payTo: "0x2" }),
      ];
      const snapshot = snapshotPaymentRequirementsList(reqs);
      expect(snapshot).toHaveLength(2);
      expect(snapshot[0].payTo).toBe("0x1");
      expect(snapshot[1].payTo).toBe("0x2");
    });
  });

  describe("assertAcceptsAllowlistedAfterExtensionEnrich", () => {
    it("allows filling vacant payTo, amount, and asset", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({
          payTo: "",
          amount: "",
          asset: "",
        }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].payTo = "0xnew";
      current[0].amount = "1";
      current[0].asset = "USDC";
      expect(() =>
        assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext"),
      ).not.toThrow();
    });

    it("rejects changing scheme", () => {
      const baseline = snapshotPaymentRequirementsList([buildPaymentRequirements()]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].scheme = "other";
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /scheme\/network/,
      );
    });

    it("rejects changing network", () => {
      const baseline = snapshotPaymentRequirementsList([buildPaymentRequirements()]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].network = "eip155:9999" as Network;
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /scheme\/network/,
      );
    });

    it("rejects changing maxTimeoutSeconds", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ maxTimeoutSeconds: 300 }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].maxTimeoutSeconds = 600;
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /maxTimeoutSeconds/,
      );
    });

    it("rejects changing amount when baseline amount was set", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ amount: "1000" }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].amount = "999";
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /amount.*vacant/,
      );
    });

    it("rejects changing payTo when baseline payTo was set", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ payTo: "0xoriginal" }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].payTo = "0xhijacked";
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /payTo.*vacant/,
      );
    });

    it("rejects changing asset when baseline asset was set", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ asset: "USDC" }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].asset = "DAI";
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /asset.*vacant/,
      );
    });

    it("rejects removing an extra key from baseline", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ extra: { k: 1 } }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].extra = {};
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /extra\["k"\]/,
      );
    });

    it("rejects changing an extra value from baseline", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ extra: { k: 1 } }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].extra = { ...current[0].extra, k: 2 };
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /extra\["k"\]/,
      );
    });

    it("allows adding new extra keys", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ extra: { k: 1 } }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].extra = { ...current[0].extra, k: 1, newKey: true };
      expect(() =>
        assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext"),
      ).not.toThrow();
    });

    it("detects in-place mutation of nested extra values (deep snapshot)", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements({ extra: { nested: { b: "c" } } }),
      ]);
      const current = snapshotPaymentRequirementsList(baseline);
      (current[0].extra as { nested: { b: string } }).nested.b = "mutated";
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /extra\["nested"\]/,
      );
    });

    it("rejects when accepts length increases", () => {
      const baseline = snapshotPaymentRequirementsList([buildPaymentRequirements()]);
      const current = [
        ...snapshotPaymentRequirementsList(baseline),
        buildPaymentRequirements({ payTo: "0xextra" }),
      ];
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /accepts length changed/,
      );
    });

    it("rejects when accepts length decreases", () => {
      const baseline = snapshotPaymentRequirementsList([
        buildPaymentRequirements(),
        buildPaymentRequirements({ payTo: "0xsecond" }),
      ]);
      const current = snapshotPaymentRequirementsList([baseline[0]]);
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "ext")).toThrow(
        /accepts length changed/,
      );
    });

    it("passes for empty accepts arrays (no-op)", () => {
      expect(() => assertAcceptsAllowlistedAfterExtensionEnrich([], [], "ext")).not.toThrow();
    });

    it("includes the extension key in error messages", () => {
      const baseline = snapshotPaymentRequirementsList([buildPaymentRequirements()]);
      const current = snapshotPaymentRequirementsList(baseline);
      current[0].scheme = "hijacked";
      expect(() =>
        assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, "myExtension"),
      ).toThrow(/myExtension/);
    });
  });

  describe("snapshotSettleResponseCore", () => {
    it("captures all core fields from the settle response", () => {
      const response = buildSettleResponse({
        success: true,
        transaction: "0xtx1",
        network: "eip155:8453" as Network,
        amount: "1000",
        payer: "0xpayer",
        errorReason: undefined,
        errorMessage: undefined,
      });
      const snap = snapshotSettleResponseCore(response);
      expect(snap.success).toBe(true);
      expect(snap.transaction).toBe("0xtx1");
      expect(snap.network).toBe("eip155:8453");
      expect(snap.amount).toBe("1000");
      expect(snap.payer).toBe("0xpayer");
      expect(snap.errorReason).toBeUndefined();
      expect(snap.errorMessage).toBeUndefined();
    });

    it("does not include the extensions field in the snapshot", () => {
      const response = buildSettleResponse({ success: true });
      const snap = snapshotSettleResponseCore(response);
      expect("extensions" in snap).toBe(false);
    });
  });

  describe("assertSettleResponseCoreUnchanged", () => {
    it("passes when only extensions change", () => {
      const base = buildSettleResponse({
        success: true,
        transaction: "0xtx",
        network: "eip155:8453" as Network,
      });
      const snap = snapshotSettleResponseCore(base);
      base.extensions = { a: 1 };
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).not.toThrow();
    });

    it("throws when transaction changes", () => {
      const base = buildSettleResponse({
        success: true,
        transaction: "0xtx",
        network: "eip155:8453" as Network,
      });
      const snap = snapshotSettleResponseCore(base);
      base.transaction = "0xother";
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/transaction/);
    });

    it("throws when success changes", () => {
      const base = buildSettleResponse({ success: true, transaction: "0xtx" });
      const snap = snapshotSettleResponseCore(base);
      base.success = false;
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/success/);
    });

    it("throws when network changes", () => {
      const base = buildSettleResponse({ network: "eip155:8453" as Network });
      const snap = snapshotSettleResponseCore(base);
      base.network = "eip155:1" as Network;
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/network/);
    });

    it("throws when amount changes", () => {
      const base = buildSettleResponse({ amount: "500" });
      const snap = snapshotSettleResponseCore(base);
      base.amount = "999";
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/amount/);
    });

    it("throws when payer changes", () => {
      const base = buildSettleResponse({ payer: "0xoriginal" });
      const snap = snapshotSettleResponseCore(base);
      base.payer = "0xattacker";
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/payer/);
    });

    it("throws when errorReason changes", () => {
      const base = buildSettleResponse({ errorReason: undefined });
      const snap = snapshotSettleResponseCore(base);
      base.errorReason = "INSUFFICIENT_FUNDS";
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/errorReason/);
    });

    it("throws when errorMessage changes", () => {
      const base = buildSettleResponse({ errorMessage: undefined });
      const snap = snapshotSettleResponseCore(base);
      base.errorMessage = "not enough funds";
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "ext")).toThrow(/errorMessage/);
    });

    it("includes the extension key in error messages", () => {
      const base = buildSettleResponse({ transaction: "0xtx" });
      const snap = snapshotSettleResponseCore(base);
      base.transaction = "0xother";
      expect(() => assertSettleResponseCoreUnchanged(snap, base, "myExtension")).toThrow(
        /myExtension/,
      );
    });
  });
});
