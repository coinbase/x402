/**
 * Lifecycle hooks for token-gate extension
 *
 * Server-side request hook and client-side onPaymentRequired hook.
 */

import type { TokenGateConfig, TokenGateExtension, TokenGateSigner } from "./types";
import { TOKEN_GATE, DEFAULT_PROOF_MAX_AGE, DEFAULT_OWNERSHIP_CACHE_TTL } from "./types";
import { createTokenGateProof } from "./sign";
import { parseTokenGateHeader } from "./parse";
import { verifyTokenGateProof } from "./verify";
import { checkOwnership as defaultCheckOwnership } from "./ownership";
import { encodeTokenGateHeader } from "./encode";

/**
 * Events emitted by the token-gate request hook.
 */
export type TokenGateHookEvent =
  | { type: "access_granted"; resource: string; address: string }
  | { type: "not_holder"; resource: string; address: string }
  | { type: "proof_invalid"; resource: string; error?: string };

/**
 * Options for the server-side request hook.
 */
export interface CreateTokenGateRequestHookOptions extends TokenGateConfig {
  /** Optional event callback for logging/debugging */
  onEvent?: (event: TokenGateHookEvent) => void;
  /** @internal Override checkOwnership for testing */
  _checkOwnership?: (
    address: string,
    contracts: TokenGateConfig["contracts"],
    matchMode?: "any" | "all",
    cacheTtlSeconds?: number,
  ) => Promise<boolean>;
}

/**
 * Creates an onProtectedRequest hook that grants free access to token holders.
 *
 * Register this globally on your HTTP resource server. No per-route configuration
 * needed — the hook only fires when a valid `token-gate` header is present.
 *
 * @param options - Token contracts and access configuration
 * @returns Hook function for x402HTTPResourceServer.onProtectedRequest()
 *
 * @example
 * ```typescript
 * import { createTokenGateRequestHook } from '@x402/extensions/token-gate';
 * import { base } from 'viem/chains';
 *
 * const httpServer = new x402HTTPResourceServer(resourceServer, routes)
 *   .onProtectedRequest(createTokenGateRequestHook({
 *     contracts: [{ vm: 'evm', address: '0xNFT...', chain: base, type: 'ERC-721' }],
 *     access: 'free',
 *   }));
 * ```
 */
export function createTokenGateRequestHook(options: CreateTokenGateRequestHookOptions) {
  const {
    contracts,
    matchMode = "any",
    access,
    proofMaxAge = DEFAULT_PROOF_MAX_AGE,
    ownershipCacheTtl = DEFAULT_OWNERSHIP_CACHE_TTL,
    onEvent,
    _checkOwnership: checkOwnership = defaultCheckOwnership,
  } = options;

  // Discount mode: hook only grants free access
  const grantsAccess = access === "free";

  return async (context: {
    adapter: { getHeader(name: string): string | undefined; getUrl(): string };
    path: string;
  }): Promise<void | { grantAccess: true }> => {
    // Try both casing variants (HTTP headers are case-insensitive)
    const header =
      context.adapter.getHeader(TOKEN_GATE) ||
      context.adapter.getHeader(TOKEN_GATE.toLowerCase());

    if (!header) return;

    try {
      const proof = parseTokenGateHeader(header);
      const resourceUrl = context.adapter.getUrl();
      let domain: string;
      try {
        domain = new URL(resourceUrl).hostname;
      } catch {
        domain = "";
      }

      const verification = await verifyTokenGateProof(proof, domain, proofMaxAge);
      if (!verification.valid || !verification.address) {
        onEvent?.({ type: "proof_invalid", resource: context.path, error: verification.error });
        return;
      }

      const isHolder = await checkOwnership(
        verification.address,
        contracts,
        matchMode,
        ownershipCacheTtl,
      );

      if (!isHolder) {
        onEvent?.({ type: "not_holder", resource: context.path, address: verification.address });
        return;
      }

      onEvent?.({ type: "access_granted", resource: context.path, address: verification.address });

      if (grantsAccess) {
        return { grantAccess: true };
      }
      // Discount mode: return void — payment proceeds, DynamicPrice handles the discount
    } catch (err) {
      onEvent?.({
        type: "proof_invalid",
        resource: context.path,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };
}

/**
 * Options for the client-side onPaymentRequired hook.
 */
export interface CreateTokenGateClientHookOptions {
  /** EVM or Solana wallet signer */
  account: TokenGateSigner;
  /**
   * Server domain to bind the proof to.
   * If omitted, derived from the `info.domain` in the 402 extension.
   */
  domain?: string;
}

/**
 * Creates an onPaymentRequired hook for reactive client-side token-gate authentication.
 *
 * When the server advertises a `token-gate` extension in its 402 response,
 * this hook creates a signed proof and returns it as a header for the retry.
 *
 * For EVM signers, only responds when the 402 lists EVM contracts.
 * For Solana signers, only responds when the 402 lists SVM contracts.
 *
 * @param options - Signer and optional domain override
 * @returns Hook function for x402HTTPClient.onPaymentRequired()
 *
 * @example
 * ```typescript
 * import { createTokenGateClientHook } from '@x402/extensions/token-gate';
 *
 * const httpClient = new x402HTTPClient(client)
 *   .onPaymentRequired(createTokenGateClientHook({ account: walletAccount }));
 * ```
 */
export function createTokenGateClientHook(options: CreateTokenGateClientHookOptions) {
  const { account, domain: domainOverride } = options;

  // Detect signer VM type — same logic as isSolanaSigner in sign.ts.
  // Viem accounts have publicKey as "0x..." hex; Solana publicKey is base58 or an object.
  const isSolana = (() => {
    if ("signMessages" in account) return true;
    if ("publicKey" in account) {
      const pk = (account as { publicKey: unknown }).publicKey;
      if (typeof pk === "object" && pk !== null) return true;
      if (typeof pk === "string" && !pk.startsWith("0x")) return true;
    }
    return false;
  })();

  return async (context: {
    paymentRequired: { extensions?: Record<string, unknown> };
  }): Promise<{ headers: Record<string, string> } | void> => {
    const extensions = context.paymentRequired.extensions ?? {};
    const extension = extensions[TOKEN_GATE] as TokenGateExtension | undefined;

    if (!extension?.info) return;

    // Filter contracts to matching VM type — skip if no compatible contracts
    const contracts = extension.info.contracts ?? [];
    const hasCompatible = isSolana
      ? contracts.some(c => c.vm === "svm")
      : contracts.some(c => c.vm === "evm");

    if (!hasCompatible) return;

    const domain = domainOverride ?? extension.info.domain;
    if (!domain) return;

    try {
      const proof = await createTokenGateProof(account, domain);
      const header = encodeTokenGateHeader(proof);
      return { headers: { [TOKEN_GATE]: header } };
    } catch {
      // Failed to create proof, continue to payment
    }
  };
}
