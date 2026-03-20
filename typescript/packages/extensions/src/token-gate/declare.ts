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
  TokenGateContractInfo,
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
 * @example EVM
 * ```typescript
 * import { declareTokenGateExtension } from '@x402/extensions/token-gate';
 * import { base } from 'viem/chains';
 *
 * const routes = {
 *   '/api/data': {
 *     accepts: [{ scheme: 'exact', price: '$0.005', network: 'eip155:8453', payTo: ADDRESS }],
 *     extensions: {
 *       ...declareTokenGateExtension({
 *         contracts: [{ vm: 'evm', address: '0xNFT...', chain: base, type: 'ERC-721' }],
 *         message: 'NFT holders get free access',
 *       }),
 *     },
 *   },
 * };
 * ```
 *
 * @example Solana
 * ```typescript
 * extensions: {
 *   ...declareTokenGateExtension({
 *     contracts: [{ vm: 'svm', mint: 'So11111...', network: 'solana:mainnet-beta' }],
 *     message: 'SPL token holders get free access',
 *   }),
 * }
 * ```
 */
export function declareTokenGateExtension(
  options: DeclareTokenGateOptions,
): Record<string, TokenGateDeclaration> {
  const contracts: TokenGateContractInfo[] = options.contracts.map(c => {
    if (c.vm === "evm") {
      return { vm: "evm", address: c.address, chainId: c.chain.id, type: c.type };
    } else {
      return { vm: "svm", mint: c.mint, network: c.network };
    }
  });

  const info: TokenGateExtensionInfo = {
    contracts,
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
