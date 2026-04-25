import { describe, it, expect } from "vitest";
import { encodeAptosPayload, isEntryFunctionPayload, createAptosClient } from "../../src/utils";
import { APTOS_MAINNET_CAIP2, APTOS_TESTNET_CAIP2 } from "../../src/constants";
import type { DecodedAptosPayload } from "../../src/types";

// ---------------------------------------------------------------------------
// encodeAptosPayload
// ---------------------------------------------------------------------------

describe("encodeAptosPayload", () => {
  it("encodes transaction and authenticator bytes to a base64 string", () => {
    const txBytes = new Uint8Array([1, 2, 3]);
    const authBytes = new Uint8Array([4, 5, 6]);
    const encoded = encodeAptosPayload(txBytes, authBytes);

    expect(typeof encoded).toBe("string");
    // Must be valid base64
    expect(() => Buffer.from(encoded, "base64")).not.toThrow();
  });

  it("round-trips through JSON.parse to recover original byte arrays", () => {
    const txBytes = new Uint8Array([10, 20, 30, 255, 0]);
    const authBytes = new Uint8Array([100, 200, 50]);
    const encoded = encodeAptosPayload(txBytes, authBytes);

    const decoded: DecodedAptosPayload = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    );
    expect(decoded.transaction).toEqual(Array.from(txBytes));
    expect(decoded.senderAuthenticator).toEqual(Array.from(authBytes));
  });

  it("encodes empty byte arrays to a valid payload", () => {
    const encoded = encodeAptosPayload(new Uint8Array([]), new Uint8Array([]));
    const decoded: DecodedAptosPayload = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    );

    expect(decoded.transaction).toEqual([]);
    expect(decoded.senderAuthenticator).toEqual([]);
  });

  it("produces deterministic (same) output for the same inputs", () => {
    const txBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const authBytes = new Uint8Array([0xca, 0xfe]);
    const first = encodeAptosPayload(txBytes, authBytes);
    const second = encodeAptosPayload(txBytes, authBytes);

    expect(first).toBe(second);
  });

  it("produces different output when transaction bytes differ", () => {
    const authBytes = new Uint8Array([1, 2, 3]);
    const a = encodeAptosPayload(new Uint8Array([1]), authBytes);
    const b = encodeAptosPayload(new Uint8Array([2]), authBytes);

    expect(a).not.toBe(b);
  });

  it("produces different output when authenticator bytes differ", () => {
    const txBytes = new Uint8Array([1, 2, 3]);
    const a = encodeAptosPayload(txBytes, new Uint8Array([10]));
    const b = encodeAptosPayload(txBytes, new Uint8Array([20]));

    expect(a).not.toBe(b);
  });

  it("handles large byte arrays without error", () => {
    const large = new Uint8Array(256).map((_, i) => i % 256);
    const auth = new Uint8Array(64).map((_, i) => (i * 3) % 256);
    const encoded = encodeAptosPayload(large, auth);

    const decoded: DecodedAptosPayload = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    );
    expect(decoded.transaction.length).toBe(256);
    expect(decoded.senderAuthenticator.length).toBe(64);
  });

  it("preserves byte values including 0 and 255 boundary cases", () => {
    const txBytes = new Uint8Array([0, 128, 255]);
    const authBytes = new Uint8Array([0, 255]);
    const encoded = encodeAptosPayload(txBytes, authBytes);

    const decoded: DecodedAptosPayload = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    );
    expect(decoded.transaction).toEqual([0, 128, 255]);
    expect(decoded.senderAuthenticator).toEqual([0, 255]);
  });
});

// ---------------------------------------------------------------------------
// isEntryFunctionPayload
// ---------------------------------------------------------------------------

describe("isEntryFunctionPayload", () => {
  it("returns true when payload object has an entryFunction key", () => {
    const payload = { entryFunction: { moduleName: "0x1::primary_fungible_store", args: [] } };
    expect(isEntryFunctionPayload(payload as never)).toBe(true);
  });

  it("returns false for a payload without entryFunction key", () => {
    expect(isEntryFunctionPayload({} as never)).toBe(false);
  });

  it("returns false for script payload (no entryFunction)", () => {
    const payload = { script: { bytecode: new Uint8Array([]) } };
    expect(isEntryFunctionPayload(payload as never)).toBe(false);
  });

  it("returns false for multisig payload (no entryFunction)", () => {
    const payload = { multisig: { multisigAddress: "0x1" } };
    expect(isEntryFunctionPayload(payload as never)).toBe(false);
  });

  it("returns true even when entryFunction value is null (key presence is what matters)", () => {
    const payload = { entryFunction: null };
    expect(isEntryFunctionPayload(payload as never)).toBe(true);
  });

  it("returns true even when entryFunction value is undefined", () => {
    const payload = { entryFunction: undefined };
    expect(isEntryFunctionPayload(payload as never)).toBe(true);
  });

  it("returns false for plain string or number inputs coerced to object", () => {
    // Objects without entryFunction key
    expect(isEntryFunctionPayload({ other: "value" } as never)).toBe(false);
    expect(isEntryFunctionPayload({ entry: "function" } as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createAptosClient
// ---------------------------------------------------------------------------

describe("createAptosClient", () => {
  it("creates an Aptos client instance for mainnet without error", () => {
    const client = createAptosClient(APTOS_MAINNET_CAIP2);
    expect(client).toBeDefined();
    expect(typeof client).toBe("object");
  });

  it("creates an Aptos client instance for testnet without error", () => {
    const client = createAptosClient(APTOS_TESTNET_CAIP2);
    expect(client).toBeDefined();
    expect(typeof client).toBe("object");
  });

  it("creates a client with a custom RPC URL without error", () => {
    const client = createAptosClient(
      APTOS_MAINNET_CAIP2,
      "https://fullnode.mainnet.aptoslabs.com/v1",
    );
    expect(client).toBeDefined();
  });

  it("creates a different client instance each call (no singleton)", () => {
    const a = createAptosClient(APTOS_MAINNET_CAIP2);
    const b = createAptosClient(APTOS_MAINNET_CAIP2);
    expect(a).not.toBe(b);
  });

  it("throws for an unsupported Aptos network CAIP-2", () => {
    expect(() => createAptosClient("aptos:99")).toThrow("Unsupported Aptos network");
  });

  it("throws for a non-Aptos namespace CAIP-2", () => {
    expect(() => createAptosClient("eip155:1")).toThrow("Unsupported Aptos network");
  });

  it("throws for an invalid / empty network identifier", () => {
    expect(() => createAptosClient("")).toThrow("Unsupported Aptos network");
  });
});
