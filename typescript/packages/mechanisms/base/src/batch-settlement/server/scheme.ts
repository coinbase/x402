import type {
  AssetAmount,
  DeepReadonly,
  MoneyParser,
  Network,
  PaymentFlowConfig,
  PaymentPayload,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  SchemeServerHooks,
  SupportedKind,
} from "@x402/core/types";
import type { FacilitatorClient, SettleContext, SettleResultContext } from "@x402/core/server";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/server";
import type {
  AuthorizerSigner,
  BatchSettlementChannelManager,
  BatchSettlementEvmSchemeServerConfig,
  BatchSettlementRequestContext,
  Channel,
  ChannelStorage,
} from "@x402/evm/batch-settlement/server";
import { assertBaseNetwork, isBaseNetwork } from "../../networks";

/** EIP-712 signer for receiver-authorizer claims/refunds. Identical to `@x402/evm`'s `AuthorizerSigner`. */
export type BaseAuthorizerSigner = AuthorizerSigner;

/** Optional constructor config for {@link BaseScheme} (server). Identical to `@x402/evm`'s `BatchSettlementEvmSchemeServerConfig`. */
export type BaseBatchSettlementSchemeServerConfig = BatchSettlementEvmSchemeServerConfig;

/** Per-request scratch state tracked by {@link BaseScheme} (server). Identical to `@x402/evm`'s `BatchSettlementRequestContext`. */
export type BaseBatchSettlementRequestContext = BatchSettlementRequestContext;

/** Onchain/local channel state. Identical to `@x402/evm`'s `Channel`. */
export type BaseChannel = Channel;

/** Pluggable server-side channel storage backend. Identical to `@x402/evm`'s `ChannelStorage`. */
export type BaseChannelStorage = ChannelStorage;

/** Claim/settle/refund orchestrator. Identical to `@x402/evm`'s `BatchSettlementChannelManager`. */
export type BaseBatchSettlementChannelManager = BatchSettlementChannelManager;

/**
 * Base resource-server implementation for the batch-settlement (payment
 * channel) scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link BatchSettlementEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no
 * resource-server-side differences from generic EVM today - this class
 * exists as an explicit, overridable seam so Base-specific behavior can be
 * introduced later without changing the public `@x402/base` API surface.
 *
 * `parsePrice`, `enhancePaymentRequirements`, and `createChannelManager`
 * reject any network outside `eip155:8453` / `eip155:84532` - see
 * {@link assertBaseNetwork}. Registering this scheme under a network (or
 * wildcard pattern) outside Base's scope fails fast at
 * `x402ResourceServer.initialize()` via {@link BaseScheme.validateFacilitatorSupport}.
 */
export class BaseScheme implements SchemeNetworkServer {
  readonly scheme = "batch-settlement";
  readonly defaultAssetTransferMethod: string;
  readonly paymentFlows: Readonly<Record<string, PaymentFlowConfig>>;
  readonly schemeHooks: SchemeServerHooks;
  private readonly batchSettlementEvmScheme: BatchSettlementEvmScheme;

  /**
   * Creates a new BaseScheme server instance.
   *
   * @param receiverAddress - The server's receiver address (payTo).
   * @param config - Optional configuration for storage, receiver-authorizer signer, and withdraw delay.
   */
  constructor(receiverAddress: `0x${string}`, config?: BaseBatchSettlementSchemeServerConfig) {
    this.batchSettlementEvmScheme = new BatchSettlementEvmScheme(receiverAddress, config);
    this.defaultAssetTransferMethod = this.batchSettlementEvmScheme.defaultAssetTransferMethod;
    this.paymentFlows = this.batchSettlementEvmScheme.paymentFlows;
    this.schemeHooks = this.batchSettlementEvmScheme.schemeHooks;
  }

  /**
   * Adds server-owned settlement fields before facilitator settlement.
   * Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param ctx - Settlement context for the current payment.
   * @returns Additive payload fields, or nothing when no enrichment is needed.
   */
  enrichSettlementPayload = (ctx: SettleContext): Promise<Record<string, unknown> | void> =>
    this.batchSettlementEvmScheme.enrichSettlementPayload(ctx);

  /**
   * Adds corrective channel state to payment-required responses when
   * available. Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param ctx - Payment-required response context for the current request.
   * @returns Updated payment requirements, or nothing when no enrichment is needed.
   */
  enrichPaymentRequiredResponse = (
    ctx: Parameters<BatchSettlementEvmScheme["enrichPaymentRequiredResponse"]>[0],
  ): Promise<PaymentRequirements[] | void> =>
    this.batchSettlementEvmScheme.enrichPaymentRequiredResponse(ctx);

