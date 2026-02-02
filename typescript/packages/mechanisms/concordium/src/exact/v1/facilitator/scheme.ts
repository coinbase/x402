import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { PaymentPayloadV1 } from "@x402/core/types/v1";
import type { ConcordiumClient, TransactionInfo } from "../../../client";
import type { ExactConcordiumPayloadV1 } from "../../../types";

export interface ExactConcordiumSchemeV1Config {
  /**
   * Concordium client instance.
   */
  client: ConcordiumClient;

  /**
   * Whether to wait for finalization before settling.
   *
   * @default true
   */
  requireFinalization?: boolean;

  /**
   * Finalization timeout in milliseconds.
   *
   * @default 60000
   */
  finalizationTimeoutMs?: number;

  /**
   * Supported assets (for /supported endpoint).
   */
  supportedAssets?: Array<{ symbol: string; decimals: number }>;
}

/**
 * Payload structure that supports both V1 and V2 formats.
 */
interface NormalizedPayload {
  network: Network;
  scheme: string;
  txHash: string;
  sender: string;
  asset?: string;
}

/**
 * Requirements structure that supports both V1 and V2 formats.
 */
interface NormalizedRequirements {
  payTo: string;
  maxAmountRequired: string;
  asset?: string;
  network?: Network;
}

/**
 * Concordium facilitator V1 for exact payments.
 *
 * V1 uses PaymentPayloadV1/PaymentRequirementsV1 types.
 */
export class ExactConcordiumSchemeV1 implements SchemeNetworkFacilitator {
  readonly scheme = "exact";

  readonly caipFamily = "ccd:*";

  private readonly client: ConcordiumClient;
  private readonly requireFinalization: boolean;
  private readonly finalizationTimeoutMs: number;
  private readonly supportedAssets: Array<{ symbol: string; decimals: number }>;

  /**
   * Creates a new ExactConcordiumSchemeV1 instance.
   *
   * @param config - Configuration with Concordium client
   */
  constructor(config: ExactConcordiumSchemeV1Config) {
    this.client = config.client;
    this.requireFinalization = config.requireFinalization ?? true;
    this.finalizationTimeoutMs = config.finalizationTimeoutMs ?? 60000;
    this.supportedAssets = config.supportedAssets ?? [{ symbol: "CCD", decimals: 6 }];
  }

  /**
   * Returns supported assets for /supported endpoint.
   *
   * @param _ - Network identifier (unused)
   * @returns Extra metadata including supported assets
   */
  getExtra(_: Network): Record<string, unknown> | undefined {
    return {
      assets: this.supportedAssets,
    };
  }

  /**
   * Returns facilitator signers (empty for Concordium).
   *
   * @param _ - Network identifier (unused)
   * @returns Empty array as Concordium doesn't require facilitator signers
   */
  getSigners(_: string): string[] {
    return [];
  }

  /**
   * Verifies a payment payload has required fields.
   *
   * @param payload - The payment payload to verify
   * @param _ - The payment requirements (unused in verification)
   * @returns Promise resolving to verification response
   */
  async verify(payload: PaymentPayload, _: PaymentRequirements): Promise<VerifyResponse> {
    const normalized = this.normalizePayload(payload);
    const payer = normalized.sender;

    if (!normalized.txHash) {
      return this.invalid("missing_tx_hash", payer);
    }

    if (!normalized.sender) {
      return this.invalid("missing_sender", payer);
    }

    return { isValid: true, payer };
  }

  /**
   * Settles a payment by verifying finalization.
   *
   * Unlike EVM where the facilitator executes the transaction,
   * for Concordium the transaction is already broadcast by the client.
   * Settlement confirms the transaction is finalized and valid.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const normalized = this.normalizePayload(payload);
    const normalizedReqs = this.normalizeRequirements(requirements);
    const { network, txHash, sender: payer } = normalized;

    // Basic verification first
    const verification = await this.verify(payload, requirements);
    if (!verification.isValid) {
      return this.failure(
        network,
        txHash,
        payer,
        verification.invalidReason || "verification_failed",
      );
    }

    // Validate scheme and network
    if (normalized.scheme !== "exact") {
      return this.failure(network, txHash, payer, "unsupported_scheme");
    }

    if (!this.isConcordiumNetwork(network)) {
      return this.failure(network, txHash, payer, "unsupported_network");
    }

    // V1 compatibility: check network match if requirements has network
    if (normalizedReqs.network && network !== normalizedReqs.network) {
      return this.failure(network, txHash, payer, "network_mismatch");
    }

    // Lookup transaction
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

    // Validate sender
    if (txInfo.sender && !this.addressEquals(txInfo.sender, payer)) {
      return this.failure(network, txHash, payer, "sender_mismatch");
    }

    // Validate recipient
    if (!txInfo.recipient || !this.addressEquals(txInfo.recipient, normalizedReqs.payTo)) {
      return this.failure(network, txHash, payer, "recipient_mismatch");
    }

    // Validate amount
    const requiredAmount = BigInt(normalizedReqs.maxAmountRequired || "0");
    const actualAmount = BigInt(txInfo.amount || "0");
    if (actualAmount < requiredAmount) {
      return this.failure(network, txHash, payer, "insufficient_amount");
    }

    // Validate asset
    const expectedAsset = normalizedReqs.asset || "";
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
   * Normalizes payload to support both V1 and V2 formats.
   *
   * @param payload - Payment payload in V1 or V2 format
   * @returns Normalized payload structure
   */
  private normalizePayload(payload: PaymentPayload): NormalizedPayload {
    // Check for V2 format (has payload.accepted.network)
    const payloadAny = payload as PaymentPayload & {
      accepted?: { network: Network };
      network?: Network;
      scheme?: string;
    };

    const isV2 = !!payloadAny.accepted?.network;
    const ccdPayload = payload.payload as ExactConcordiumPayloadV1;

    if (isV2) {
      return {
        network: payloadAny.accepted!.network,
        scheme: "exact",
        txHash: ccdPayload.txHash,
        sender: ccdPayload.sender,
        asset: ccdPayload.asset,
      };
    }

    // V1 format
    const payloadV1 = payload as unknown as PaymentPayloadV1;
    return {
      network: payloadV1.network,
      scheme: payloadV1.scheme,
      txHash: ccdPayload.txHash,
      sender: ccdPayload.sender,
      asset: ccdPayload.asset,
    };
  }

  /**
   * Normalizes requirements to support both V1 and V2 formats.
   *
   * @param requirements - Payment requirements in V1 or V2 format
   * @returns Normalized requirements structure
   */
  private normalizeRequirements(requirements: PaymentRequirements): NormalizedRequirements {
    const reqsAny = requirements as PaymentRequirements & {
      maxAmountRequired?: string;
      amount?: string;
      network?: Network;
    };

    return {
      payTo: requirements.payTo,
      maxAmountRequired: reqsAny.maxAmountRequired || reqsAny.amount || "0",
      asset: requirements.asset,
      network: reqsAny.network,
    };
  }

  /**
   * Creates an invalid verification response.
   *
   * @param reason - The reason for invalidity
   * @param payer - The payer address
   * @returns Invalid verification response
   */
  private invalid(reason: string, payer?: string): VerifyResponse {
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
   * Checks if the network is a Concordium network.
   *
   * @param network - Network identifier to check
   * @returns True if network starts with "ccd:"
   */
  private isConcordiumNetwork(network: string): boolean {
    return network.startsWith("ccd:");
  }

  /**
   * Compares two addresses case-insensitively.
   *
   * @param a - First address
   * @param b - Second address
   * @returns True if addresses match
   */
  private addressEquals(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
  }
}
