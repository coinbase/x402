import { describe, expect, it, vi } from "vitest";
import {
  P256_OWNER_FACTORY_ABI,
  computeP256OwnerAddress,
  isP256OwnerDeployed,
  deployP256Owner,
} from "../../../src/erc4337/factories/p256-owner-factory";
import {
  WEBAUTHN_SIGNER_FACTORY_ABI,
  computeWebAuthnSignerAddress,
  computeVerifiers,
  isWebAuthnSignerDeployed,
  deployWebAuthnSigner,
  RIP_7212_PRECOMPILE,
} from "../../../src/erc4337/factories/webauthn-signer-factory";
import type { Hex, PublicClient, WalletClient } from "viem";

// --- Helpers ---

function mockPublicClient(overrides: Record<string, unknown> = {}) {
  return {
    readContract: vi.fn(),
    getCode: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as PublicClient;
}

function mockWalletClient(account = "0x1111111111111111111111111111111111111111" as Hex) {
  return {
    account: { address: account },
    writeContract: vi.fn().mockResolvedValue("0xtxhash" as Hex),
  } as unknown as WalletClient;
}

// --- P256 Owner Factory Tests ---

const P256_FACTORY = "0x349c03Eb61e26528cbf79F5D3Ba071FcA2aE82cB" as Hex;
const P256_OWNER_ADDR = "0xaaBBccDDeeFf00112233445566778899aAbBcCdD" as Hex;
const P256_X = 1n;
const P256_Y = 2n;

describe("P256_OWNER_FACTORY_ABI", () => {
  it("should export ABI with computeAddress, isDeployed, and createP256Owner", () => {
    const names = P256_OWNER_FACTORY_ABI.map(f => f.name);
    expect(names).toContain("computeAddress");
    expect(names).toContain("isDeployed");
    expect(names).toContain("createP256Owner");
  });
});

describe("computeP256OwnerAddress", () => {
  it("should call readContract with computeAddress and return the address", async () => {
    const client = mockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(P256_OWNER_ADDR);

    const result = await computeP256OwnerAddress(client, P256_FACTORY, P256_X, P256_Y);

    expect(result).toBe(P256_OWNER_ADDR);
    expect(client.readContract).toHaveBeenCalledWith({
      address: P256_FACTORY,
      abi: P256_OWNER_FACTORY_ABI,
      functionName: "computeAddress",
      args: [P256_X, P256_Y],
    });
  });
});

describe("isP256OwnerDeployed", () => {
  it("should return true when contract reports deployed", async () => {
    const client = mockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const result = await isP256OwnerDeployed(client, P256_FACTORY, P256_X, P256_Y);

    expect(result).toBe(true);
    expect(client.readContract).toHaveBeenCalledWith({
      address: P256_FACTORY,
      abi: P256_OWNER_FACTORY_ABI,
      functionName: "isDeployed",
      args: [P256_X, P256_Y],
    });
  });

  it("should return false when contract reports not deployed", async () => {
    const client = mockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const result = await isP256OwnerDeployed(client, P256_FACTORY, P256_X, P256_Y);
    expect(result).toBe(false);
  });
});

describe("deployP256Owner", () => {
  it("should return alreadyDeployed=true and skip tx when already deployed", async () => {
    const client = mockPublicClient();
    const wallet = mockWalletClient();
    (client.readContract as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true) // isDeployed
      .mockResolvedValueOnce(P256_OWNER_ADDR); // computeAddress

    const result = await deployP256Owner(wallet, client, P256_FACTORY, P256_X, P256_Y);

    expect(result.alreadyDeployed).toBe(true);
    expect(result.address).toBe(P256_OWNER_ADDR);
    expect(result.txHash).toBeUndefined();
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("should deploy and return txHash when not yet deployed", async () => {
    const client = mockPublicClient();
    const wallet = mockWalletClient();
    const txHash = "0xdeadbeef" as Hex;
    (client.readContract as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false) // isDeployed
      .mockResolvedValueOnce(P256_OWNER_ADDR); // computeAddress
    (wallet.writeContract as ReturnType<typeof vi.fn>).mockResolvedValue(txHash);

    const result = await deployP256Owner(wallet, client, P256_FACTORY, P256_X, P256_Y);

    expect(result.alreadyDeployed).toBe(false);
    expect(result.address).toBe(P256_OWNER_ADDR);
    expect(result.txHash).toBe(txHash);
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: P256_FACTORY,
        abi: P256_OWNER_FACTORY_ABI,
        functionName: "createP256Owner",
        args: [P256_X, P256_Y],
      }),
    );
  });

  it("should throw when walletClient has no account", async () => {
    const client = mockPublicClient();
    const wallet = { writeContract: vi.fn() } as unknown as WalletClient;
    (client.readContract as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(P256_OWNER_ADDR);

    await expect(deployP256Owner(wallet, client, P256_FACTORY, P256_X, P256_Y)).rejects.toThrow(
      "WalletClient must have an account configured",
    );
  });
});

// --- WebAuthn Signer Factory Tests ---

const WA_FACTORY = "0xaaBBccDDeeFf00112233445566778899aAbBcCdD" as Hex;
const WA_VERIFIER = "0xc2b78104907F722DABAc4C69f826a522B2754De4" as Hex;
const WA_SIGNER_ADDR = "0x1111111111111111111111111111111111111111" as Hex;
const WA_X = 100n;
const WA_Y = 200n;

describe("WEBAUTHN_SIGNER_FACTORY_ABI", () => {
  it("should export ABI with createSigner and getSigner", () => {
    const names = WEBAUTHN_SIGNER_FACTORY_ABI.map(f => f.name);
    expect(names).toContain("createSigner");
    expect(names).toContain("getSigner");
  });
});

describe("computeWebAuthnSignerAddress", () => {
  it("should call readContract with getSigner and return the address", async () => {
    const client = mockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(WA_SIGNER_ADDR);

    const result = await computeWebAuthnSignerAddress(client, WA_FACTORY, WA_VERIFIER, WA_X, WA_Y);

    expect(result).toBe(WA_SIGNER_ADDR);
    expect(client.readContract).toHaveBeenCalledWith({
      address: WA_FACTORY,
      abi: WEBAUTHN_SIGNER_FACTORY_ABI,
      functionName: "getSigner",
      args: [WA_X, WA_Y, computeVerifiers(WA_VERIFIER)],
    });
  });
});

describe("isWebAuthnSignerDeployed", () => {
  it("should return true when code exists at address", async () => {
    const client = mockPublicClient();
    (client.getCode as ReturnType<typeof vi.fn>).mockResolvedValue("0x6080");

    const result = await isWebAuthnSignerDeployed(client, WA_SIGNER_ADDR);

    expect(result).toBe(true);
    expect(client.getCode).toHaveBeenCalledWith({ address: WA_SIGNER_ADDR });
  });

  it("should return false when no code at address", async () => {
    const client = mockPublicClient();
    (client.getCode as ReturnType<typeof vi.fn>).mockResolvedValue("0x");

    const result = await isWebAuthnSignerDeployed(client, WA_SIGNER_ADDR);
    expect(result).toBe(false);
  });

  it("should return false when getCode returns undefined", async () => {
    const client = mockPublicClient();
    (client.getCode as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await isWebAuthnSignerDeployed(client, WA_SIGNER_ADDR);
    expect(result).toBe(false);
  });
});

describe("deployWebAuthnSigner", () => {
  it("should return alreadyDeployed=true and skip tx when already deployed", async () => {
    const client = mockPublicClient();
    const wallet = mockWalletClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(WA_SIGNER_ADDR);
    (client.getCode as ReturnType<typeof vi.fn>).mockResolvedValue("0x6080");

    const result = await deployWebAuthnSigner(wallet, client, WA_FACTORY, WA_VERIFIER, WA_X, WA_Y);

    expect(result.alreadyDeployed).toBe(true);
    expect(result.address).toBe(WA_SIGNER_ADDR);
    expect(result.txHash).toBeUndefined();
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("should deploy and return txHash when not yet deployed", async () => {
    const client = mockPublicClient();
    const wallet = mockWalletClient();
    const txHash = "0xcafebabe" as Hex;
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(WA_SIGNER_ADDR);
    (client.getCode as ReturnType<typeof vi.fn>).mockResolvedValue("0x");
    (wallet.writeContract as ReturnType<typeof vi.fn>).mockResolvedValue(txHash);

    const result = await deployWebAuthnSigner(wallet, client, WA_FACTORY, WA_VERIFIER, WA_X, WA_Y);

    expect(result.alreadyDeployed).toBe(false);
    expect(result.address).toBe(WA_SIGNER_ADDR);
    expect(result.txHash).toBe(txHash);
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: WA_FACTORY,
        abi: WEBAUTHN_SIGNER_FACTORY_ABI,
        functionName: "createSigner",
        args: [WA_X, WA_Y, computeVerifiers(WA_VERIFIER)],
      }),
    );
  });

  it("should throw when walletClient has no account", async () => {
    const client = mockPublicClient();
    const wallet = { writeContract: vi.fn() } as unknown as WalletClient;
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(WA_SIGNER_ADDR);
    (client.getCode as ReturnType<typeof vi.fn>).mockResolvedValue("0x");

    await expect(
      deployWebAuthnSigner(wallet, client, WA_FACTORY, WA_VERIFIER, WA_X, WA_Y),
    ).rejects.toThrow("WalletClient must have an account configured");
  });
});

describe("computeVerifiers", () => {
  it("should use default RIP_7212_PRECOMPILE and combine with fallback via bit-shift OR", () => {
    const fallbackVerifier = "0x000000000000000000000000000000000000ABCD" as Hex;
    const result = computeVerifiers(fallbackVerifier);

    // Expected: (RIP_7212_PRECOMPILE << 160n) | BigInt(fallbackVerifier)
    const expected = (RIP_7212_PRECOMPILE << 160n) | BigInt(fallbackVerifier);
    expect(result).toBe(expected);
    // The result should be larger than just the fallback (precompile is in upper bits)
    expect(result).toBeGreaterThan(BigInt(fallbackVerifier));
  });

  it("should return fallback only when precompile is null", () => {
    const fallbackVerifier = "0x000000000000000000000000000000000000ABCD" as Hex;
    const result = computeVerifiers(fallbackVerifier, null);

    expect(result).toBe(BigInt(fallbackVerifier));
  });

  it("should return fallback only when precompile is 0n", () => {
    const fallbackVerifier = "0x000000000000000000000000000000000000ABCD" as Hex;
    const result = computeVerifiers(fallbackVerifier, 0n);

    expect(result).toBe(BigInt(fallbackVerifier));
  });

  it("should use explicit custom precompile value", () => {
    const fallbackVerifier = "0xc2b78104907F722DABAc4C69f826a522B2754De4" as Hex;
    const customPrecompile = 0x200n;
    const result = computeVerifiers(fallbackVerifier, customPrecompile);

    const expected = (customPrecompile << 160n) | BigInt(fallbackVerifier);
    expect(result).toBe(expected);
  });

  it("should produce consistent results with known WA_VERIFIER", () => {
    // computeVerifiers is used internally by computeWebAuthnSignerAddress and deployWebAuthnSigner
    // Verify the result is consistent
    const result1 = computeVerifiers(WA_VERIFIER);
    const result2 = computeVerifiers(WA_VERIFIER, RIP_7212_PRECOMPILE);
    expect(result1).toBe(result2);
  });
});
