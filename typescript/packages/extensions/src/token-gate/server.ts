/**
 * Server-side ResourceServerExtension for token-gate
 *
 * Enriches 402 PaymentRequired responses with token contract info
 * so reactive clients can discover the token-gate requirement automatically.
 */

import type { ResourceServerExtension, PaymentRequiredContext } from "@x402/core/types";
import type {
  TokenGateExtension,
  TokenGateDeclaration,
  DeclareTokenGateOptions,
  TokenGateContractInfo,
} from "./types";
import { TOKEN_GATE } from "./types";
import { buildTokenGateSchema } from "./schema";

/**
 * Creates a token-gate ResourceServerExtension.
 *
 * Register this on your resource server to advertise token-gating
 * in 402 responses for routes that use `declareTokenGateExtension`.
 *
 * @returns ResourceServerExtension for token-gate
 *
 * @example
 * ```typescript
 * import { createTokenGateExtension } from '@x402/extensions/token-gate';
 *
 * const resourceServer = new x402ResourceServer(facilitator)
 *   .registerExtension(createTokenGateExtension());
 * ```
 */
export function createTokenGateExtension(): ResourceServerExtension {
  return {
    key: TOKEN_GATE,

    enrichPaymentRequiredResponse: async (
      declaration: unknown,
      context: PaymentRequiredContext,
    ): Promise<TokenGateExtension> => {
      const decl = declaration as TokenGateDeclaration;
      const opts: DeclareTokenGateOptions = decl._options;

      // Derive domain from request URL if not explicitly provided
      let domain = opts.domain;
      if (!domain) {
        try {
          domain = new URL(context.resourceInfo.url).hostname;
        } catch {
          domain = "";
        }
      }

      const contracts: TokenGateContractInfo[] = opts.contracts.map(c => {
        if (c.vm === "evm") {
          return { vm: "evm", address: c.address, chainId: c.chain.id, type: c.type };
        } else {
          return { vm: "svm", mint: c.mint, network: c.network };
        }
      });

      return {
        info: {
          contracts,
          domain,
          ...(opts.message && { message: opts.message }),
        },
        schema: buildTokenGateSchema(),
      };
    },
  };
}
