import type {
  PaymentPayloadContext,
  PaymentPayloadResult,
  PaymentRequired,
  PaymentRequirements,
  SchemeClientHooks,
  SchemeNetworkClient,
  SettleResponse,
} from "@x402/core/types";
import { BatchSettlementEvmScheme, ChannelConfig, ClientEvmSigner } from "@x402/evm";
import type {
  BatchSettlementDepositPolicy,
  BatchSettlementEvmSchemeOptions,
  RefundOptions,
} from "@x402/evm/batch-settlement/client";
import { assertBaseNetwork, findBaseDefaultAsset } from "../../networks";

/** Signer required by {@link BaseScheme} (client). Identical to `@x402/evm`'s `ClientEvmSigner`. */
export type BaseClientSigner = ClientEvmSigner;

/** Immutable channel identity. Identical to `@x402/evm`'s `ChannelConfig`. */
export type BaseChannelConfig = ChannelConfig;

/** Deposit-sizing policy accepted by {@link BaseScheme} (client). Identical to `@x402/evm`'s `BatchSettlementDepositPolicy`. */
export type BaseBatchSettlementDepositPolicy = BatchSettlementDepositPolicy;

/** Full constructor options for {@link BaseScheme} (client). Identical to `@x402/evm`'s `BatchSettlementEvmSchemeOptions`. */
export type BaseBatchSettlementSchemeOptions = BatchSettlementEvmSchemeOptions;

/** Options accepted by {@link BaseScheme.refund}. Identical to `@x402/evm`'s `RefundOptions`. */
export type BaseRefundOptions = RefundOptions;

/**
 * Base client implementation for the batch-settlement (payment channel) scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link BatchSettlementEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no client-side
 * differences from generic EVM today - this class exists as an explicit,
 * overridable seam so Base-specific behavior can be introduced later without
 * changing the public `@x402/base` API surface.
 *
 * `createPaymentPayload` and `buildChannelConfig` reject any network outside
 * `eip155:8453` / `eip155:84532` - see {@link assertBaseNetwork}.
 * `findDefaultAsset` is scoped the same way via {@link findBaseDefaultAsset}.
 * `refund` and `processCorrectivePaymentRequired` are left unguarded: the
 * network they act on lives inside an already-established channel (or a
 * `PaymentRequired.accepts[]` whose follow-up `createPaymentPayload` call is
 * itself guarded), not a fresh caller-supplied value.
 */
export class BaseScheme implements SchemeNetworkClient {
  readonly scheme = "batch-settlement";
  findDefaultAsset = findBaseDefaultAsset;
  readonly schemeHooks: SchemeClientHooks;
  private readonly batchSettlementEvmScheme: BatchSettlementEvmScheme;

  /**
   * Creates a new BaseScheme client instance.
   *
   * @param signer - Base (EVM) wallet used for signing vouchers and deposit authorizations.
   * @param optionsOrPolicy - Either a full options object or a bare deposit-policy.
   */
  constructor(
    signer: BaseClientSigner,
    optionsOrPolicy?: BaseBatchSettlementSchemeOptions | BaseBatchSettlementDepositPolicy,
  ) {
    this.batchSettlementEvmScheme = new BatchSettlementEvmScheme(signer, optionsOrPolicy);
    this.schemeHooks = this.batchSettlementEvmScheme.schemeHooks;
  }

  /**
   * Creates the payment payload for a batched request. Delegates to the
   * underlying {@link BatchSettlementEvmScheme} after asserting the
   * requirements' network is in Base's scope.
   *
   * @param x402Version - Protocol version for the payload envelope.
   * @param paymentRequirements - Server payment requirements (scheme, network, asset, amount).
   * @param context - Optional payment payload context with extension hints.
   * @returns A {@link PaymentPayloadResult} ready to be sent as the `X-PAYMENT` header.
   * @throws When `paymentRequirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    assertBaseNetwork(paymentRequirements.network, "BaseScheme.createPaymentPayload");
    return this.batchSettlementEvmScheme.createPaymentPayload(
      x402Version,
      paymentRequirements,
      context,
    );
  }

  /**
   * Sends a cooperative refund request. Passes through entirely to the
   * underlying {@link BatchSettlementEvmScheme}.
   *
   * @param url - The route URL backing the channel to refund.
   * @param options - Optional `amount` (partial refund) and `fetch` override.
   * @returns The settle response describing the refund outcome.
   */
  async refund(url: string, options?: BaseRefundOptions): Promise<SettleResponse> {
    return this.batchSettlementEvmScheme.refund(url, options);
  }

  /**
   * Resyncs local channel state from a corrective 402 response. Passes
   * through entirely to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param paymentRequired - The decoded 402 response body.
   * @returns `true` if local state was successfully resynced and a retry is warranted.
   */
  async processCorrectivePaymentRequired(paymentRequired: PaymentRequired): Promise<boolean> {
    return this.batchSettlementEvmScheme.processCorrectivePaymentRequired(paymentRequired);
  }

  /**
   * Builds the immutable {@link BaseChannelConfig} for a given set of payment
   * requirements. Delegates to the underlying {@link BatchSettlementEvmScheme}
   * after asserting the requirements' network is in Base's scope.
   *
   * @param paymentRequirements - Server payment requirements for the channel.
   * @returns The channel config that uniquely identifies the payment channel.
   * @throws When `paymentRequirements.network` is not `eip155:8453` / `eip155:84532`
   */
  buildChannelConfig(paymentRequirements: PaymentRequirements): BaseChannelConfig {
    assertBaseNetwork(paymentRequirements.network, "BaseScheme.buildChannelConfig");
    return this.batchSettlementEvmScheme.buildChannelConfig(paymentRequirements);
  }
}
