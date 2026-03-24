/**
 * Client-side proof creation for token-gate extension
 *
 * Builds a signed TokenGateProof from the server's 402 extension info.
 */

import type { TokenGateExtension, TokenGateProof } from "./types";
import type { TokenGateSigner } from "./sign";
import { createTokenGateProof } from "./sign";

/**
 * Create a signed token-gate proof from a server's 402 extension info.
 *
 * @param extensionInfo - The token-gate extension info from the 402 response
 * @param signer - EVM wallet signer
 * @returns Signed TokenGateProof
 */
export async function createTokenGatePayload(
  extensionInfo: TokenGateExtension["info"],
  signer: TokenGateSigner,
): Promise<TokenGateProof> {
  return createTokenGateProof(signer, extensionInfo.domain);
}
