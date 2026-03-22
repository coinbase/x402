/**
 * Tests for token-gate extension
 */

import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base } from "viem/chains";
import nacl from "tweetnacl";
import { base58 } from "@scure/base";
import type { PaymentRequiredContext } from "@x402/core/types";
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
  type TokenGateProof,
  type TokenGateExtension,
  type TokenGateHookEvent,
  type EvmTokenContract,
  type SvmTokenContract,
  type TokenGateSolanaKitSigner,
} from "../src/token-gate/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a random viem test account.
 *
 * @returns A viem PrivateKeyAccount
 */
function makeTestAccount() {
  return privateKeyToAccount(generatePrivateKey());
}

/**
 * Creates a signed token-gate proof using a fresh random account.
 *
 * @param domain - Domain to bind the proof to
 * @returns The test account and its signed proof
 */
async function makeSignedProof(domain = "api.example.com") {
  const account = makeTestAccount();
  const proof = await createTokenGateProof(account, domain);
  return { account, proof };
}

/**
 * Creates a minimal request adapter for testing hook logic.
 *
 * @param header - Value for the token-gate header (undefined if absent)
 * @param url - Request URL
 * @returns Adapter object with getHeader and getUrl methods
 */
function makeAdapter(header: string | undefined, url = "https://api.example.com/data") {
  return {
    getHeader: (name: string) => {
      if (name.toLowerCase() === TOKEN_GATE.toLowerCase()) return header;
      return undefined;
    },
    getUrl: () => url,
  };
}

/**
 * Builds a `@solana/kit`-style signer from a nacl keypair.
 *
 * @param kp - nacl sign keypair
 * @returns TokenGateSolanaKitSigner backed by the keypair
 */