  /**
   * Adds server-owned extra fields after facilitator settlement. Passes
   * through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param ctx - Settlement result context for the current payment.
   * @returns Additive response extra fields, or nothing when no enrichment is needed.
   */
  enrichSettlementResponse = (ctx: SettleResultContext): Promise<Record<string, unknown> | void> =>
    this.batchSettlementEvmScheme.enrichSettlementResponse(ctx);

  /**
   * Merges batch-settlement state into the current request context. Passes
   * through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - Request-scoped payment payload object.
   * @param context - Partial context fields to merge.
   */
  mergeRequestContext(
    payload: DeepReadonly<PaymentPayload>,
    context: BaseBatchSettlementRequestContext,
  ): void {
    this.batchSettlementEvmScheme.mergeRequestContext(payload, context);
  }

  /**
   * Reads batch-settlement state for the current request without clearing
   * it. Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - Request-scoped payment payload object.
   * @returns Request context, if one was recorded.
   */
  readRequestContext(
    payload: DeepReadonly<PaymentPayload>,
  ): BaseBatchSettlementRequestContext | undefined {
    return this.batchSettlementEvmScheme.readRequestContext(payload);
  }

  /**
   * Reads and clears batch-settlement state for the current request. Passes
   * through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - Request-scoped payment payload object.
   * @returns Request context, if one was recorded.
   */
  takeRequestContext(
    payload: DeepReadonly<PaymentPayload>,
  ): BaseBatchSettlementRequestContext | undefined {
    return this.batchSettlementEvmScheme.takeRequestContext(payload);
  }

  /**
   * Stores a channel snapshot for the current settlement request. Passes
   * through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - Request-scoped payment payload object.
   * @param channel - Channel state to use during response enrichment.
   */
  rememberChannelSnapshot(payload: DeepReadonly<PaymentPayload>, channel: BaseChannel): void {
    this.batchSettlementEvmScheme.rememberChannelSnapshot(payload, channel);
  }

  /**
   * Reads and clears a channel snapshot for the current settlement request.
   * Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - Request-scoped payment payload object.
   * @returns Stored channel state, if one was recorded.
   */
  takeChannelSnapshot(payload: DeepReadonly<PaymentPayload>): BaseChannel | undefined {
    return this.batchSettlementEvmScheme.takeChannelSnapshot(payload);
  }

  /**
   * Clears this request's pending reservation without touching newer
   * reservations. Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - Request-scoped payment payload object.
   * @returns Resolves once the pending reservation is cleared.
   */
  async clearPendingRequest(payload: DeepReadonly<PaymentPayload>): Promise<void> {
    await this.batchSettlementEvmScheme.clearPendingRequest(payload);
  }

  /**
   * Registers a custom money parser for converting price strings to token
   * amounts. Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param parser - A parser function to try before the default USD→token conversion.
   * @returns `this` for chaining.
   */
  registerMoneyParser(parser: MoneyParser): BaseScheme {
    this.batchSettlementEvmScheme.registerMoneyParser(parser);
    return this;
  }

  /**
   * Resolves a human-readable price (e.g. `"$0.01"`) into an onchain token
   * amount. Delegates to the underlying {@link BatchSettlementEvmScheme}
   * after asserting `network` is in Base's scope.
   *
   * @param price - A price string, number, or explicit `AssetAmount`.
   * @param network - CAIP-2 network identifier for looking up the default asset.
   * @returns Token amount with asset address and metadata.
   * @throws When `network` is not `eip155:8453` / `eip155:84532`
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    assertBaseNetwork(network, "BaseScheme.parsePrice");
    return this.batchSettlementEvmScheme.parsePrice(price, network);
  }

  /**
   * Decimals for a known default asset, or undefined off-Base or when
   * unrecognized. Otherwise passes through to the underlying
   * {@link BatchSettlementEvmScheme}.
   *
   * @param asset - Asset address or symbol
   * @param network - Target network
   * @returns Decimals when the asset is a known Base default; otherwise undefined
   */
  getAssetDecimals(asset: string, network: Network): number | undefined {
    if (!isBaseNetwork(network)) return undefined;
    return this.batchSettlementEvmScheme.getAssetDecimals(asset, network);
  }

