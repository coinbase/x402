/**
 * Client-side proof signing for token-gate extension
 *
 * Creates EIP-191 personal_sign proofs that prove wallet ownership
 * without requiring any on-chain transaction.
 */

import type { TokenGateProof } from "./types";

/**
 * Minimal EVM signer interface — compatible with viem WalletClient and PrivateKeyAccount.
 */
export interface TokenGateSigner {
  /** Wallet address */
  address: `0x${string}`;
  /** Sign a plain message with EIP-191 personal_sign */
  signMessage: (args: { message: string }) => Promise<`0x${string}`>;
}

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

/**
 * Create a signed token-gate proof.
 *
 * @param signer - EVM signer (viem PrivateKeyAccount or WalletClient)
 * @param domain - Server domain to bind the proof to
 * @returns Signed TokenGateProof ready to encode into the request header
 *
 * @example
 * ```typescript
 * import { privateKeyToAccount } from 'viem/accounts';
 * import { createTokenGateProof } from '@x402/extensions/token-gate';
 *
 * const account = privateKeyToAccount(privateKey);
 * const proof = await createTokenGateProof(account, 'api.example.com');
 * ```
 */
export async function createTokenGateProof(
  signer: TokenGateSigner,
  domain: string,
): Promise<TokenGateProof> {
  const issuedAt = new Date().toISOString();
  const message = buildProofMessage(domain, issuedAt);
  const signature = await signer.signMessage({ message });
  return {
    address: signer.address,
    domain,
    issuedAt,
    signature,
  };
}
