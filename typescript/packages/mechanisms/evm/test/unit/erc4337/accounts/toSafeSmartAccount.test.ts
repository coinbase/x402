import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Hex, PublicClient, Transport, Chain } from "viem";
import type { SmartAccount, WebAuthnAccount } from "viem/account-abstraction";
import type { P256Signer } from "../../../../src/erc4337/accounts/types";
import { SAFE_WEBAUTHN_SHARED_SIGNER } from "../../../../src/erc4337/constants";

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
import { toSafeSmartAccount as permissionlessToSafe } from "permissionless/accounts";

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

    describe("both p256 and webauthn signers (buildMultiSignerAccount)", () => {
      const mockBaseAccount = {
        address: "0xSafeAddress1234567890123456789012345678" as Hex,
        signUserOperation: vi.fn(),
        encodeCalls: vi.fn(),
        getNonce: vi.fn(),
      } as unknown as SmartAccount;

      beforeEach(() => {
        (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
      });

      it("should call permissionless with both owners (threshold 1 path)", async () => {
        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: mockWebAuthnAccount,
            },
            threshold: 1,
          },
        });

        // Should NOT delegate to the single-signer wrappers
        expect(toP256SafeSmartAccount).not.toHaveBeenCalled();
        expect(toWebAuthnSafeSmartAccount).not.toHaveBeenCalled();

        // permissionless should be called with two owners
        expect(permissionlessToSafe).toHaveBeenCalledTimes(1);
        const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.owners).toHaveLength(2);
        expect(callArgs.threshold).toBe(1n);

        // The returned account should have a custom signUserOperation
        expect(typeof account.signUserOperation).toBe("function");
        expect(account.signUserOperation).not.toBe(mockBaseAccount.signUserOperation);
      });

      it("should call permissionless with both owners (threshold >= 2 path)", async () => {
        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: mockWebAuthnAccount,
            },
            threshold: 2,
          },
        });

        expect(toP256SafeSmartAccount).not.toHaveBeenCalled();
        expect(toWebAuthnSafeSmartAccount).not.toHaveBeenCalled();

        expect(permissionlessToSafe).toHaveBeenCalledTimes(1);
        const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.owners).toHaveLength(2);
        expect(callArgs.threshold).toBe(2n);

        // The returned account should have signUserOperation
        expect(typeof account.signUserOperation).toBe("function");
      });

      it("should default threshold to 1 when not provided", async () => {
        await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: mockWebAuthnAccount,
            },
            // threshold not provided, defaults to 1
          },
        });

        const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.threshold).toBe(1n);
      });
    });

    describe("signUserOperation (threshold 1, P256 only)", () => {
      const mockBaseAccount = {
        address: "0xSafeAddress1234567890123456789012345678" as Hex,
        signUserOperation: vi.fn(),
        encodeCalls: vi.fn(),
        getNonce: vi.fn(),
      } as unknown as SmartAccount;

      beforeEach(() => {
        (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
      });

      it("should produce a signature with validAfter + validUntil + contractSig", async () => {
        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: mockWebAuthnAccount,
            },
            threshold: 1,
          },
        });

        const mockUserOp = {
          sender: "0x1111111111111111111111111111111111111111" as Hex,
          nonce: 0n,
          callData: "0x" as Hex,
          callGasLimit: 50000n,
          verificationGasLimit: 100000n,
          preVerificationGas: 21000n,
          maxPriorityFeePerGas: 1000000000n,
          maxFeePerGas: 1000000000n,
        };

        const sig = await account.signUserOperation(mockUserOp);
        expect(sig).toBeDefined();
        expect(typeof sig).toBe("string");
        expect(sig.startsWith("0x")).toBe(true);

        // validAfter (6 bytes) + validUntil (6 bytes) = 12 bytes = 24 hex chars
        // The signature must be at least 12 bytes + some contract signature bytes
        const hexWithoutPrefix = sig.slice(2);
        expect(hexWithoutPrefix.length).toBeGreaterThanOrEqual(24);

        // Verify P256 signer was called
        expect(mockP256Signer.sign).toHaveBeenCalledTimes(1);
      });

      it("should call extractSafeOpHashParams with userOp fields", async () => {
        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: mockWebAuthnAccount,
            },
            threshold: 1,
          },
        });

        const mockUserOp = {
          sender: "0x2222222222222222222222222222222222222222" as Hex,
          nonce: 5n,
          factory: "0x3333333333333333333333333333333333333333" as Hex,
          factoryData: "0xdeadbeef" as Hex,
          callData: "0xabcd" as Hex,
          callGasLimit: 100n,
          verificationGasLimit: 200n,
          preVerificationGas: 300n,
          maxPriorityFeePerGas: 400n,
          maxFeePerGas: 500n,
          paymaster: "0x4444444444444444444444444444444444444444" as Hex,
          paymasterVerificationGasLimit: 600n,
          paymasterPostOpGasLimit: 700n,
          paymasterData: "0xcafe" as Hex,
        };

        // This calls extractSafeOpHashParams internally and then p256Signer.sign
        await account.signUserOperation(mockUserOp);

        // The P256 signer should have been called with a hash (Hex string)
        expect(mockP256Signer.sign).toHaveBeenCalledTimes(1);
        const hashArg = (mockP256Signer.sign as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(typeof hashArg).toBe("string");
        expect(hashArg.startsWith("0x")).toBe(true);
      });
    });

    describe("signUserOperation (threshold 2, both signers)", () => {
      const mockBaseAccount = {
        address: "0xSafeAddress1234567890123456789012345678" as Hex,
        signUserOperation: vi.fn(),
        encodeCalls: vi.fn(),
        getNonce: vi.fn(),
      } as unknown as SmartAccount;

      // WebAuthn sign returns a raw 64-byte P256 signature + webauthn metadata
      const mockWebAuthnSign = vi.fn().mockResolvedValue({
        signature: "0x" + "aa".repeat(32) + "bb".repeat(32),
        webauthn: {
          authenticatorData: "0x" + "11".repeat(37) as Hex,
          clientDataJSON:
            '{"type":"webauthn.get","challenge":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","origin":"https://example.com"}',
        },
      });

      const webAuthnAccountWithSign = {
        publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
        sign: mockWebAuthnSign,
      } as unknown as WebAuthnAccount;

      beforeEach(() => {
        (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
        mockWebAuthnSign.mockClear();
      });

      it("should call both signers and produce a multi-signature", async () => {
        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: webAuthnAccountWithSign,
            },
            threshold: 2,
          },
        });

        const mockUserOp = {
          sender: "0x1111111111111111111111111111111111111111" as Hex,
          nonce: 0n,
          callData: "0x" as Hex,
          callGasLimit: 50000n,
          verificationGasLimit: 100000n,
          preVerificationGas: 21000n,
          maxPriorityFeePerGas: 1000000000n,
          maxFeePerGas: 1000000000n,
        };

        const sig = await account.signUserOperation(mockUserOp);

        // Both signers should have been called
        expect(mockP256Signer.sign).toHaveBeenCalledTimes(1);
        expect(mockWebAuthnSign).toHaveBeenCalledTimes(1);

        // Signature should be non-empty hex
        expect(sig).toBeDefined();
        expect(typeof sig).toBe("string");
        expect(sig.startsWith("0x")).toBe(true);

        // Should contain validAfter + validUntil + multi-sig
        const hexWithoutPrefix = sig.slice(2);
        // 12 bytes for validAfter/Until + at least 130 bytes for two static parts (65 * 2) + dynamic
        expect(hexWithoutPrefix.length).toBeGreaterThanOrEqual(24 + 260);
      });

      it("should produce signatures sorted by signer address", async () => {
        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: webAuthnAccountWithSign,
            },
            threshold: 2,
          },
        });

        const mockUserOp = {
          sender: "0x1111111111111111111111111111111111111111" as Hex,
          nonce: 0n,
          callData: "0x" as Hex,
          callGasLimit: 50000n,
          verificationGasLimit: 100000n,
          preVerificationGas: 21000n,
          maxPriorityFeePerGas: 1000000000n,
          maxFeePerGas: 1000000000n,
        };

        const sig = await account.signUserOperation(mockUserOp);

        // After validAfter (12 hex) + validUntil (12 hex) = 24 hex chars,
        // the multi-sig starts. Each static part is 65 bytes = 130 hex chars.
        // The first static part starts at offset 24 and contains the lower address.
        const sigBody = sig.slice(2 + 24); // skip 0x + validAfter + validUntil

        // First 64 hex chars (32 bytes) of the first static part = padded address of lower signer
        const firstR = sigBody.slice(0, 64);
        const firstAddress = "0x" + firstR.slice(24); // last 20 bytes of the padded address

        // p256OwnerAddress vs SAFE_WEBAUTHN_SHARED_SIGNER
        const p256Lower = mockP256Signer.p256OwnerAddress.toLowerCase();
        const webauthnLower = SAFE_WEBAUTHN_SHARED_SIGNER.toLowerCase();
        const expectedFirst = p256Lower < webauthnLower ? p256Lower : webauthnLower;

        expect(firstAddress.toLowerCase()).toBe(expectedFirst.toLowerCase());
      });
    });

    describe("mock owner notImplemented methods", () => {
      const mockBaseAccount = {
        address: "0xSafeAddress1234567890123456789012345678" as Hex,
        signUserOperation: vi.fn(),
        encodeCalls: vi.fn(),
        getNonce: vi.fn(),
      } as unknown as SmartAccount;

      beforeEach(() => {
        (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
      });

      it("should throw when calling signMessage on mock owner", async () => {
        await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: mockWebAuthnAccount,
            },
            threshold: 1,
          },
        });

        // Capture the mock owners passed to permissionless toSafeSmartAccount
        const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const mockOwner = callArgs.owners[0];

        // The mock owner's signMessage should throw "Mock owner: use signUserOperation instead"
        expect(() => mockOwner.signMessage()).toThrow(
          "Mock owner: use signUserOperation instead",
        );
      });
    });

    describe("multi signer with safeWebAuthnSharedSignerAddress", () => {
      it("should pass safeWebAuthnSharedSignerAddress through when only webAuthn signer and multi type", async () => {
        const sharedSignerAddress = "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9" as Hex;

        await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              webAuthn: mockWebAuthnAccount,
            },
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

    describe("encodeWebAuthnSignature (via threshold 2 path)", () => {
      const mockBaseAccount = {
        address: "0xSafeAddress1234567890123456789012345678" as Hex,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      beforeEach(() => {
        (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
      });

      it("should extract clientDataFields after challenge from clientDataJSON", async () => {
        const mockWebAuthnSign = vi.fn().mockResolvedValue({
          signature: "0x" + "aa".repeat(32) + "bb".repeat(32),
          webauthn: {
            authenticatorData: "0x" + "11".repeat(37) as Hex,
            clientDataJSON:
              '{"type":"webauthn.get","challenge":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","origin":"https://example.com","crossOrigin":false}',
          },
        });

        const webAuthnForTest = {
          publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
          sign: mockWebAuthnSign,
        } as unknown as WebAuthnAccount;

        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: webAuthnForTest,
            },
            threshold: 2,
          },
        });

        const mockUserOp = {
          sender: "0x1111111111111111111111111111111111111111" as Hex,
          nonce: 0n,
          callData: "0x" as Hex,
          callGasLimit: 50000n,
          verificationGasLimit: 100000n,
          preVerificationGas: 21000n,
          maxPriorityFeePerGas: 1000000000n,
          maxFeePerGas: 1000000000n,
        };

        // Should not throw -- ensures the DER parsing and ABI encoding work
        const sig = await account.signUserOperation(mockUserOp);
        expect(sig).toBeDefined();
        expect(mockWebAuthnSign).toHaveBeenCalledTimes(1);
      });

      it("should handle clientDataJSON where regex does not match", async () => {
        const mockWebAuthnSign = vi.fn().mockResolvedValue({
          signature: "0x" + "aa".repeat(32) + "bb".repeat(32),
          webauthn: {
            authenticatorData: "0x" + "11".repeat(37) as Hex,
            // Non-standard clientDataJSON that won't match the regex
            clientDataJSON: '{"type":"webauthn.get","challenge":"short"}',
          },
        });

        const webAuthnForTest = {
          publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
          sign: mockWebAuthnSign,
        } as unknown as WebAuthnAccount;

        const account = await toSafeSmartAccount({
          client: mockClient,
          signerConfig: {
            type: "multi",
            signers: {
              p256: mockP256Signer,
              webAuthn: webAuthnForTest,
            },
            threshold: 2,
          },
        });

        const mockUserOp = {
          sender: "0x1111111111111111111111111111111111111111" as Hex,
          nonce: 0n,
          callData: "0x" as Hex,
          callGasLimit: 50000n,
          verificationGasLimit: 100000n,
          preVerificationGas: 21000n,
          maxPriorityFeePerGas: 1000000000n,
          maxFeePerGas: 1000000000n,
        };

        // Falls back to clientDataFields = "" when regex doesn't match
        const sig = await account.signUserOperation(mockUserOp);
        expect(sig).toBeDefined();
      });
    });
  });
});
