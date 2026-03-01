/**
 * Complete client flow for SIWX extension
 *
 * Combines message construction, signing, and payload creation.
 * Supports both EVM and Solana wallets.
 */

import type {
  SIWxExtension,
  SIWxExtensionInfo,
  SIWxPayload,
  SignatureType,
  SignatureScheme,
} from "./types";
import type { SIWxSigner, EVMSigner, SolanaSigner } from "./sign";
import { getEVMAddress, getSolanaAddress, signEVMMessage, signSolanaMessage } from "./sign";
import { createSIWxMessage } from "./message";
import { encodeSIWxHeader } from "./encode";

/**
 * Complete SIWX info with chain-specific fields.
 * Used by utility functions that need the selected chain information.
 */
export type CompleteSIWxInfo = SIWxExtensionInfo & {
  chainId: string;
  type: SignatureType;
  signatureScheme?: SignatureScheme;
};

/**
 * Create a complete SIWX payload from server extension info with selected chain.
 *
 * Routes to EVM or Solana signing based on the chainId prefix:
 * - `eip155:*` → EVM signing
 * - `solana:*` → Solana signing
 *
 * @param serverExtension - Server extension info with chain selected (includes chainId, type)
 * @param signer - Wallet that can sign messages (EVMSigner or SolanaSigner)
 * @returns Complete SIWX payload with signature
 *
 * @example
 * ```typescript
 * // EVM wallet
 * const completeInfo = { ...extension.info, chainId: "eip155:8453", type: "eip191" };
 * const payload = await createSIWxPayload(completeInfo, evmWallet);
 * ```
 */
export async function createSIWxPayload(
  serverExtension: CompleteSIWxInfo,
  signer: SIWxSigner,
): Promise<SIWxPayload> {
  const isSolana = serverExtension.chainId.startsWith("solana:");

  // Get address and sign based on chain type
  const address = isSolana
    ? getSolanaAddress(signer as SolanaSigner)
    : getEVMAddress(signer as EVMSigner);

  const message = createSIWxMessage(serverExtension, address);

  const signature = isSolana
    ? await signSolanaMessage(message, signer as SolanaSigner)
    : await signEVMMessage(message, signer as EVMSigner);

  return {
    domain: serverExtension.domain,
    address,
    statement: serverExtension.statement,
    uri: serverExtension.uri,
    version: serverExtension.version,
    chainId: serverExtension.chainId,
    type: serverExtension.type,
    nonce: serverExtension.nonce,
    issuedAt: serverExtension.issuedAt,
    expirationTime: serverExtension.expirationTime,
    notBefore: serverExtension.notBefore,
    requestId: serverExtension.requestId,
    resources: serverExtension.resources,
    signatureScheme: serverExtension.signatureScheme,
    signature,
  };
}

/**
 * Sign a SIWX challenge from a 402 response extension.
 *
 * Convenience wrapper: selects the first supported chain, creates the
 * payload, signs it, and returns the base64-encoded header string ready
 * for the `sign-in-with-x` HTTP header.
 *
 * @param extension - The `sign-in-with-x` extension object from a 402 response
 * @param signer - Wallet that can sign messages (EVMSigner or SolanaSigner)
 * @param chainIndex - Index into supportedChains to select (default: 0)
 * @returns Base64-encoded header string
 *
 * @example
 * ```typescript
 * const res = await fetch(url);
 * const { extensions } = await res.json();
 * const header = await signSIWxChallenge(extensions["sign-in-with-x"], wallet);
 * await fetch(url, { headers: { "sign-in-with-x": header } });
 * ```
 */
export async function signSIWxChallenge(
  extension: SIWxExtension,
  signer: SIWxSigner,
  chainIndex = 0,
): Promise<string> {
  const chain = extension.supportedChains[chainIndex];
  const completeInfo: CompleteSIWxInfo = {
    ...extension.info,
    chainId: chain.chainId,
    type: chain.type,
  };
  const payload = await createSIWxPayload(completeInfo, signer);
  return encodeSIWxHeader(payload);
}
