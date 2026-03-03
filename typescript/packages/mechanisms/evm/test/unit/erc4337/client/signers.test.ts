import { describe, expect, it, vi } from "vitest";
import type { WebAuthnAccount } from "viem/account-abstraction";
import type { Hex } from "viem";
import { decodeAbiParameters } from "viem";
import {
  createP256SafeMessageSigner,
  createWebAuthnSafeMessageSigner,
} from "../../../../src/exact/client/erc4337/signers/safeMessageSigners";
import type { P256Signer } from "../../../../src/erc4337/accounts/types";

describe("createP256SafeMessageSigner", () => {
  const ownerAddress = "0x1234567890123456789012345678901234567890" as Hex;
  const mockR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
  const mockS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

  function createMockP256Signer(): P256Signer {
    return {
      p256OwnerAddress: ownerAddress,
      sign: vi.fn().mockResolvedValue({ r: mockR, s: mockS }),
    };
  }

  it("should set ownerAddress from p256Signer", () => {
    const p256Signer = createMockP256Signer();
    const signer = createP256SafeMessageSigner(p256Signer);

    expect(signer.ownerAddress).toBe(ownerAddress);
  });

  it("should return concat([r, s]) from sign", async () => {
    const p256Signer = createMockP256Signer();
    const signer = createP256SafeMessageSigner(p256Signer);

    const hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    const result = await signer.sign(hash);

    // concat([r, s]) = 64 bytes = 128 hex chars + 0x prefix
    expect(result).toBe(
      "0x" +
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });

  it("should pass the safeMessageHash to the underlying signer", async () => {
    const p256Signer = createMockP256Signer();
    const signer = createP256SafeMessageSigner(p256Signer);

    const hash = "0xdeadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678" as Hex;
    await signer.sign(hash);

    expect(p256Signer.sign).toHaveBeenCalledWith(hash);
  });

  it("should propagate errors from the underlying signer", async () => {
    const p256Signer: P256Signer = {
      p256OwnerAddress: ownerAddress,
      sign: vi.fn().mockRejectedValue(new Error("Signing failed")),
    };
    const signer = createP256SafeMessageSigner(p256Signer);

    const hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    await expect(signer.sign(hash)).rejects.toThrow("Signing failed");
  });
});

describe("createWebAuthnSafeMessageSigner", () => {
  const deployedSignerAddress = "0xDeployedSigner0000000000000000000000000001" as Hex;

  const mockAuthenticatorData =
    "0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763050000000d" as Hex;
  const mockClientDataJSON =
    '{"type":"webauthn.get","challenge":"dGVzdC1jaGFsbGVuZ2UtMTIzNDU2Nzg5MDEyMzQ1Njc","origin":"https://example.com","crossOrigin":false}';

  // 64-byte raw P256 signature (r || s, no DER)
  const mockR = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const mockS = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const mockSignatureHex = ("0x" + mockR + mockS) as Hex;

  function createMockWebAuthnAccount(): WebAuthnAccount {
    return {
      publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
      sign: vi.fn().mockResolvedValue({
        signature: mockSignatureHex,
        webauthn: {
          authenticatorData: mockAuthenticatorData,
          clientDataJSON: mockClientDataJSON,
        },
      }),
    } as unknown as WebAuthnAccount;
  }

  it("should set ownerAddress to the deployed signer address", () => {
    const webAuthnAccount = createMockWebAuthnAccount();
    const signer = createWebAuthnSafeMessageSigner(webAuthnAccount, deployedSignerAddress);

    expect(signer.ownerAddress).toBe(deployedSignerAddress);
  });

  it("should call webAuthnAccount.sign with the hash", async () => {
    const webAuthnAccount = createMockWebAuthnAccount();
    const signer = createWebAuthnSafeMessageSigner(webAuthnAccount, deployedSignerAddress);

    const hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    await signer.sign(hash);

    expect(webAuthnAccount.sign).toHaveBeenCalledWith({ hash });
  });

  it("should return ABI-encoded WebAuthn struct", async () => {
    const webAuthnAccount = createMockWebAuthnAccount();
    const signer = createWebAuthnSafeMessageSigner(webAuthnAccount, deployedSignerAddress);

    const hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    const result = await signer.sign(hash);

    // Decode the ABI-encoded result
    const decoded = decodeAbiParameters(
      [
        { name: "authenticatorData", type: "bytes" },
        { name: "clientDataFields", type: "string" },
        { name: "signature", type: "uint256[2]" },
      ],
      result,
    );

    expect(decoded[0]).toBe(mockAuthenticatorData);
    // clientDataFields should be the part after challenge
    expect(decoded[1]).toBe('"origin":"https://example.com","crossOrigin":false');
    expect(decoded[2][0]).toBe(BigInt("0x" + mockR));
    expect(decoded[2][1]).toBe(BigInt("0x" + mockS));
  });

  it("should propagate errors from the WebAuthn account", async () => {
    const webAuthnAccount = {
      publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
      sign: vi.fn().mockRejectedValue(new Error("User cancelled")),
    } as unknown as WebAuthnAccount;

    const signer = createWebAuthnSafeMessageSigner(webAuthnAccount, deployedSignerAddress);
    const hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;

    await expect(signer.sign(hash)).rejects.toThrow("User cancelled");
  });

  it("should handle clientDataJSON without extra fields after challenge", async () => {
    const minimalClientDataJSON =
      '{"type":"webauthn.get","challenge":"dGVzdC1jaGFsbGVuZ2UtMTIzNDU2Nzg5MDEyMzQ1Njc"}';

    const webAuthnAccount = {
      publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
      sign: vi.fn().mockResolvedValue({
        signature: mockSignatureHex,
        webauthn: {
          authenticatorData: mockAuthenticatorData,
          clientDataJSON: minimalClientDataJSON,
        },
      }),
    } as unknown as WebAuthnAccount;

    const signer = createWebAuthnSafeMessageSigner(webAuthnAccount, deployedSignerAddress);
    const hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    const result = await signer.sign(hash);

    const decoded = decodeAbiParameters(
      [
        { name: "authenticatorData", type: "bytes" },
        { name: "clientDataFields", type: "string" },
        { name: "signature", type: "uint256[2]" },
      ],
      result,
    );

    // No extra fields after challenge, so clientDataFields should be empty
    expect(decoded[1]).toBe("");
  });
});