  /**
   * Injects batched-specific fields into the payment requirements returned
   * to the client. Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param paymentRequirements - Base payment requirements from the middleware.
   * @param supportedKind - Matched scheme/network kind (extra may contain overrides).
   * @param supportedKind.x402Version - The x402 version.
   * @param supportedKind.scheme - The logical payment scheme.
   * @param supportedKind.network - The network identifier in CAIP-2 format.
   * @param supportedKind.extra - Optional extra metadata regarding scheme/network implementation details.
   * @param extensionKeys - Extension keys (unused).
   * @returns Enhanced payment requirements with batched fields in `extra`.
   * @throws When `supportedKind.network` is not `eip155:8453` / `eip155:84532`
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    assertBaseNetwork(supportedKind.network, "BaseScheme.enhancePaymentRequirements");
    return this.batchSettlementEvmScheme.enhancePaymentRequirements(
      paymentRequirements,
      supportedKind,
      extensionKeys,
    );
  }

  /**
   * Fails server startup when this scheme is registered against a network
   * outside Base's scope, or when it delegates the receiver-authorizer role
   * but the facilitator does not advertise a usable `receiverAuthorizer`.
   * The Base-scope check runs first, then composes with the underlying
   * {@link BatchSettlementEvmScheme}'s own validation.
   *
   * @param network - The network identifier being validated.
   * @param supportedKind - The facilitator's advertised kind for this scheme/network.
   * @param extensionKeys - Extensions advertised by the facilitator (unused).
   * @returns A problem message when delegation is impossible, or void when valid.
   */
  validateFacilitatorSupport(
    network: Network,
    supportedKind: SupportedKind,
    extensionKeys: string[],
  ): string | void {
    if (!isBaseNetwork(network)) {
      return `@x402/base only supports eip155:8453 and eip155:84532, but was registered for ${network}`;
    }
    return this.batchSettlementEvmScheme.validateFacilitatorSupport(
      network,
      supportedKind,
      extensionKeys,
    );
  }

  /**
   * Returns the underlying channel storage instance. Passes through to the
   * underlying {@link BatchSettlementEvmScheme}.
   *
   * @returns The configured channel storage backend.
   */
  getStorage(): BaseChannelStorage {
    return this.batchSettlementEvmScheme.getStorage();
  }

  /**
   * Returns the server's receiver address. Passes through to the underlying
   * {@link BatchSettlementEvmScheme}.
   *
   * @returns Receiver wallet address for the payment channel.
   */
  getReceiverAddress(): `0x${string}` {
    return this.batchSettlementEvmScheme.getReceiverAddress();
  }

  /**
   * Returns the configured withdraw delay (seconds). Passes through to the
   * underlying {@link BatchSettlementEvmScheme}.
   *
   * @returns Withdraw delay in seconds before uncooperative withdrawal is allowed.
   */
  getWithdrawDelay(): number {
    return this.batchSettlementEvmScheme.getWithdrawDelay();
  }

  /**
   * Returns how long mirrored onchain channel state is trusted for local
   * voucher verification. Passes through to the underlying
   * {@link BatchSettlementEvmScheme}.
   *
   * @returns Freshness window in milliseconds.
   */
  getOnchainStateTtlMs(): number {
    return this.batchSettlementEvmScheme.getOnchainStateTtlMs();
  }

  /**
   * Returns the receiver-authorizer signer, if configured. Passes through to
   * the underlying {@link BatchSettlementEvmScheme}.
   *
   * @returns Receiver-authorizer signer, or `undefined` when not set.
   */
  getReceiverAuthorizerSigner(): BaseAuthorizerSigner | undefined {
    return this.batchSettlementEvmScheme.getReceiverAuthorizerSigner();
  }

  /**
   * Creates a {@link BaseBatchSettlementChannelManager} pre-configured with
   * this scheme's receiver, a token for the given network, and the provided
   * facilitator. Delegates to the underlying {@link BatchSettlementEvmScheme}
   * after asserting `network` is in Base's scope.
   *
   * @param facilitator - Facilitator client for submitting onchain claims/settlements.
   * @param network - CAIP-2 network identifier (e.g. `"eip155:84532"`).
   * @param token - Explicit token address to use. Falls back to the network's default asset.
   * @returns A ready-to-use channel manager.
   * @throws When `network` is not `eip155:8453` / `eip155:84532`
   */
  createChannelManager(
    facilitator: FacilitatorClient,
    network: Network,
    token?: `0x${string}`,
  ): BaseBatchSettlementChannelManager {
    assertBaseNetwork(network, "BaseScheme.createChannelManager");
    return this.batchSettlementEvmScheme.createChannelManager(facilitator, network, token);
  }
}
