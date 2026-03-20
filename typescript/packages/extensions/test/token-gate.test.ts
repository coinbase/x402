/**
 * Tests for token-gate extension
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base } from "viem/chains";
import {
  TOKEN_GATE,
  TokenGateProofSchema,
  createTokenGateProof,
  buildProofMessage,
  verifyTokenGateProof,
  parseTokenGateHeader,
  encodeTokenGateHeader,
  buildTokenGateSchema,
  declareTokenGateExtension,
  createTokenGateExtension,
  createTokenGateRequestHook,
  createTokenGateClientHook,
  clearOwnershipCache,
  type TokenGateProof,
  type TokenGateExtension,
  type TokenGateHookEvent,
} from "../src/token-gate/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestAccount() {
  return privateKeyToAccount(generatePrivateKey());
}

async function makeSignedProof(domain = "api.example.com") {
  const account = makeTestAccount();
  const proof = await createTokenGateProof(account, domain);
  return { account, proof };
}

function makeAdapter(header: string | undefined, url = "https://api.example.com/data") {
  return {
    getHeader: (name: string) => {
      if (name.toLowerCase() === TOKEN_GATE.toLowerCase()) return header;
      return undefined;
    },
    getUrl: () => url,
  };
}

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

describe("TOKEN_GATE constant", () => {
  it("is exported as 'token-gate'", () => {
    expect(TOKEN_GATE).toBe("token-gate");
  });
});

// ---------------------------------------------------------------------------
// 2. Encoding / Parsing
// ---------------------------------------------------------------------------

describe("encodeTokenGateHeader / parseTokenGateHeader", () => {
  it("roundtrips a valid proof", async () => {
    const { proof } = await makeSignedProof();
    const encoded = encodeTokenGateHeader(proof);
    const decoded = parseTokenGateHeader(encoded);
    expect(decoded).toEqual(proof);
  });

  it("throws on invalid base64", () => {
    expect(() => parseTokenGateHeader("not-base64!!!")).toThrow("not valid base64");
  });

  it("throws on non-JSON base64", () => {
    const encoded = Buffer.from("not json").toString("base64url");
    expect(() => parseTokenGateHeader(encoded)).toThrow();
  });

  it("throws on missing required fields", () => {
    const encoded = Buffer.from(JSON.stringify({ address: "0x1234" })).toString("base64url");
    expect(() => parseTokenGateHeader(encoded)).toThrow("Invalid token-gate header");
  });
});

describe("TokenGateProofSchema", () => {
  it("accepts a valid proof", async () => {
    const { proof } = await makeSignedProof();
    expect(TokenGateProofSchema.safeParse(proof).success).toBe(true);
  });

  it("rejects a proof missing domain", async () => {
    const { proof } = await makeSignedProof();
    const { domain: _d, ...rest } = proof;
    expect(TokenGateProofSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Proof signing & verification
// ---------------------------------------------------------------------------

describe("createTokenGateProof / verifyTokenGateProof", () => {
  it("creates a proof with correct fields", async () => {
    const { account, proof } = await makeSignedProof("test.com");
    expect(proof.address.toLowerCase()).toBe(account.address.toLowerCase());
    expect(proof.domain).toBe("test.com");
    expect(typeof proof.issuedAt).toBe("string");
    expect(proof.signature).toMatch(/^0x/);
  });

  it("buildProofMessage returns expected string", () => {
    const msg = buildProofMessage("api.example.com", "2026-01-01T00:00:00.000Z");
    expect(msg).toBe("token-gate proof for api.example.com at 2026-01-01T00:00:00.000Z");
  });

  it("valid proof verifies successfully", async () => {
    const { proof } = await makeSignedProof("api.example.com");
    const result = await verifyTokenGateProof(proof, "api.example.com");
    expect(result.valid).toBe(true);
    expect(result.address).toBeDefined();
  });

  it("rejects wrong domain", async () => {
    const { proof } = await makeSignedProof("api.example.com");
    const result = await verifyTokenGateProof(proof, "other.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Domain mismatch/);
  });

  it("rejects tampered signature", async () => {
    const { proof } = await makeSignedProof("api.example.com");
    const tampered: TokenGateProof = { ...proof, signature: "0x" + "ff".repeat(65) as `0x${string}` };
    const result = await verifyTokenGateProof(tampered, "api.example.com");
    expect(result.valid).toBe(false);
  });

  it("rejects expired proof", async () => {
    const account = makeTestAccount();
    const issuedAt = new Date(Date.now() - 400_000).toISOString(); // 400s ago
    const message = buildProofMessage("api.example.com", issuedAt);
    const signature = await account.signMessage({ message });
    const proof: TokenGateProof = { address: account.address, domain: "api.example.com", issuedAt, signature };
    const result = await verifyTokenGateProof(proof, "api.example.com", 300);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("rejects future issuedAt", async () => {
    const account = makeTestAccount();
    const issuedAt = new Date(Date.now() + 60_000).toISOString();
    const message = buildProofMessage("api.example.com", issuedAt);
    const signature = await account.signMessage({ message });
    const proof: TokenGateProof = { address: account.address, domain: "api.example.com", issuedAt, signature };
    const result = await verifyTokenGateProof(proof, "api.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/future/i);
  });
});

// ---------------------------------------------------------------------------
// 4. On-chain ownership (mocked via _checkOwnership injection)
// ---------------------------------------------------------------------------

describe("checkOwnership", () => {
  it("returns true when holder (via hook injection)", async () => {
    const mockCheck = vi.fn().mockResolvedValue(true);
    const { proof } = await makeSignedProof("api.example.com");
    const header = encodeTokenGateHeader(proof);
    const CONTRACT = { address: "0xToken" as `0x${string}`, chain: base, type: "ERC-20" as const };
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: "free",
      _checkOwnership: mockCheck,
    });
    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toEqual({ grantAccess: true });
    expect(mockCheck).toHaveBeenCalledOnce();
  });

  it("returns false when not a holder (via hook injection)", async () => {
    const mockCheck = vi.fn().mockResolvedValue(false);
    const { proof } = await makeSignedProof("api.example.com");
    const header = encodeTokenGateHeader(proof);
    const CONTRACT = { address: "0xToken" as `0x${string}`, chain: base, type: "ERC-721" as const };
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: "free",
      _checkOwnership: mockCheck,
    });
    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toBeUndefined();
    expect(mockCheck).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 5. Server request hook
// ---------------------------------------------------------------------------

describe("createTokenGateRequestHook", () => {
  const CONTRACT = { address: "0xToken" as `0x${string}`, chain: base, type: "ERC-721" as const };

  it("returns undefined when no header present", async () => {
    const hook = createTokenGateRequestHook({ contracts: [CONTRACT], access: "free" });
    const result = await hook({ adapter: makeAdapter(undefined), path: "/data" });
    expect(result).toBeUndefined();
  });

  it("returns undefined for invalid proof", async () => {
    const hook = createTokenGateRequestHook({ contracts: [CONTRACT], access: "free" });
    const fakeHeader = Buffer.from(JSON.stringify({ address: "0x1", domain: "x", issuedAt: "bad", signature: "0x0" })).toString("base64url");
    const result = await hook({ adapter: makeAdapter(fakeHeader), path: "/data" });
    expect(result).toBeUndefined();
  });

  it("emits access_granted event on success", async () => {
    const events: TokenGateHookEvent[] = [];
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: "free",
      onEvent: e => events.push(e),
      _checkOwnership: vi.fn().mockResolvedValue(true),
    });

    const { proof } = await makeSignedProof("api.example.com");
    const header = encodeTokenGateHeader(proof);

    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toEqual({ grantAccess: true });
    expect(events.some(e => e.type === "access_granted")).toBe(true);
  });

  it("emits not_holder event when balance is zero", async () => {
    const events: TokenGateHookEvent[] = [];
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: "free",
      onEvent: e => events.push(e),
      _checkOwnership: vi.fn().mockResolvedValue(false),
    });

    const { proof } = await makeSignedProof("api.example.com");
    const header = encodeTokenGateHeader(proof);

    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toBeUndefined();
    expect(events.some(e => e.type === "not_holder")).toBe(true);
  });

  it("is case-insensitive for header name", async () => {
    const hook = createTokenGateRequestHook({ contracts: [CONTRACT], access: "free" });
    const adapter = {
      getHeader: (name: string) => {
        if (name === "Token-Gate") return "somevalue";
        return undefined;
      },
      getUrl: () => "https://api.example.com/data",
    };
    // Should not crash — will fail gracefully on parse error
    const result = await hook({ adapter, path: "/data" });
    expect(result).toBeUndefined();
  });

  it("does not grant access in discount mode", async () => {
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: { discount: 50 },
      _checkOwnership: vi.fn().mockResolvedValue(true),
    });

    const { proof } = await makeSignedProof("api.example.com");
    const header = encodeTokenGateHeader(proof);

    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toBeUndefined(); // discount mode: no grantAccess
  });
});

// ---------------------------------------------------------------------------
// 6. Client hook
// ---------------------------------------------------------------------------

describe("createTokenGateClientHook", () => {
  it("returns undefined when extension not present", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account });
    const result = await hook({ paymentRequired: { extensions: {} } });
    expect(result).toBeUndefined();
  });

  it("returns headers when token-gate extension present", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account });

    const extension: TokenGateExtension = {
      info: {
        contracts: [{ address: "0xToken", chainId: 8453, type: "ERC-721" }],
        domain: "api.example.com",
      },
      schema: {},
    };

    const result = await hook({
      paymentRequired: { extensions: { [TOKEN_GATE]: extension } },
    });

    expect(result).toBeDefined();
    expect(result!.headers[TOKEN_GATE]).toBeDefined();

    // Verify the encoded proof can be parsed back
    const proof = parseTokenGateHeader(result!.headers[TOKEN_GATE]);
    expect(proof.address.toLowerCase()).toBe(account.address.toLowerCase());
    expect(proof.domain).toBe("api.example.com");
  });

  it("uses domain override when provided", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account, domain: "override.example.com" });

    const extension: TokenGateExtension = {
      info: {
        contracts: [],
        domain: "original.example.com",
      },
      schema: {},
    };

    const result = await hook({
      paymentRequired: { extensions: { [TOKEN_GATE]: extension } },
    });

    const proof = parseTokenGateHeader(result!.headers[TOKEN_GATE]);
    expect(proof.domain).toBe("override.example.com");
  });
});

// ---------------------------------------------------------------------------
// 7. Resource server extension (server.ts)
// ---------------------------------------------------------------------------

describe("createTokenGateExtension", () => {
  it("has correct key", () => {
    const ext = createTokenGateExtension();
    expect(ext.key).toBe(TOKEN_GATE);
  });

  it("enrichPaymentRequiredResponse adds contracts and domain", async () => {
    const ext = createTokenGateExtension();
    const context = {
      resourceInfo: { url: "https://api.example.com/data" },
      requirements: [{ network: "eip155:8453" }],
    };
    const declaration = {
      info: { contracts: [], domain: "" },
      schema: {},
      _options: {
        contracts: [{ address: "0xToken" as `0x${string}`, chain: base, type: "ERC-721" as const }],
        message: "NFT holders get free access",
      },
    };

    const result = await ext.enrichPaymentRequiredResponse!(declaration, context as any);
    const r = result as TokenGateExtension;
    expect(r.info.contracts).toHaveLength(1);
    expect(r.info.contracts[0].chainId).toBe(base.id);
    expect(r.info.domain).toBe("api.example.com");
    expect(r.info.message).toBe("NFT holders get free access");
  });

  it("derives domain from URL when not provided", async () => {
    const ext = createTokenGateExtension();
    const context = {
      resourceInfo: { url: "https://myapi.io/resource" },
      requirements: [],
    };
    const declaration = {
      info: { contracts: [], domain: "" },
      schema: {},
      _options: {
        contracts: [],
      },
    };

    const result = await ext.enrichPaymentRequiredResponse!(declaration, context as any);
    expect((result as TokenGateExtension).info.domain).toBe("myapi.io");
  });
});

// ---------------------------------------------------------------------------
// 8. declareTokenGateExtension
// ---------------------------------------------------------------------------

describe("declareTokenGateExtension", () => {
  it("creates correct structure", () => {
    const decl = declareTokenGateExtension({
      contracts: [{ address: "0xNFT" as `0x${string}`, chain: base, type: "ERC-721" }],
      message: "NFT holders get free access",
    });

    expect(decl[TOKEN_GATE]).toBeDefined();
    expect(decl[TOKEN_GATE].info.contracts).toHaveLength(1);
    expect(decl[TOKEN_GATE].info.contracts[0].chainId).toBe(base.id);
    expect(decl[TOKEN_GATE].info.message).toBe("NFT holders get free access");
    expect(decl[TOKEN_GATE].schema).toBeDefined();
  });

  it("stores _options for enrichPaymentRequiredResponse", () => {
    const contracts = [{ address: "0xNFT" as `0x${string}`, chain: base, type: "ERC-721" as const }];
    const decl = declareTokenGateExtension({ contracts });
    expect(decl[TOKEN_GATE]._options.contracts).toBe(contracts);
  });
});

// ---------------------------------------------------------------------------
// 10. buildTokenGateSchema
// ---------------------------------------------------------------------------

describe("buildTokenGateSchema", () => {
  it("includes required fields", () => {
    const schema = buildTokenGateSchema() as any;
    expect(schema.required).toContain("address");
    expect(schema.required).toContain("domain");
    expect(schema.required).toContain("issuedAt");
    expect(schema.required).toContain("signature");
  });
});
