import {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import { ClientEvmSigner } from "@x402/evm";
import { UptoEvmScheme, type UptoEvmSchemeOptions } from "@x402/evm/upto/client";
import { assertBaseNetwork, findBaseDefaultAsset } from "../../networks";

/** Signer required by {@link BaseScheme} (client). Identical to `@x402/evm`'s `ClientEvmSigner`. */
export type BaseClientSigner = ClientEvmSigner;

/** Optional constructor options for {@link BaseScheme} (client). Identical to `@x402/evm`'s `UptoEvmSchemeOptions`. */
export type BaseUptoSchemeOptions = UptoEvmSchemeOptions;

/**
 * Base client implementation for the Upto payment scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link UptoEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no client-side
 * differences from generic EVM today - this class exists as an explicit,
 * overridable seam so Base-specific behavior (e.g. a different default
 * asset transfer method, extension, or signer requirement) can be
 * introduced later without changing the public `@x402/base` API surface or
 * requiring consumers to re-register a different scheme.
 *
 * `createPaymentPayload` rejects any network outside `eip155:8453` /
 * `eip155:84532` - see {@link assertBaseNetwork}. `findDefaultAsset` is
 * scoped the same way via {@link findBaseDefaultAsset}.
 */
export class BaseScheme implements SchemeNetworkClient {
  readonly scheme = "upto";
  findDefaultAsset = findBaseDefaultAsset;
  private readonly uptoEvmScheme: UptoEvmScheme;

  /**
   * Creates a new BaseScheme client instance.
   *
   * @param signer - The Base (EVM) signer for client operations.
   *   Upto flow only requires `address` + `signTypedData`.
   *   Extension enrichment (EIP-2612 / ERC-20 approval sponsoring) additionally
   *   requires optional capabilities like `readContract` and tx signing helpers.
   * @param options - Optional RPC configuration used to backfill extension capabilities.
   */
  constructor(signer: BaseClientSigner, options?: BaseUptoSchemeOptions) {
    this.uptoEvmScheme = new UptoEvmScheme(signer, options);
  }

  /**
   * Creates a payment payload for the Upto scheme. Delegates to the
   * underlying {@link UptoEvmScheme} after asserting the requirements'
   * network is in Base's scope.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @param context - Optional context with server-declared extensions
   * @returns Promise resolving to a payment payload result (with optional extensions)
   * @throws When `paymentRequirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    assertBaseNetwork(paymentRequirements.network, "BaseScheme.createPaymentPayload");
    return this.uptoEvmScheme.createPaymentPayload(x402Version, paymentRequirements, context);
  }
}
