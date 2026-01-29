import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { ConcordiumClient, TransactionInfo } from "../../client";
import { ExactConcordiumPayloadV2 } from "../../types";

/**
 * Configuration for the Concordium facilitator scheme
 */
export interface ExactConcordiumSchemeConfig {
  /**
   * Concordium node client for verifying transactions
   */
  client: ConcordiumClient;

  /**
   * Whether to wait for transaction finalization before settling.
   * If false, accepts committed (but not finalized) transactions.
   *
   * @default true
   */
  requireFinalization?: boolean;

  /**
   * Timeout in milliseconds for waiting for finalization
   *
   * @default 60000 (60 seconds)
   */
  finalizationTimeoutMs?: number;

  /**
   * Supported assets (for /supported endpoint).
   * If not provided, only CCD is reported.
   */
  supportedAssets?: Array<{ symbol: string; decimals: number }>;
}

/**
 * Concordium facilitator implementation for the Exact payment scheme.
 */
export class ExactConcordiumScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";

  readonly caipFamily = "ccd:*";

  private readonly client: ConcordiumClient;
  private readonly requireFinalization: boolean;
  private readonly finalizationTimeoutMs: number;
  private readonly supportedAssets: Array<{ symbol: string; decimals: number }>;

  /**
   * Creates a new ExactConcordiumScheme instance for facilitator operations.
   *
   * @param config - Configuration with Concordium node client
   */
  constructor(config: ExactConcordiumSchemeConfig) {
    this.client = config.client;
    this.requireFinalization = config.requireFinalization ?? true;
    this.finalizationTimeoutMs = config.finalizationTimeoutMs ?? 60000;
    this.supportedAssets = config.supportedAssets ?? [{ symbol: "CCD", decimals: 6 }];
  }

  /**
   * Returns supported assets for /supported endpoint.
   *
   * @param _ - Unused network parameter
   * @returns Extra configuration including supported assets
   */
  getExtra(_: Network): Record<string, unknown> | undefined {
    return {
      assets: this.supportedAssets,
    };
  }

  /**
   * Concordium client broadcasts directly; no facilitator signers.
   *
   * @param _ - Unused address parameter
   * @returns Empty array as no signers are needed
   */
  getSigners(_: string): string[] {
    return [];
  }

  /**
   * Verifies a payment payload by checking the transaction on-chain.
   *
   * @param payload - The payment payload to verify
   * @param _ - The payment requirements (unused in verification)
   * @returns Promise resolving to verification response
   */
  async verify(payload: PaymentPayload, _: PaymentRequirements): Promise<VerifyResponse> {
    const concordiumPayload = payload.payload as ExactConcordiumPayloadV2;
    const payer = concordiumPayload.sender;

    if (!concordiumPayload.txHash) {
      return this.invalid("missing_tx_hash", payer);
    }

    if (!concordiumPayload.sender) {
      return this.invalid("missing_sender", payer);
    }

    return { isValid: true, payer };
  }

  /**
   * Settles a payment by verifying finalization.
   *
   * Unlike EVM where the facilitator executes the transaction,
   * for Concordium the transaction is already broadcast by the client.
   * The Settlement just confirms the transaction is finalized.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const concordiumPayload = payload.payload as ExactConcordiumPayloadV2;
    const network = payload.accepted.network;
    const txHash = concordiumPayload.txHash;
    const payer = concordiumPayload.sender;

    let txInfo: TransactionInfo | null;
    try {
      txInfo = await this.client.waitForFinalization(txHash, this.finalizationTimeoutMs);
    } catch {
      return this.failure(network, txHash, payer, "transaction_lookup_failed");
    }

    if (!txInfo) {
      return this.failure(network, txHash, payer, "transaction_not_found");
    }

    if (txInfo.status === "failed") {
      return this.failure(network, txHash, payer, "transaction_failed");
    }

    if (txInfo.status !== "finalized") {
      return this.failure(network, txHash, payer, "finalization_timeout");
    }

    if (txInfo.sender && !this.addressEquals(txInfo.sender, payer)) {
      return this.failure(network, txHash, payer, "sender_mismatch");
    }

    if (!txInfo.recipient || !this.addressEquals(txInfo.recipient, requirements.payTo)) {
      return this.failure(network, txHash, payer, "recipient_mismatch");
    }

    const requiredAmount = this.getRequiredAmount(requirements);
    const actualAmount = BigInt(txInfo.amount || "0");

    if (actualAmount < requiredAmount) {
      return this.failure(network, txHash, payer, "insufficient_amount");
    }

    const expectedAsset = requirements.asset || "";
    const actualAsset = txInfo.asset || "";

    if (expectedAsset !== actualAsset) {
      return this.failure(network, txHash, payer, "asset_mismatch");
    }

    return {
      success: true,
      network,
      transaction: txHash,
      payer,
    };
  }

  /**
   * Creates an invalid verification response.
   *
   * @param reason - The reason for invalidity
   * @param payer - The payer address
   * @returns Invalid verification response
   */
  private invalid(reason: string, payer: string): VerifyResponse {
    return { isValid: false, invalidReason: reason, payer };
  }

  /**
   * Creates a failed settlement response.
   *
   * @param network - The network identifier
   * @param transaction - The transaction hash
   * @param payer - The payer address
   * @param errorReason - The reason for failure
   * @returns Failed settlement response
   */
  private failure(
    network: Network,
    transaction: string,
    payer: string,
    errorReason: string,
  ): SettleResponse {
    return {
      success: false,
      network,
      transaction,
      payer,
      errorReason,
    };
  }

  /**
   * Compares two addresses for equality (case-insensitive).
   *
   * @param a - First address
   * @param b - Second address
   * @returns True if addresses match
   */
  private addressEquals(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
  }

  /**
   * Extracts the required payment amount from requirements.
   *
   * @param requirements - The payment requirements
   * @returns The required amount as bigint
   */
  private getRequiredAmount(requirements: PaymentRequirements): bigint {
    const reqs = requirements as PaymentRequirements & {
      maxAmountRequired?: string;
      amount?: string;
    };
    const amount = reqs.maxAmountRequired || reqs.amount || "0";
    return BigInt(amount);
  }
}
