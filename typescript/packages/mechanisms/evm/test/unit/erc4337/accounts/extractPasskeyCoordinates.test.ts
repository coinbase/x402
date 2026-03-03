import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// The module-under-test exports only `extractPasskeyCoordinates`.
// The helpers `bufferToHex` and `base64urlToHex` are module-private, so we
// exercise them indirectly through `extractPasskeyCoordinates` (for
// base64urlToHex) and by importing the module dynamically after patching
// globals where necessary.

// We mock crypto.subtle at the global level so tests run in Node
const mockImportKey = vi.fn();
const mockExportKey = vi.fn();

// Save original crypto (may or may not exist in Node)
const originalCrypto = globalThis.crypto;

beforeEach(() => {
  vi.clearAllMocks();

  // Provide a minimal crypto.subtle stub
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...originalCrypto,
      subtle: {
        importKey: mockImportKey,
        exportKey: mockExportKey,
      },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  // Restore original crypto
  Object.defineProperty(globalThis, "crypto", {
    value: originalCrypto,
    configurable: true,
    writable: true,
  });
});

// Import after mocking so the module picks up our globals
import { extractPasskeyCoordinates } from "../../../../src/erc4337/accounts/extractPasskeyCoordinates";

describe("extractPasskeyCoordinates", () => {
  // --- Helper: bufferToHex (tested indirectly via rawId conversion) ---

  describe("bufferToHex (via rawId)", () => {
    it("should convert an ArrayBuffer to a hex string", async () => {
      // rawId is [0xde, 0xad, 0xbe, 0xef]
      const rawIdBuffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;

      const mockPublicKey = new Uint8Array([1, 2, 3]).buffer;
      // Mock credential
      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => mockPublicKey,
        },
      } as unknown as PublicKeyCredential;

      // base64url encode "ab" -> x = 0x69, y = 0x69 (just need valid JWK)
      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({
        x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // 32 bytes of 0x00
        y: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE", // 32 bytes of 0x01
      });

      const result = await extractPasskeyCoordinates(credential);

      expect(result.rawId).toBe("deadbeef");
    });
  });

  // --- Helper: base64urlToHex (tested indirectly via x and y conversion) ---

  describe("base64urlToHex (via x/y coordinates)", () => {
    it("should decode base64url to hex correctly", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;
      const mockPublicKey = new Uint8Array([1]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => mockPublicKey,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);

      // Use base64url encoding of 32 zero bytes: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
      // And 32 bytes of 0xff: __________________________________________8=
      // Actually, let's use known values. base64url of 0x0102030405 is "AQIDBAU"
      mockExportKey.mockResolvedValue({
        x: "AQIDBAU", // base64url of [0x01, 0x02, 0x03, 0x04, 0x05]
        y: "BgcICQo", // base64url of [0x06, 0x07, 0x08, 0x09, 0x0a]
      });

      const result = await extractPasskeyCoordinates(credential);

      expect(result.x).toBe("0x0102030405");
      expect(result.y).toBe("0x060708090a");
    });

    it("should handle base64url characters (- and _) correctly", async () => {
      const rawIdBuffer = new Uint8Array([0xaa]).buffer;
      const mockPublicKey = new Uint8Array([1]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => mockPublicKey,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);

      // base64url uses - instead of + and _ instead of /
      // The bytes [0xfb, 0xef, 0xbe] in standard base64 is "u+++" which in base64url is "u---"
      // Let's use a simpler approach: [0xff, 0xff] in base64 is "//8=" in base64url is "__8"
      mockExportKey.mockResolvedValue({
        x: "__8", // base64url for [0xff, 0xff]
        y: "AQI", // base64url for [0x01, 0x02]
      });

      const result = await extractPasskeyCoordinates(credential);

      expect(result.x).toBe("0xffff");
      expect(result.y).toBe("0x0102");
    });
  });

  // --- Main function: extractPasskeyCoordinates ---

  describe("successful extraction", () => {
    it("should call crypto.subtle.importKey with correct SPKI params", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;
      const publicKeyBuffer = new Uint8Array([0x30, 0x59]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => publicKeyBuffer,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({
        x: "AA",
        y: "AQ",
      });

      await extractPasskeyCoordinates(credential);

      expect(mockImportKey).toHaveBeenCalledWith(
        "spki",
        publicKeyBuffer,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
    });

    it("should call crypto.subtle.exportKey with 'jwk' format", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;
      const publicKeyBuffer = new Uint8Array([0x30]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => publicKeyBuffer,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = { type: "public" } as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({
        x: "AA",
        y: "AQ",
      });

      await extractPasskeyCoordinates(credential);

      expect(mockExportKey).toHaveBeenCalledWith("jwk", mockCryptoKey);
    });

    it("should return rawId, x, and y with 0x prefix", async () => {
      const rawIdBuffer = new Uint8Array([0xca, 0xfe]).buffer;
      const publicKeyBuffer = new Uint8Array([0x30]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => publicKeyBuffer,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({
        x: "AQIDBAU",
        y: "BgcICQo",
      });

      const result = await extractPasskeyCoordinates(credential);

      expect(result).toEqual({
        rawId: "cafe",
        x: "0x0102030405",
        y: "0x060708090a",
      });
    });
  });

  // --- Error: no public key ---

  describe("error: no public key", () => {
    it("should throw when getPublicKey returns null", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => null,
        },
      } as unknown as PublicKeyCredential;

      await expect(extractPasskeyCoordinates(credential)).rejects.toThrow(
        "Failed to extract public key from credential",
      );

      // crypto.subtle should not have been called
      expect(mockImportKey).not.toHaveBeenCalled();
    });
  });

  // --- Error: missing JWK coordinates ---

  describe("error: missing JWK coordinates", () => {
    it("should throw when JWK x is missing", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;
      const publicKeyBuffer = new Uint8Array([0x30]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => publicKeyBuffer,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({
        // x is missing
        y: "AQ",
      });

      await expect(extractPasskeyCoordinates(credential)).rejects.toThrow(
        "Missing coordinates in JWK",
      );
    });

    it("should throw when JWK y is missing", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;
      const publicKeyBuffer = new Uint8Array([0x30]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => publicKeyBuffer,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({
        x: "AA",
        // y is missing
      });

      await expect(extractPasskeyCoordinates(credential)).rejects.toThrow(
        "Missing coordinates in JWK",
      );
    });

    it("should throw when both x and y are missing", async () => {
      const rawIdBuffer = new Uint8Array([0x01]).buffer;
      const publicKeyBuffer = new Uint8Array([0x30]).buffer;

      const credential = {
        rawId: rawIdBuffer,
        response: {
          getPublicKey: () => publicKeyBuffer,
        },
      } as unknown as PublicKeyCredential;

      const mockCryptoKey = {} as CryptoKey;
      mockImportKey.mockResolvedValue(mockCryptoKey);
      mockExportKey.mockResolvedValue({});

      await expect(extractPasskeyCoordinates(credential)).rejects.toThrow(
        "Missing coordinates in JWK",
      );
    });
  });
});
