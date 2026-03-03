import type { Chain, Hex, PublicClient, Transport } from "viem";
import type { WebAuthnAccount } from "viem/account-abstraction";

/**
 * Abstraction for signing Safe message hashes.
 * Used by ExactEvmSchemeEIP3009 to produce EIP-1271 contract signatures
 * regardless of the underlying signer type (P256 or WebAuthn).
 */
export interface SafeMessageSigner {
  ownerAddress: Hex;
  sign(safeMessageHash: Hex): Promise<Hex>;
}

export type P256Signer = {
  p256OwnerAddress: Hex;
  sign: (hash: Hex) => Promise<{ r: Hex; s: Hex }>;
};

export type ToP256SafeSmartAccountParams = {
  client: PublicClient<Transport, Chain>;
  p256Signer: P256Signer;
  safeAddress?: Hex;
  entryPoint?: { address: Hex; version: "0.7" };
  safe4337ModuleAddress?: Hex;
};

export type P256SignerConfig = {
  type: "p256";
  p256Signer: P256Signer;
};

export type WebAuthnSignerConfig = {
  type: "webauthn";
  webAuthnAccount: WebAuthnAccount;
  safeWebAuthnSharedSignerAddress?: Hex;
};

export type MultiSignerConfig = {
  type: "multi";
  signers: {
    p256?: P256Signer;
    webAuthn?: WebAuthnAccount;
  };
  threshold?: number;
  safeWebAuthnSharedSignerAddress?: Hex;
};

export type SignerConfig = P256SignerConfig | WebAuthnSignerConfig | MultiSignerConfig;

export type ToSafeSmartAccountParams = {
  client: PublicClient<Transport, Chain>;
  signerConfig: SignerConfig;
  safeAddress?: Hex;
  entryPoint?: { address: Hex; version: "0.7" };
  safe4337ModuleAddress?: Hex;
};
