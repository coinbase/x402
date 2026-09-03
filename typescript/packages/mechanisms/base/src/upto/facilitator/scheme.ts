import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { FacilitatorEvmSigner } from "@x402/evm";
import { UptoEvmScheme, type UptoEvmSchemeConfig } from "@x402/evm/upto/facilitator";
import { assertBaseNetwork, isBaseNetwork } from "../../networks";

/** Signer required by {@link BaseScheme} (facilitator). Identical to `@x402/evm`'s `FacilitatorEvmSigner`. */
export type BaseFacilitatorSigner = FacilitatorEvmSigner;

/** Optional constructor config for {@link BaseScheme} (facilitator). Identical to `@x402/evm`'s `UptoEvmSchemeConfig`. */
export type BaseUptoSchemeConfig = UptoEvmSchemeConfig;

/**
 * Base facilitator implementation for the Upto payment scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link UptoEvmScheme}
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
  readonly scheme = "upto";
  readonly caipFamily = "eip155:*";
  private readonly uptoEvmScheme: UptoEvmScheme;

  /**
   * Creates a new BaseScheme facilitator instance.
   *
   * @param signer - The Base (EVM) signer for facilitator operations
   * @param config - Optional configuration
   */
  constructor(signer: BaseFacilitatorSigner, config?: BaseUptoSchemeConfig) {
    this.uptoEvmScheme = new UptoEvmScheme(signer, config);
  }

  /**
   * Returns mechanism-specific extra data for the given network, or
   * `undefined` off-Base. Otherwise passes through to the underlying
   * {@link UptoEvmScheme}.
   *
   * @param network - The network identifier
   * @returns Object with facilitatorAddress, or undefined if off-Base or no signer addresses are available
   */
  getExtra(network: string): Record<string, unknown> | undefined {
    if (!isBaseNetwork(network)) return undefined;
    return this.uptoEvmScheme.getExtra(network);
  }

  /**
   * Returns facilitator wallet addresses for the supported response, or
   * `[]` off-Base. Otherwise passes through to the underlying
   * {@link UptoEvmScheme}.
   *
   * @param network - The network identifier
   * @returns Array of facilitator wallet addresses
   */
  getSigners(network: string): string[] {
    if (!isBaseNetwork(network)) return [];
    return this.uptoEvmScheme.getSigners(network);
  }

  /**
   * Verifies a payment payload. Delegates to the underlying
   * {@link UptoEvmScheme} after asserting `requirements.network` is in
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
    return this.uptoEvmScheme.verify(payload, requirements, context, extra);
  }

  /**
   * Settles a payment. Delegates to the underlying {@link UptoEvmScheme}
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
    return this.uptoEvmScheme.settle(payload, requirements, context);
  }
}
