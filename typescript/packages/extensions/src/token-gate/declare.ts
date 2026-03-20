/**
 * Server-side declaration helper for token-gate extension
 *
 * Used in per-route extension declarations to advertise token-gating
 * in 402 PaymentRequired responses.
 */

import type {
  TokenGateDeclaration,
  TokenGateExtensionInfo,
  DeclareTokenGateOptions,
} from "./types";
import { TOKEN_GATE } from "./types";
import { buildTokenGateSchema } from "./schema";

/**
 * Create a token-gate extension declaration for PaymentRequired.extensions.
 *
 * Place the result in a route's `extensions` field. When the route returns
 * a 402, the server extension will enrich the response with token contract
 * info so reactive clients can discover the requirement automatically.
 *
 * @param options - Declaration options including contracts to advertise
 * @returns Extension object ready for route config `extensions`
 *
 * @example
 * ```typescript
 * import { declareTokenGateExtension } from '@x402/extensions/token-gate';
 * import { base } from 'viem/chains';
 *
 * const routes = {
 *   '/api/data': {
 *     accepts: [{ scheme: 'exact', price: '$0.005', network: 'eip155:8453', payTo: ADDRESS }],
 *     extensions: {
 *       ...declareTokenGateExtension({
 *         contracts: [{ address: '0xNFT...', chain: base, type: 'ERC-721' }],
 *         message: 'NFT holders get free access',
 *       }),
 *     },
 *   },
 * };
 * ```
 */
export function declareTokenGateExtension(
  options: DeclareTokenGateOptions,
): Record<string, TokenGateDeclaration> {
  const info: TokenGateExtensionInfo = {
    contracts: options.contracts.map(c => ({
      address: c.address,
      chainId: c.chain.id,
      type: c.type,
    })),
    domain: options.domain ?? "",
    ...(options.message && { message: options.message }),
  };

  const declaration: TokenGateDeclaration = {
    info,
    schema: buildTokenGateSchema(),
    _options: options,
  };

  return { [TOKEN_GATE]: declaration };
}
