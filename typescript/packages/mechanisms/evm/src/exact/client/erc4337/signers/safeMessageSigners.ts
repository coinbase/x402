import { type Hex, concat, encodeAbiParameters } from "viem";
import type { WebAuthnAccount } from "viem/account-abstraction";
import type { P256Signer, SafeMessageSigner } from "../../../../erc4337/accounts/types";

/**
 * Creates a SafeMessageSigner from a P256Signer.
 * The sign method returns concat([r, s]) (64 bytes raw P256 signature).
 *
 * @param p256Signer - The P256 signer to wrap
 * @returns A SafeMessageSigner that produces raw P256 signatures
 */
export function createP256SafeMessageSigner(p256Signer: P256Signer): SafeMessageSigner {
  return {
    ownerAddress: p256Signer.p256OwnerAddress,
    async sign(safeMessageHash: Hex): Promise<Hex> {
      const { r, s } = await p256Signer.sign(safeMessageHash);
      return concat([r, s]);
    },
  };
}

/**
 * Creates a SafeMessageSigner from a WebAuthnAccount.
 * The sign method triggers navigator.credentials.get() and returns
 * ABI-encoded WebAuthn struct compatible with Safe's verifier.
 *
 * @param webAuthnAccount - viem WebAuthnAccount (wraps credential + getFn)
 * @param deployedSignerAddress - Address of the per-credential signer deployed
 *   via SafeWebAuthnSignerFactory (NOT the SharedSigner)
 * @returns A SafeMessageSigner that produces ABI-encoded WebAuthn signatures
 */
export function createWebAuthnSafeMessageSigner(
  webAuthnAccount: WebAuthnAccount,
  deployedSignerAddress: Hex,
): SafeMessageSigner {
  return {
    ownerAddress: deployedSignerAddress,
    async sign(safeMessageHash: Hex): Promise<Hex> {
      return encodeWebAuthnSignature(webAuthnAccount, safeMessageHash);
    },
  };
}

/**
 * Encodes a WebAuthn signature from raw sign() output into the ABI format
 * expected by Safe's WebAuthn verifier:
 * `(bytes authenticatorData, string clientDataFields, uint256[2] signature)`
 *
 * @param owner - The WebAuthn account to sign with
 * @param hash - The hash to sign
 * @returns The ABI-encoded WebAuthn signature
 */
async function encodeWebAuthnSignature(owner: WebAuthnAccount, hash: Hex): Promise<Hex> {
  const { signature: signatureData, webauthn } = await owner.sign({ hash });

  const sigBytes = signatureData.slice(2);
  const r = BigInt("0x" + sigBytes.slice(0, 64));
  const s = BigInt("0x" + sigBytes.slice(64, 128));

  const match = webauthn.clientDataJSON.match(
    /^\{"type":"webauthn.get","challenge":"[A-Za-z0-9\-_]{43}",(.*)\}$/,
  );
  const clientDataFields = match ? match[1] : "";

  return encodeAbiParameters(
    [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataFields", type: "string" },
      { name: "signature", type: "uint256[2]" },
    ],
    [webauthn.authenticatorData, clientDataFields, [r, s]],
  );
}
