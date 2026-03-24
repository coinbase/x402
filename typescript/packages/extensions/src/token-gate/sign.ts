/**
 * Client-side proof signing for token-gate extension
 *
 * Creates EIP-191 (EVM) or ed25519 (Solana) proofs that prove wallet ownership
 * without requiring any on-chain transaction.
 */

import { base58 } from "@scure/base";
import type {
  TokenGateProof,
  TokenGateEvmSigner,
  TokenGateSigner,
  TokenGateSolanaSigner,
  TokenGateWalletAdapterSigner,
  TokenGateSolanaKitSigner,
} from "./types";

// Re-export for consumers that import TokenGateSigner from sign.ts (backward compat)
export type { TokenGateEvmSigner, TokenGateSigner } from "./types";

/**
 * Build the canonical message string for a token-gate proof.
 *
 * @param domain - Server domain
 * @param issuedAt - ISO 8601 timestamp
 * @returns Message string for signing
 */
export function buildProofMessage(domain: string, issuedAt: string): string {
  return `token-gate proof for ${domain} at ${issuedAt}`;
}

// ---------------------------------------------------------------------------
// Signer detection helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the signer is a Solana signer (wallet-adapter or @solana/kit style).
 *
 * @param signer - Signer to detect
 * @returns True if the signer is a Solana signer
 */
function isSolanaSigner(signer: TokenGateSigner): signer is TokenGateSolanaSigner {
  // SolanaKit: unique signMessages method
  if ("signMessages" in signer) return true;
  // WalletAdapter: has publicKey, but viem accounts also have publicKey as `0x...` hex.
  // Solana publicKey is either a PublicKey object or a base58 string (no 0x prefix).
  if ("publicKey" in signer) {
    const pk = (signer as { publicKey: unknown }).publicKey;
    if (typeof pk === "object" && pk !== null) return true; // PublicKey object
    if (typeof pk === "string" && !pk.startsWith("0x")) return true; // base58 string
  }
  return false;
}

/**
 * Returns true if the Solana signer is a wallet-adapter style signer.
 *
 * @param signer - Solana signer to detect
 * @returns True if the signer is a WalletAdapter signer
 */
function isWalletAdapterSigner(
  signer: TokenGateSolanaSigner,
): signer is TokenGateWalletAdapterSigner {
  return "publicKey" in signer;
}

/**
 * Returns true if the Solana signer is a @solana/kit KeyPairSigner style.
 *
 * @param signer - Solana signer to detect
 * @returns True if the signer is a @solana/kit signer
 */
function isKitSigner(signer: TokenGateSolanaSigner): signer is TokenGateSolanaKitSigner {
  return "signMessages" in signer;
}

/**
 * Extracts the base58 address string from a Solana signer.
 *
 * @param signer - Solana signer to extract address from
 * @returns Base58-encoded public key string
 */
function getSolanaAddress(signer: TokenGateSolanaSigner): string {
  if (isWalletAdapterSigner(signer)) {
    const pk = signer.publicKey;
    return typeof pk === "string" ? pk : pk.toBase58();
  }
  return signer.address;
}

/**
 * Signs a message with a Solana signer and returns the base58-encoded signature.
 *
 * @param message - Message string to sign
 * @param signer - Solana signer (wallet-adapter or @solana/kit style)
 * @returns Base58-encoded signature string
 */
async function signSolanaMessage(message: string, signer: TokenGateSolanaSigner): Promise<string> {
  const msgBytes = new TextEncoder().encode(message);
  let sigBytes: Uint8Array;

  if (isKitSigner(signer)) {
    // @solana/kit KeyPairSigner style
    const address = getSolanaAddress(signer);
    const results = await signer.signMessages([{ content: msgBytes, signatures: {} }]);
    sigBytes = results[0][address];
  } else {
    // WalletAdapter style
    sigBytes = await signer.signMessage(msgBytes);
  }

  return base58.encode(sigBytes);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a signed token-gate proof.
 *
 * Accepts both EVM signers (viem PrivateKeyAccount / WalletClient) and Solana
 * signers (wallet-adapter or @solana/kit KeyPairSigner).
 *
 * @param signer - Signer to create the proof with
 * @param domain - Server domain to bind the proof to
 * @returns Signed TokenGateProof ready to encode into the request header
 *
 * @example EVM
 * ```typescript
 * import { privateKeyToAccount } from 'viem/accounts';
 * const account = privateKeyToAccount(privateKey);
 * const proof = await createTokenGateProof(account, 'api.example.com');
 * ```
 *
 * @example Solana (nacl keypair)
 * ```typescript
 * import nacl from 'tweetnacl';
 * import { base58 } from '@scure/base';
 * const kp = nacl.sign.keyPair();
 * const signer = {
 *   address: base58.encode(kp.publicKey),
 *   signMessages: async ([{ content }]) => [{ [base58.encode(kp.publicKey)]: nacl.sign.detached(content, kp.secretKey) }],
 * };
 * const proof = await createTokenGateProof(signer, 'api.example.com');
 * ```
 */
export async function createTokenGateProof(
  signer: TokenGateSigner,
  domain: string,
): Promise<TokenGateProof> {
  const issuedAt = new Date().toISOString();
  const message = buildProofMessage(domain, issuedAt);

  if (isSolanaSigner(signer)) {
    const address = getSolanaAddress(signer);
    const signature = await signSolanaMessage(message, signer);
    return { address, domain, issuedAt, signature, signatureType: "ed25519" };
  }

  // EVM path
  const evmSigner = signer as TokenGateEvmSigner;
  const signature = await evmSigner.signMessage({ message });
  return {
    address: evmSigner.address,
    domain,
    issuedAt,
    signature,
    signatureType: "eip191",
  };
}
