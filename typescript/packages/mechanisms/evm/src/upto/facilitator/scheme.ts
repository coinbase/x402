import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { InMemoryPendingSettlementStore, PendingSettlementStore } from "@x402/core/facilitator";
import { FacilitatorEvmSigner } from "../../signer";
import {
  UptoEIP3009Payload,
  UptoPermit2Payload,
  isUptoEIP3009Payload,
  isUptoPermit2Payload,
} from "../../types";
import { verifyUptoPermit2, settleUptoPermit2 } from "./permit2";
import { settleUptoEIP3009, verifyUptoEIP3009 } from "./eip3009";

/** Optional configuration for {@link UptoEvmScheme}. */
export interface UptoEvmSchemeConfig {
  /**
   * Simulate Permit2 settlement again during settle.
   * ERC-3009 always simulates the actual amount before broadcast. Defaults to false.
   */
  simulateInSettle?: boolean;
  /**
   * Lets a retried settle for the same payload reconcile against an
   * already-broadcast transaction instead of re-verifying and
   * re-broadcasting (see {@link PendingSettlementStore}). Defaults to a
   * fresh in-memory store shared across all settle calls on this scheme
   * instance. Inject a shared, network-backed implementation (e.g. Redis)
   * for a multi-instance facilitator so a settle retry landing on a
   * different replica still reconciles correctly.
   */
  pendingSettlementStore?: PendingSettlementStore;
}

/**
 * EVM facilitator implementation for the Upto payment scheme.
 * Handles verification and settlement of ERC-3009 and Permit2 payments.
 */
export class UptoEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "upto";
  readonly caipFamily = "eip155:*";
  private readonly pendingStore: PendingSettlementStore;
  private readonly simulateInSettle: boolean;

  /**
   * Creates a new UptoEvmScheme facilitator instance.
   *
   * @param signer - The EVM signer for facilitator operations
   * @param config - Optional configuration
   */
  constructor(
    private readonly signer: FacilitatorEvmSigner,
    config?: UptoEvmSchemeConfig,
  ) {
    this.pendingStore = config?.pendingSettlementStore ?? new InMemoryPendingSettlementStore();
    this.simulateInSettle = config?.simulateInSettle ?? false;
  }

  /**
   * Returns the selected settlement signer under both method-specific keys.
   *
   * @param _ - The network identifier (unused)
   * @returns Settlement addresses, or undefined if no signer addresses are available
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    const addresses = this.signer.getAddresses();
    if (addresses.length === 0) {
      return undefined;
    }
    const address = addresses[Math.floor(Math.random() * addresses.length)];
    return { facilitatorAddress: address, settlerAddress: address };
  }

  /**
   * Returns the list of facilitator signer addresses for the upto scheme.
   *
   * @param _ - The network identifier (unused)
   * @returns Array of facilitator signer addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies an upto payment payload against the given requirements.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements to verify against
   * @param context - Optional facilitator context
   * @param _ - Payment required extensions (unused; reserved for interface parity)
   * @returns Promise resolving to a verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
    _?: Record<string, unknown>,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;
    if (isUptoEIP3009Payload(rawPayload)) {
      return verifyUptoEIP3009(
        this.signer,
        payload,
        requirements,
        rawPayload as UptoEIP3009Payload,
      );
    }
    if (isUptoPermit2Payload(rawPayload)) {
      return verifyUptoPermit2(
        this.signer,
        payload,
        requirements,
        rawPayload as UptoPermit2Payload,
        context,
      );
    }
    return { isValid: false, invalidReason: "unsupported_payload_type", payer: "" };
  }

  /**
   * Settles an upto payment onchain.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @param context - Optional facilitator context
   * @returns Promise resolving to a settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;
    if (isUptoEIP3009Payload(rawPayload)) {
      return settleUptoEIP3009(
        this.signer,
        payload,
        requirements,
        rawPayload as UptoEIP3009Payload,
        context,
        this.pendingStore,
      );
    }
    if (isUptoPermit2Payload(rawPayload)) {
      return settleUptoPermit2(
        this.signer,
        payload,
        requirements,
        rawPayload as UptoPermit2Payload,
        context,
        this.pendingStore,
        { simulateInSettle: this.simulateInSettle },
      );
    }
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: "unsupported_payload_type",
      payer: "",
    };
  }
}
