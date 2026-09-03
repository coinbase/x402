import type {
  PaymentPayloadContext,
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { ClientEvmSigner } from "@x402/evm";
import { AuthCaptureEvmScheme } from "@x402/evm/auth-capture/client";
import { assertBaseNetwork, findBaseDefaultAsset } from "../../networks";

/** Signer required by {@link BaseScheme} (client). Identical to `@x402/evm`'s `ClientEvmSigner`. */
export type BaseClientSigner = ClientEvmSigner;

/**
 * Base client implementation for the AuthCapture payment scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link AuthCaptureEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no client-side
 * differences from generic EVM today - this class exists as an explicit,
 * overridable seam so Base-specific behavior can be introduced later without
 * changing the public `@x402/base` API surface.
 *
 * `createPaymentPayload` rejects any network outside `eip155:8453` /
 * `eip155:84532` - see {@link assertBaseNetwork}. `findDefaultAsset` is
 * scoped the same way via {@link findBaseDefaultAsset}.
 *
 * Note: `@x402/evm` currently ships the auth-capture **client only** - there
 * is no server or facilitator implementation to wrap yet, so `@x402/base`
 * mirrors that scope.
 */
export class BaseScheme implements SchemeNetworkClient {
  readonly scheme = "auth-capture";
  findDefaultAsset = findBaseDefaultAsset;
  private readonly authCaptureEvmScheme: AuthCaptureEvmScheme;

  /**
   * Creates a new BaseScheme client instance.
   *
   * @param signer - The Base (EVM) signer for client operations. Only requires
   *   `address` + `signTypedData`.
   */
  constructor(signer: BaseClientSigner) {
    this.authCaptureEvmScheme = new AuthCaptureEvmScheme(signer);
  }

  /**
   * Creates a payment payload for the AuthCapture scheme. Delegates to the
   * underlying {@link AuthCaptureEvmScheme} after asserting the
   * requirements' network is in Base's scope.
   *
   * @param x402Version - The x402 protocol version (only `2` is supported)
   * @param paymentRequirements - The payment requirements
   * @param context - Optional context with server-declared extensions (unused)
   * @returns Promise resolving to a signed payment payload result
   * @throws When `paymentRequirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    assertBaseNetwork(paymentRequirements.network, "BaseScheme.createPaymentPayload");
    return this.authCaptureEvmScheme.createPaymentPayload(
      x402Version,
      paymentRequirements,
      context,
    );
  }
}
