import { describe, it, expect } from "vitest";
import {
  findByNetworkAndScheme,
  findSchemesByNetwork,
  deepEqual,
  safeBase64Encode,
  safeBase64Decode,
} from "../../../src/utils";
import { Network } from "../../../src/types";

describe("Utils", () => {
  describe("findSchemesByNetwork", () => {
    it("should find schemes by exact network match", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("exact", "exactImpl");
      schemes.set("intent", "intentImpl");
      map.set("eip155:8453", schemes);

      const result = findSchemesByNetwork(map, "eip155:8453" as Network);

      expect(result).toBeDefined();
      expect(result?.get("exact")).toBe("exactImpl");
      expect(result?.get("intent")).toBe("intentImpl");
    });

    it("should return undefined for network not found", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("exact", "exactImpl");
      map.set("eip155:8453", schemes);

      const result = findSchemesByNetwork(map, "solana:mainnet" as Network);

      expect(result).toBeUndefined();
    });

    it("should match wildcard patterns - eip155:*", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("exact", "evmImpl");
      map.set("eip155:*", schemes);

      const result = findSchemesByNetwork(map, "eip155:8453" as Network);

      expect(result).toBeDefined();
      expect(result?.get("exact")).toBe("evmImpl");
    });

    it("should match wildcard patterns - solana:*", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("exact", "svmImpl");
      map.set("solana:*", schemes);

      const result = findSchemesByNetwork(
        map,
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as Network,
      );

      expect(result).toBeDefined();
      expect(result?.get("exact")).toBe("svmImpl");
    });

    it("should match universal wildcard *", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("cash", "cashImpl");
      map.set("*", schemes);

      const result1 = findSchemesByNetwork(map, "eip155:8453" as Network);
      const result2 = findSchemesByNetwork(map, "solana:mainnet" as Network);
      const result3 = findSchemesByNetwork(map, "custom:anything" as Network);

      expect(result1?.get("cash")).toBe("cashImpl");
      expect(result2?.get("cash")).toBe("cashImpl");
      expect(result3?.get("cash")).toBe("cashImpl");
    });

    it("should prefer exact match over pattern match", () => {
      const map = new Map<string, Map<string, string>>();

      const exactSchemes = new Map<string, string>();
      exactSchemes.set("exact", "exactNetworkImpl");
      map.set("eip155:8453", exactSchemes);

      const patternSchemes = new Map<string, string>();
      patternSchemes.set("exact", "patternImpl");
      map.set("eip155:*", patternSchemes);

      const result = findSchemesByNetwork(map, "eip155:8453" as Network);

      expect(result?.get("exact")).toBe("exactNetworkImpl");
    });
  });

  describe("findByNetworkAndScheme", () => {
    it("should find implementation by network and scheme", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("exact", "exactImpl");
      schemes.set("intent", "intentImpl");
      map.set("eip155:8453", schemes);

      const result = findByNetworkAndScheme(map, "exact", "eip155:8453" as Network);

      expect(result).toBe("exactImpl");
    });

    it("should return undefined if network not found", () => {
      const map = new Map<string, Map<string, string>>();

      const result = findByNetworkAndScheme(map, "exact", "eip155:8453" as Network);

      expect(result).toBeUndefined();
    });

    it("should return undefined if scheme not found in network", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("intent", "intentImpl");
      map.set("eip155:8453", schemes);

      const result = findByNetworkAndScheme(map, "exact", "eip155:8453" as Network);

      expect(result).toBeUndefined();
    });

    it("should use pattern matching for network", () => {
      const map = new Map<string, Map<string, string>>();
      const schemes = new Map<string, string>();
      schemes.set("exact", "evmImpl");
      map.set("eip155:*", schemes);

      const result = findByNetworkAndScheme(map, "exact", "eip155:8453" as Network);

      expect(result).toBe("evmImpl");
    });
  });

  describe("deepEqual", () => {
    describe("primitives", () => {
      it("should match identical numbers", () => {
        expect(deepEqual(42, 42)).toBe(true);
        expect(deepEqual(42, 43)).toBe(false);
      });

      it("should match identical strings", () => {
        expect(deepEqual("hello", "hello")).toBe(true);
        expect(deepEqual("hello", "world")).toBe(false);
      });

      it("should match identical booleans", () => {
        expect(deepEqual(true, true)).toBe(true);
        expect(deepEqual(true, false)).toBe(false);
      });

      it("should match null and undefined", () => {
        expect(deepEqual(null, null)).toBe(true);
        expect(deepEqual(undefined, undefined)).toBe(true);
        expect(deepEqual(null, undefined)).toBe(false);
      });
    });

    describe("objects", () => {
      it("should match identical objects", () => {
        const obj1 = { a: 1, b: 2 };
        const obj2 = { a: 1, b: 2 };

        expect(deepEqual(obj1, obj2)).toBe(true);
      });

      it("should match objects with different key order", () => {
        const obj1 = { a: 1, b: 2, c: 3 };
        const obj2 = { c: 3, a: 1, b: 2 };

        expect(deepEqual(obj1, obj2)).toBe(true);
      });

      it("should not match objects with different values", () => {
        const obj1 = { a: 1, b: 2 };
        const obj2 = { a: 1, b: 3 };

        expect(deepEqual(obj1, obj2)).toBe(false);
      });

      it("should handle nested objects", () => {
        const obj1 = { a: { b: { c: 1 } } };
        const obj2 = { a: { b: { c: 1 } } };

        expect(deepEqual(obj1, obj2)).toBe(true);
      });

      it("should handle nested objects with different key order", () => {
        const obj1 = { outer: { a: 1, b: 2 }, other: "val" };
        const obj2 = { other: "val", outer: { b: 2, a: 1 } };

        expect(deepEqual(obj1, obj2)).toBe(true);
      });

      it("should not match if nested values differ", () => {
        const obj1 = { a: { b: { c: 1 } } };
        const obj2 = { a: { b: { c: 2 } } };

        expect(deepEqual(obj1, obj2)).toBe(false);
      });

      it("should handle objects with null/undefined values", () => {
        const obj1 = { a: null, b: undefined };
        const obj2 = { a: null, b: undefined };

        expect(deepEqual(obj1, obj2)).toBe(true);
      });

      it("should distinguish null from undefined", () => {
        const obj1 = { a: null };
        const obj2 = { a: undefined };

        expect(deepEqual(obj1, obj2)).toBe(false);
      });
    });

    describe("arrays", () => {
      it("should match identical arrays", () => {
        const arr1 = [1, 2, 3];
        const arr2 = [1, 2, 3];

        expect(deepEqual(arr1, arr2)).toBe(true);
      });

      it("should respect array order", () => {
        const arr1 = [1, 2, 3];
        const arr2 = [3, 2, 1];

        expect(deepEqual(arr1, arr2)).toBe(false);
      });

      it("should handle arrays of objects", () => {
        const arr1 = [{ a: 1 }, { b: 2 }];
        const arr2 = [{ a: 1 }, { b: 2 }];

        expect(deepEqual(arr1, arr2)).toBe(true);
      });

      it("should handle nested arrays", () => {
        const arr1 = [
          [1, 2],
          [3, 4],
        ];
        const arr2 = [
          [1, 2],
          [3, 4],
        ];

        expect(deepEqual(arr1, arr2)).toBe(true);
      });

      it("should handle empty arrays", () => {
        expect(deepEqual([], [])).toBe(true);
        expect(deepEqual([], [1])).toBe(false);
      });
    });

    describe("complex structures", () => {
      it("should match payment requirements with different key orders", () => {
        const req1 = {
          scheme: "exact",
          network: "eip155:8453",
          amount: "1000000",
          asset: "0x833...",
          payTo: "0xabc...",
          extra: { foo: "bar" },
        };

        const req2 = {
          extra: { foo: "bar" },
          payTo: "0xabc...",
          asset: "0x833...",
          amount: "1000000",
          network: "eip155:8453",
          scheme: "exact",
        };

        expect(deepEqual(req1, req2)).toBe(true);
      });

      it("should handle empty objects", () => {
        expect(deepEqual({}, {})).toBe(true);
        expect(deepEqual({}, { a: 1 })).toBe(false);
      });
    });
  });

  describe("Base64 encoding", () => {
    const unicodeOriginal =
      "USD₮0 🤖 中文 ありがとう नमस्ते Привет مرحبا بالعالم שלום Γειά σου สวัสดี";
    const unicodeEncoded =
      "VVNE4oKuMCDwn6SWIOS4reaWhyDjgYLjgorjgYzjgajjgYYg4KSo4KSu4KS44KWN4KSk4KWHINCf0YDQuNCy0LXRgiDZhdix2K3YqNinINio2KfZhNi52KfZhNmFINep15zXldedIM6TzrXOuc6sIM+Dzr/PhSDguKrguKfguLHguKrguJTguLU=";

    describe("safeBase64Encode", () => {
      it("should encode simple strings", () => {
        const encoded = safeBase64Encode("hello");
        expect(encoded).toBe("aGVsbG8=");
      });

      it("should encode strings with special characters", () => {
        const encoded = safeBase64Encode("test data 123!@#");
        expect(encoded).toBe("dGVzdCBkYXRhIDEyMyFAIw==");
      });

      it("should encode empty string", () => {
        const encoded = safeBase64Encode("");
        expect(encoded).toBe("");
      });

      it("should encode unicode characters", () => {
        // Note: btoa doesn't handle unicode directly, need to encode first
        // This test verifies the function exists and works with ASCII
        const encoded = safeBase64Encode(unicodeOriginal);
        expect(encoded).toBe(unicodeEncoded);
      });
    });

    describe("safeBase64Decode", () => {
      it("should decode simple base64 strings", () => {
        const decoded = safeBase64Decode("aGVsbG8=");
        expect(decoded).toBe("hello");
      });

      it("should roundtrip encode/decode", () => {
        const original = "test data 123!@#";
        const encoded = safeBase64Encode(original);
        const decoded = safeBase64Decode(encoded);

        expect(decoded).toBe(original);
      });

      it("should decode unicode characters", () => {
        const decoded = safeBase64Decode(unicodeEncoded);
        expect(decoded).toBe(unicodeOriginal);
      });

      it("should decode empty string", () => {
        const decoded = safeBase64Decode("");
        expect(decoded).toBe("");
      });

      it("should handle base64 with different padding", () => {
        expect(safeBase64Decode("YQ==")).toBe("a");
        expect(safeBase64Decode("YWI=")).toBe("ab");
        expect(safeBase64Decode("YWJj")).toBe("abc");
      });
    });
  });
});
