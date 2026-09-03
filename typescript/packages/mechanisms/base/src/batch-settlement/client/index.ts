import type {
  BatchSettlementClientContext,
  BatchSettlementDepositStrategy,
  BatchSettlementDepositStrategyContext,
  BatchSettlementDepositStrategyResult,
  ClientChannelStorage,
} from "@x402/evm/batch-settlement/client";

export { BaseScheme } from "./scheme";
export type {
  BaseChannelConfig,
  BaseBatchSettlementDepositPolicy,
  BaseBatchSettlementSchemeOptions,
  BaseClientSigner,
  BaseRefundOptions,
} from "./scheme";

export { InMemoryClientChannelStorage as BaseInMemoryClientChannelStorage } from "@x402/evm/batch-settlement/client";

/** Per-request context surfaced to a {@link BaseBatchSettlementDepositStrategy}. Identical to `@x402/evm`'s `BatchSettlementClientContext`. */
export type BaseBatchSettlementClientContext = BatchSettlementClientContext;

/** Custom deposit-sizing callback. Identical to `@x402/evm`'s `BatchSettlementDepositStrategy`. */
export type BaseBatchSettlementDepositStrategy = BatchSettlementDepositStrategy;

/** Context passed to a {@link BaseBatchSettlementDepositStrategy}. Identical to `@x402/evm`'s `BatchSettlementDepositStrategyContext`. */
export type BaseBatchSettlementDepositStrategyContext = BatchSettlementDepositStrategyContext;

/** Return shape for a {@link BaseBatchSettlementDepositStrategy}. Identical to `@x402/evm`'s `BatchSettlementDepositStrategyResult`. */
export type BaseBatchSettlementDepositStrategyResult = BatchSettlementDepositStrategyResult;

/** Pluggable client-side channel storage backend. Identical to `@x402/evm`'s `ClientChannelStorage`. */
export type BaseClientChannelStorage = ClientChannelStorage;