function makeNaclKitSigner(kp: nacl.SignKeyPair): TokenGateSolanaKitSigner {
  const address = base58.encode(kp.publicKey);
  return {
    address,
    signMessages: async messages => {
      return messages.map(({ content }) => ({
        [address]: nacl.sign.detached(content, kp.secretKey),
      }));
    },
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
  it("roundtrips a valid EVM proof", async () => {
    const { proof } = await makeSignedProof();
    const encoded = encodeTokenGateHeader(proof);
    const decoded = parseTokenGateHeader(encoded);
    expect(decoded).toEqual(proof);
  });

  it("roundtrips a valid SVM proof", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");
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
  it("accepts a valid EVM proof", async () => {
    const { proof } = await makeSignedProof();
    expect(TokenGateProofSchema.safeParse(proof).success).toBe(true);
  });

  it("accepts a valid SVM proof", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");
    expect(TokenGateProofSchema.safeParse(proof).success).toBe(true);
  });

  it("rejects a proof missing domain", async () => {
    const { proof } = await makeSignedProof();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { domain: _domain, ...rest } = proof;
    expect(TokenGateProofSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a proof missing signatureType", async () => {
    const { proof } = await makeSignedProof();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signatureType: _signatureType, ...rest } = proof;
    expect(TokenGateProofSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. EVM proof signing & verification
// ---------------------------------------------------------------------------

describe("createTokenGateProof / verifyTokenGateProof (EVM)", () => {
  it("creates a proof with correct fields", async () => {
    const { account, proof } = await makeSignedProof("test.com");
    expect(proof.address.toLowerCase()).toBe(account.address.toLowerCase());
    expect(proof.domain).toBe("test.com");
    expect(typeof proof.issuedAt).toBe("string");
    expect(proof.signature).toMatch(/^0x/);
    expect(proof.signatureType).toBe("eip191");
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
    const tampered: TokenGateProof = { ...proof, signature: "0x" + "ff".repeat(65) };
    const result = await verifyTokenGateProof(tampered, "api.example.com");
    expect(result.valid).toBe(false);
  });

  it("rejects expired proof", async () => {
    const account = makeTestAccount();
    const issuedAt = new Date(Date.now() - 400_000).toISOString(); // 400s ago
    const message = buildProofMessage("api.example.com", issuedAt);
    const signature = await account.signMessage({ message });
    const proof: TokenGateProof = {
      address: account.address,
      domain: "api.example.com",
      issuedAt,
      signature,
      signatureType: "eip191",
    };
    const result = await verifyTokenGateProof(proof, "api.example.com", 300);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("rejects future issuedAt", async () => {
    const account = makeTestAccount();
    const issuedAt = new Date(Date.now() + 60_000).toISOString();
    const message = buildProofMessage("api.example.com", issuedAt);
    const signature = await account.signMessage({ message });
    const proof: TokenGateProof = {
      address: account.address,
      domain: "api.example.com",
      issuedAt,
      signature,
      signatureType: "eip191",
    };
    const result = await verifyTokenGateProof(proof, "api.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/future/i);
  });
});

// ---------------------------------------------------------------------------
// 3b. SVM proof signing & verification
// ---------------------------------------------------------------------------

describe("createTokenGateProof / verifyTokenGateProof (SVM)", () => {
  it("creates a proof with correct fields for kit signer", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");

    expect(proof.address).toBe(base58.encode(kp.publicKey));
    expect(proof.domain).toBe("api.example.com");
    expect(proof.signatureType).toBe("ed25519");
    expect(() => base58.decode(proof.signature)).not.toThrow(); // valid base58
  });

  it("creates a proof with correct fields for wallet-adapter signer", async () => {
    const kp = nacl.sign.keyPair();
    const address = base58.encode(kp.publicKey);
    const walletAdapterSigner = {
      publicKey: address,
      signMessage: async (msg: Uint8Array) => nacl.sign.detached(msg, kp.secretKey),
    };
    const proof = await createTokenGateProof(walletAdapterSigner, "api.example.com");

    expect(proof.address).toBe(address);
    expect(proof.signatureType).toBe("ed25519");
  });

  it("valid SVM proof verifies successfully", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");

    const result = await verifyTokenGateProof(proof, "api.example.com");
    expect(result.valid).toBe(true);
    expect(result.address).toBe(base58.encode(kp.publicKey));
  });

  it("rejects tampered SVM signature", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");

    // Replace signature with garbage base58
    const badSig = base58.encode(new Uint8Array(64).fill(0xff));
    const tampered: TokenGateProof = { ...proof, signature: badSig };
    const result = await verifyTokenGateProof(tampered, "api.example.com");
    expect(result.valid).toBe(false);
  });

  it("rejects SVM proof with wrong domain", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");

    const result = await verifyTokenGateProof(proof, "other.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Domain mismatch/);
  });

  it("rejects SVM proof with invalid base58 signature", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");

    const tampered: TokenGateProof = { ...proof, signature: "not-valid-base58-!!!" };
    const result = await verifyTokenGateProof(tampered, "api.example.com");
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. On-chain ownership (mocked via _checkOwnership injection)
// ---------------------------------------------------------------------------

describe("checkOwnership", () => {
  it("returns true when EVM holder (via hook injection)", async () => {
    const mockCheck = vi.fn().mockResolvedValue(true);
    const { proof } = await makeSignedProof("api.example.com");
    const header = encodeTokenGateHeader(proof);
    const CONTRACT: EvmTokenContract = {
      vm: "evm",
      address: "0xToken" as `0x${string}`,
      chain: base,
      type: "ERC-20",
    };
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
    const CONTRACT: EvmTokenContract = {
      vm: "evm",
      address: "0xToken" as `0x${string}`,
      chain: base,
      type: "ERC-721",
    };
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: "free",
      _checkOwnership: mockCheck,
    });
    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toBeUndefined();
    expect(mockCheck).toHaveBeenCalledOnce();
  });

  it("returns true when SVM holder (via hook injection)", async () => {
    const mockCheck = vi.fn().mockResolvedValue(true);
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const proof = await createTokenGateProof(signer, "api.example.com");
    const header = encodeTokenGateHeader(proof);
    const CONTRACT: SvmTokenContract = {
      vm: "svm",
      mint: "So11111111111111111111111111111111111111112",
      network: "solana:mainnet-beta",
    };
    const hook = createTokenGateRequestHook({
      contracts: [CONTRACT],
      access: "free",
      _checkOwnership: mockCheck,
    });
    const result = await hook({ adapter: makeAdapter(header), path: "/data" });
    expect(result).toEqual({ grantAccess: true });
    expect(mockCheck).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 5. Server request hook
// ---------------------------------------------------------------------------

describe("createTokenGateRequestHook", () => {
  const CONTRACT: EvmTokenContract = {
    vm: "evm",
    address: "0xToken" as `0x${string}`,
    chain: base,
    type: "ERC-721",
  };

  it("returns undefined when no header present", async () => {
    const hook = createTokenGateRequestHook({ contracts: [CONTRACT], access: "free" });
    const result = await hook({ adapter: makeAdapter(undefined), path: "/data" });
    expect(result).toBeUndefined();
  });

  it("returns undefined for invalid proof", async () => {
    const hook = createTokenGateRequestHook({ contracts: [CONTRACT], access: "free" });
    const fakeHeader = Buffer.from(
      JSON.stringify({
        address: "0x1",
        domain: "x",
        issuedAt: "bad",
        signature: "0x0",
        signatureType: "eip191",
      }),
    ).toString("base64url");
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
// 6. Client hook (EVM)
// ---------------------------------------------------------------------------

describe("createTokenGateClientHook (EVM)", () => {
  it("returns undefined when extension not present", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account });
    const result = await hook({ paymentRequired: { extensions: {} } });
    expect(result).toBeUndefined();
  });

  it("returns headers when token-gate extension has EVM contracts", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account });

    const extension: TokenGateExtension = {
      info: {
        contracts: [{ vm: "evm", address: "0xToken", chainId: 8453, type: "ERC-721" }],
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
    expect(proof.signatureType).toBe("eip191");
  });

  it("returns undefined when 402 only has SVM contracts (EVM signer)", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account });

    const extension: TokenGateExtension = {
      info: {
        contracts: [{ vm: "svm", mint: "So111...", network: "solana:mainnet-beta" }],
        domain: "api.example.com",
      },
      schema: {},
    };

    const result = await hook({
      paymentRequired: { extensions: { [TOKEN_GATE]: extension } },
    });
    expect(result).toBeUndefined();
  });

  it("uses domain override when provided", async () => {
    const account = makeTestAccount();
    const hook = createTokenGateClientHook({ account, domain: "override.example.com" });

    const extension: TokenGateExtension = {
      info: {
        contracts: [{ vm: "evm", address: "0xToken", chainId: 8453, type: "ERC-721" }],
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
// 6b. Client hook (SVM)
// ---------------------------------------------------------------------------

describe("createTokenGateClientHook (SVM)", () => {
  it("returns headers when 402 has SVM contracts (SVM signer)", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const hook = createTokenGateClientHook({ account: signer });

    const extension: TokenGateExtension = {
      info: {
        contracts: [{ vm: "svm", mint: "So111...", network: "solana:mainnet-beta" }],
        domain: "api.example.com",
      },
      schema: {},
    };

    const result = await hook({
      paymentRequired: { extensions: { [TOKEN_GATE]: extension } },
    });

    expect(result).toBeDefined();
    const proof = parseTokenGateHeader(result!.headers[TOKEN_GATE]);
    expect(proof.address).toBe(base58.encode(kp.publicKey));
    expect(proof.signatureType).toBe("ed25519");
  });

  it("returns undefined when 402 only has EVM contracts (SVM signer)", async () => {
    const kp = nacl.sign.keyPair();
    const signer = makeNaclKitSigner(kp);
    const hook = createTokenGateClientHook({ account: signer });

    const extension: TokenGateExtension = {
      info: {
        contracts: [{ vm: "evm", address: "0xToken", chainId: 8453, type: "ERC-721" }],
        domain: "api.example.com",
      },
      schema: {},
    };

    const result = await hook({
      paymentRequired: { extensions: { [TOKEN_GATE]: extension } },
    });
    expect(result).toBeUndefined();
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

  it("enrichPaymentRequiredResponse adds EVM contracts and domain", async () => {
    const ext = createTokenGateExtension();
    const context = {
      resourceInfo: { url: "https://api.example.com/data" },
      requirements: [{ network: "eip155:8453" }],
    };
    const declaration = {
      info: { contracts: [], domain: "" },
      schema: {},
      _options: {
        contracts: [
          {
            vm: "evm" as const,
            address: "0xToken" as `0x${string}`,
            chain: base,
            type: "ERC-721" as const,
          },
        ],
        message: "NFT holders get free access",
      },
    };

    const result = await ext.enrichPaymentRequiredResponse!(
      declaration,
      context as PaymentRequiredContext,
    );
    const r = result as TokenGateExtension;
    expect(r.info.contracts).toHaveLength(1);
    const c = r.info.contracts[0];
    expect(c.vm).toBe("evm");
    if (c.vm === "evm") {
      expect(c.chainId).toBe(base.id);
    }
    expect(r.info.domain).toBe("api.example.com");
    expect(r.info.message).toBe("NFT holders get free access");
  });

  it("enrichPaymentRequiredResponse adds SVM contracts", async () => {
    const ext = createTokenGateExtension();
    const context = {
      resourceInfo: { url: "https://api.example.com/data" },
      requirements: [],
    };
    const declaration = {
      info: { contracts: [], domain: "" },
      schema: {},
      _options: {
        contracts: [
          {
            vm: "svm" as const,
            mint: "So11111111111111111111111111111111111111112",
            network: "solana:mainnet-beta",
          },
        ],
      },
    };

    const result = await ext.enrichPaymentRequiredResponse!(
      declaration,
      context as PaymentRequiredContext,
    );
    const r = result as TokenGateExtension;
    expect(r.info.contracts).toHaveLength(1);
    const c = r.info.contracts[0];
    expect(c.vm).toBe("svm");
    if (c.vm === "svm") {
      expect(c.mint).toBe("So11111111111111111111111111111111111111112");
      expect(c.network).toBe("solana:mainnet-beta");
    }
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

    const result = await ext.enrichPaymentRequiredResponse!(
      declaration,
      context as PaymentRequiredContext,
    );
    expect((result as TokenGateExtension).info.domain).toBe("myapi.io");
  });
});

// ---------------------------------------------------------------------------
// 8. declareTokenGateExtension
// ---------------------------------------------------------------------------

describe("declareTokenGateExtension", () => {
  it("creates correct structure for EVM contract", () => {
    const decl = declareTokenGateExtension({
      contracts: [{ vm: "evm", address: "0xNFT" as `0x${string}`, chain: base, type: "ERC-721" }],
      message: "NFT holders get free access",
    });

    expect(decl[TOKEN_GATE]).toBeDefined();
    expect(decl[TOKEN_GATE].info.contracts).toHaveLength(1);
    const c = decl[TOKEN_GATE].info.contracts[0];
    expect(c.vm).toBe("evm");
    if (c.vm === "evm") {
      expect(c.chainId).toBe(base.id);
    }
    expect(decl[TOKEN_GATE].info.message).toBe("NFT holders get free access");
    expect(decl[TOKEN_GATE].schema).toBeDefined();
  });

  it("creates correct structure for SVM contract", () => {
    const decl = declareTokenGateExtension({
      contracts: [{ vm: "svm", mint: "So111...", network: "solana:mainnet-beta" }],
      message: "SPL token holders get free access",
    });

    expect(decl[TOKEN_GATE].info.contracts).toHaveLength(1);
    const c = decl[TOKEN_GATE].info.contracts[0];
    expect(c.vm).toBe("svm");
    if (c.vm === "svm") {
      expect(c.mint).toBe("So111...");
      expect(c.network).toBe("solana:mainnet-beta");
    }
  });

  it("stores _options for enrichPaymentRequiredResponse", () => {
    const contracts = [
      {
        vm: "evm" as const,
        address: "0xNFT" as `0x${string}`,
        chain: base,
        type: "ERC-721" as const,
      },
    ];
    const decl = declareTokenGateExtension({ contracts });
    expect(decl[TOKEN_GATE]._options.contracts).toBe(contracts);
  });
});

// ---------------------------------------------------------------------------
// 10. buildTokenGateSchema
// ---------------------------------------------------------------------------

describe("buildTokenGateSchema", () => {
  it("includes required fields", () => {
    const schema = buildTokenGateSchema() as { required: string[] };
    expect(schema.required).toContain("address");
    expect(schema.required).toContain("domain");
    expect(schema.required).toContain("issuedAt");
    expect(schema.required).toContain("signature");
    expect(schema.required).toContain("signatureType");
  });
});
