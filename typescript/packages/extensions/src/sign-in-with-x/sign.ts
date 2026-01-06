/**
 * Message signing for SIWX extension
 *
 * Client-side helper for signing SIWX messages.
 */

/**
 * Generic signer interface for SIWX message signing.
 * Compatible with viem WalletClient and PrivateKeyAccount.
 */
export interface SIWxSigner {
  /** Sign a message and return the signature */
  signMessage: (args: { message: string; account?: unknown }) => Promise<string>;
  /** Account object (for WalletClient) */
  account?: { address: string };
  /** Direct address (for PrivateKeyAccount) */
  address?: string;
}

/**
 * Sign SIWX message with wallet.
 *
 * Compatible with:
 * - viem WalletClient (browser wallets)
 * - viem PrivateKeyAccount (server-side)
 *
 * @param message - CAIP-122 message string to sign
 * @param signer - Wallet or account that can sign messages
 * @returns Signature string
 *
 * @example
 * ```typescript
 * // With WalletClient (browser)
 * const signature = await signSIWxMessage(message, walletClient);
 *
 * // With PrivateKeyAccount (server)
 * const account = privateKeyToAccount('0x...');
 * const signature = await signSIWxMessage(message, account);
 * ```
 */
export async function signSIWxMessage(
  message: string,
  signer: SIWxSigner,
): Promise<string> {
  // Check if signer has an account property (WalletClient pattern)
  if (signer.account) {
    return signer.signMessage({
      message,
      account: signer.account,
    });
  }

  // Direct signMessage (PrivateKeyAccount pattern)
  return signer.signMessage({ message });
}
