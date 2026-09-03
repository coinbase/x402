import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { FacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme, type ExactEvmSchemeConfig } from "@x402/evm/exact/facilitator";
import { assertBaseNetwork, isBaseNetwork } from "../../networks";

/** Signer required by {@link BaseScheme} (facilitator). Identical to `@x402/evm`'s `FacilitatorEvmSigner`. */
export type BaseFacilitatorSigner = FacilitatorEvmSigner;

/** Optional constructor config for {@link BaseScheme} (facilitator). Identical to `@x402/evm`'s `ExactEvmSchemeConfig`. */
export type BaseSchemeConfig = ExactEvmSchemeConfig;

/**
 * Base facilitator implementation for the Exact payment scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link ExactEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no
 * facilitator-side differences from generic EVM today - this class exists
 * as an explicit, overridable seam so Base-specific verify/settle behavior
 * (e.g. a Base-specific gas-sponsoring strategy) can be introduced later
 * without changing the public `@x402/base` API surface.
 *
 * `verify` and `settle` reject any network outside `eip155:8453` /
 * `eip155:84532` - see {@link assertBaseNetwork}. `getExtra` and
 * `getSigners` fail closed (return `undefined` / `[]`) off-Base instead.
 */
export class BaseScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "eip155:*";
  private readonly exactEvmScheme: ExactEvmScheme;

  /**
   * Creates a new BaseScheme facilitator instance.
   *
   * @param signer - The Base (EVM) signer for facilitator operations
   * @param config - Optional configuration
   */
  constructor(signer: BaseFacilitatorSigner, config?: BaseSchemeConfig) {
    this.exactEvmScheme = new ExactEvmScheme(signer, config);
  }

  /**
   * Returns mechanism-specific extra data for the given network, or
   * `undefined` off-Base. Otherwise passes through to the underlying
   * {@link ExactEvmScheme}.
   *
   * @param network - The network identifier
   * @returns undefined - EVM (and Base) have no mechanism-specific extra data
   */
  getExtra(network: string): Record<string, unknown> | undefined {
    if (!isBaseNetwork(network)) return undefined;
    return this.exactEvmScheme.getExtra(network);
  }

  /**
   * Returns facilitator wallet addresses for the supported response, or
   * `[]` off-Base. Otherwise passes through to the underlying
   * {@link ExactEvmScheme}.
   *
   * @param network - The network identifier
   * @returns Array of facilitator wallet addresses
   */
  getSigners(network: string): string[] {
    if (!isBaseNetwork(network)) return [];
    return this.exactEvmScheme.getSigners(network);
  }

  /**
   * Verifies a payment payload. Delegates to the underlying
   * {@link ExactEvmScheme} after asserting `requirements.network` is in
   * Base's scope.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @param context - Optional facilitator context for extension capabilities
   * @param extra - Payment required extensions (unused; reserved for interface parity)
   * @returns Promise resolving to verification response
   * @throws When `requirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
    extra?: Record<string, unknown>,
  ): Promise<VerifyResponse> {
    assertBaseNetwork(requirements.network, "BaseScheme.verify");
    return this.exactEvmScheme.verify(payload, requirements, context, extra);
  }

  /**
   * Settles a payment. Delegates to the underlying {@link ExactEvmScheme}
   * after asserting `requirements.network` is in Base's scope.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @param context - Optional facilitator context for extension capabilities
   * @returns Promise resolving to settlement response
   * @throws When `requirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    assertBaseNetwork(requirements.network, "BaseScheme.settle");
    return this.exactEvmScheme.settle(payload, requirements, context);
  }
}
