import type {
  AutoSettlementConfig,
  AutoSettlementContext,
  ChannelManagerConfig,
  ChannelUpdateResult,
  ClaimChannelSelector,
  ClaimOptions,
  ClaimResult,
  PendingRequest,
  RefundResult,
  SettleResult,
} from "@x402/evm/batch-settlement/server";

export { BaseScheme } from "./scheme";
export type {
  BaseAuthorizerSigner,
  BaseBatchSettlementChannelManager,
  BaseBatchSettlementRequestContext,
  BaseBatchSettlementSchemeServerConfig,
  BaseChannel,
  BaseChannelStorage,
} from "./scheme";

export { InMemoryChannelStorage as BaseInMemoryChannelStorage } from "@x402/evm/batch-settlement/server";

/** Result of a completed onchain channel state update. Identical to `@x402/evm`'s `ChannelUpdateResult`. */
export type BaseChannelUpdateResult = ChannelUpdateResult;

/** A channel's pending withdrawal reservation. Identical to `@x402/evm`'s `PendingRequest`. */
export type BasePendingRequest = PendingRequest;

/** Constructor config for {@link BaseBatchSettlementChannelManager}. Identical to `@x402/evm`'s `ChannelManagerConfig`. */
export type BaseChannelManagerConfig = ChannelManagerConfig;

/** Auto-settlement policy for {@link BaseBatchSettlementChannelManager}. Identical to `@x402/evm`'s `AutoSettlementConfig`. */
export type BaseAutoSettlementConfig = AutoSettlementConfig;

/** Context passed to an auto-settlement policy callback. Identical to `@x402/evm`'s `AutoSettlementContext`. */
export type BaseAutoSettlementContext = AutoSettlementContext;

/** Selector for which channels to claim in a batch. Identical to `@x402/evm`'s `ClaimChannelSelector`. */
export type BaseClaimChannelSelector = ClaimChannelSelector;

/** Options accepted by a batch claim call. Identical to `@x402/evm`'s `ClaimOptions`. */
export type BaseClaimOptions = ClaimOptions;

/** Result of a batch claim call. Identical to `@x402/evm`'s `ClaimResult`. */
export type BaseClaimResult = ClaimResult;

/** Result of a channel refund. Identical to `@x402/evm`'s `RefundResult`. */
export type BaseRefundResult = RefundResult;

/** Result of a channel settle call. Identical to `@x402/evm`'s `SettleResult`. */
export type BaseSettleResult = SettleResult;
