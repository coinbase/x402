import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Hex, PublicClient, Transport, Chain } from "viem";
import type { SmartAccount, WebAuthnAccount } from "viem/account-abstraction";
import type { P256Signer } from "../../../../src/erc4337/accounts/types";

// Mock the dependent modules
vi.mock("../../../../src/erc4337/accounts/toP256SafeSmartAccount", () => ({
  toP256SafeSmartAccount: vi.fn(),
}));

vi.mock("../../../../src/erc4337/accounts/toWebAuthnSafeSmartAccount", () => ({
  toWebAuthnSafeSmartAccount: vi.fn(),
}));

vi.mock("permissionless/accounts", () => ({
  toSafeSmartAccount: vi.fn(),
}));

import { toSafeSmartAccount } from "../../../../src/erc4337/accounts/toSafeSmartAccount";
import { toP256SafeSmartAccount } from "../../../../src/erc4337/accounts/toP256SafeSmartAccount";
import { toWebAuthnSafeSmartAccount } from "../../../../src/erc4337/accounts/toWebAuthnSafeSmartAccount";

describe("toSafeSmartAccount", () => {
  const mockClient = {
    getChainId: vi.fn().mockResolvedValue(84532),
  } as unknown as PublicClient<Transport, Chain>;

  const mockP256Signer: P256Signer = {
    p256OwnerAddress: "0x1234567890123456789012345678901234567890" as Hex,
    sign: vi.fn().mockResolvedValue({
      r: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
      s: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex,
    }),
  };

  const mockWebAuthnAccount = {
    publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
    sign: vi.fn(),
  } as unknown as WebAuthnAccount;

  const mockSmartAccount = {
    address: "0xSafeAddress1234567890123456789012345678" as Hex,
    signUserOperation: vi.fn(),
  } as unknown as SmartAccount;

  beforeEach(() => {
    vi.clearAllMocks();
    (toP256SafeSmartAccount as ReturnType<typeof vi.fn>).mockResolvedValue(mockSmartAccount);
    (toWebAuthnSafeSmartAccount as ReturnType<typeof vi.fn>).mockResolvedValue(mockSmartAccount);
  });

  describe('type: "p256"', () => {
    it("should delegate to toP256SafeSmartAccount", async () => {
      const result = await toSafeSmartAccount({
        client: mockClient,
        signerConfig: {
          type: "p256",
          p256Signer: mockP256Signer,
        },
      });

      expect(toP256SafeSmartAccount).toHaveBeenCalledTimes(1);
      expect(toP256SafeSmartAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          client: mockClient,
          p256Signer: mockP256Signer,
        }),
      );
      expect(result).toBe(mockSmartAccount);
    });

    it("should pass optional safeAddress and entryPoint", async () => {
      const safeAddress = "0xABCDEF0123456789ABCDEF0123456789ABCDEF01" as Hex;
      const entryPoint = {
        address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Hex,
        version: "0.7" as const,
      };

      await toSafeSmartAccount({
        client: mockClient,
        signerConfig: {
          type: "p256",
          p256Signer: mockP256Signer,
        },
        safeAddress,
        entryPoint,
      });

      expect(toP256SafeSmartAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          safeAddress,
          entryPoint,
        }),
      );
    });
  });

  describe('type: "webauthn"', () => {
    it("should delegate to toWebAuthnSafeSmartAccount", async () => {
      const result = await toSafeSmartAccount({
        client: mockClient,
        signerConfig: {
          type: "webauthn",
          webAuthnAccount: mockWebAuthnAccount,
        },
      });

      expect(toWebAuthnSafeSmartAccount).toHaveBeenCalledTimes(1);
      expect(toWebAuthnSafeSmartAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          client: mockClient,
          webAuthnAccount: mockWebAuthnAccount,
        }),
      );
      expect(result).toBe(mockSmartAccount);
    });

    it("should pass safeWebAuthnSharedSignerAddress when provided", async () => {
      const sharedSignerAddress = "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9" as Hex;

      await toSafeSmartAccount({
        client: mockClient,
        signerConfig: {
          type: "webauthn",
          webAuthnAccount: mockWebAuthnAccount,
          safeWebAuthnSharedSignerAddress: sharedSignerAddress,
        },
      });

      expect(toWebAuthnSafeSmartAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          safeWebAuthnSharedSignerAddress: sharedSignerAddress,
        }),
      );
    });
  });

  describe('type: "multi"', () => {
    it("should delegate to toP256SafeSmartAccount when only P256 signer is provided", async () => {
      await toSafeSmartAccount({
        client: mockClient,
        signerConfig: {
          type: "multi",
          signers: {
            p256: mockP256Signer,
          },
        },
      });

      expect(toP256SafeSmartAccount).toHaveBeenCalledTimes(1);
      expect(toP256SafeSmartAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          client: mockClient,
          p256Signer: mockP256Signer,
        }),
      );
      expect(toWebAuthnSafeSmartAccount).not.toHaveBeenCalled();
    });

    it('should throw "Multi-signer config requires at least one signer" with no signers', async () => {
      await expect(
        toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {},
          },
        }),
      ).rejects.toThrow("Multi-signer config requires at least one signer");
    });

    it("should delegate to toWebAuthnSafeSmartAccount when only WebAuthn signer is provided", async () => {
      await toSafeSmartAccount({
        client: mockClient,
        signerConfig: {
          type: "multi",
          signers: {
            webAuthn: mockWebAuthnAccount,
          },
        },
      });

      expect(toWebAuthnSafeSmartAccount).toHaveBeenCalledTimes(1);
      expect(toWebAuthnSafeSmartAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          client: mockClient,
          webAuthnAccount: mockWebAuthnAccount,
        }),
      );
      expect(toP256SafeSmartAccount).not.toHaveBeenCalled();
    });
  });
});
