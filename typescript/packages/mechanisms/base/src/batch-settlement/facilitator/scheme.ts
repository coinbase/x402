import type {
  FacilitatorContext,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { AuthorizerSigner, FacilitatorEvmSigner } from "@x402/evm";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/facilitator";
import type { BatchSettlementEvmSchemeConfig } from "@x402/evm/batch-settlement/facilitator";
import { assertBaseNetwork, isBaseNetwork } from "../../networks";

/** Signer required by {@link BaseScheme} (facilitator). Identical to `@x402/evm`'s `FacilitatorEvmSigner`. */
export type BaseFacilitatorSigner = FacilitatorEvmSigner;

/** EIP-712 signer for receiver-authorizer claims/refunds. Identical to `@x402/evm`'s `AuthorizerSigner`. */
export type BaseAuthorizerSigner = AuthorizerSigner;

/** Optional constructor config for {@link BaseScheme} (facilitator). Identical to `@x402/evm`'s `BatchSettlementEvmSchemeConfig`. */
export type BaseBatchSettlementSchemeConfig = BatchSettlementEvmSchemeConfig;

/**
 * Base facilitator implementation for the batch-settlement (payment channel)
 * scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link BatchSettlementEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no facilitator-side
 * differences from generic EVM today - this class exists as an explicit,
 * overridable seam so Base-specific verify/settle behavior can be introduced
 * later without changing the public `@x402/base` API surface.
 *
 * `verify` and `settle` reject any network outside `eip155:8453` /
 * `eip155:84532` - see {@link assertBaseNetwork}. `getExtra` and
 * `getSigners` fail closed (return `undefined` / `[]`) off-Base instead.
 */
export class BaseScheme implements SchemeNetworkFacilitator {
  readonly scheme = "batch-settlement";
  readonly caipFamily = "eip155:*";
  private readonly batchSettlementEvmScheme: BatchSettlementEvmScheme;

  /**
   * Creates a facilitator scheme for verifying and settling batch-settlement payments.
   *
   * @param signer - Base (EVM) signer(s) used for tx submission and onchain reads.
   * @param authorizerSigner - Optional dedicated key that provides EIP-712 signatures for
   *   `claimWithSignature` / `refundWithSignature`.
   * @param config - Optional configuration (e.g. ERC-6492 factory allowlist).
   */
  constructor(
    signer: BaseFacilitatorSigner,
    authorizerSigner?: BaseAuthorizerSigner,
    config?: BaseBatchSettlementSchemeConfig,
  ) {
    this.batchSettlementEvmScheme = new BatchSettlementEvmScheme(signer, authorizerSigner, config);
  }

  /**
   * Returns facilitator-specific extra fields to be merged into payment
   * requirements, or `undefined` off-Base. Otherwise passes through to the
   * underlying {@link BatchSettlementEvmScheme}.
   *
   * @param network - Network identifier.
   * @returns Extra fields containing `receiverAuthorizer`, or `undefined`.
   */
  getExtra(network: string): { receiverAuthorizer: `0x${string}` } | undefined {
    if (!isBaseNetwork(network)) return undefined;
    return this.batchSettlementEvmScheme.getExtra(network);
  }

  /**
   * Returns all facilitator signer addresses available for the given
   * network, or `[]` off-Base. Otherwise passes through to the underlying
   * {@link BatchSettlementEvmScheme}.
   *
   * @param network - Network identifier.
   * @returns Array of hex addresses.
   */
  getSigners(network: string): `0x${string}`[] {
    if (!isBaseNetwork(network)) return [];
    return this.batchSettlementEvmScheme.getSigners(network);
  }

  /**
   * Verifies a payment payload (deposit or voucher) without executing
   * settlement. Passes through to the underlying {@link BatchSettlementEvmScheme}.
   *
   * @param payload - The x402 payment payload envelope.
   * @param requirements - Server payment requirements (scheme, network, asset, amount).
   * @param context - Optional facilitator extension context.
   * @param extensions - Payment required extensions (unused; reserved for interface parity).
   * @returns A {@link VerifyResponse} indicating validity with payer and channel state in `extra`.
   * @throws When `requirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
    extensions?: Record<string, unknown>,
  ): Promise<VerifyResponse> {
    assertBaseNetwork(requirements.network, "BaseScheme.verify");
    return this.batchSettlementEvmScheme.verify(payload, requirements, context, extensions);
  }

  /**
   * Executes settlement for a payment payload. Delegates to the underlying
   * {@link BatchSettlementEvmScheme} after asserting `requirements.network`
   * is in Base's scope.
   *
   * @param payload - The x402 payment payload envelope.
   * @param requirements - Server payment requirements.
   * @param context - Optional facilitator extension context.
   * @returns A {@link SettleResponse} with the transaction hash on success.
   * @throws When `requirements.network` is not `eip155:8453` / `eip155:84532`
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    assertBaseNetwork(requirements.network, "BaseScheme.settle");
    return this.batchSettlementEvmScheme.settle(payload, requirements, context);
  }
}
