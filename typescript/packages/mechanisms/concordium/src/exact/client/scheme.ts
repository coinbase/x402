import { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { ExactConcordiumPayloadV2 } from "../../types";

/**
 * Configuration for the Concordium client scheme.
 *
 * Unlike EVM, Concordium doesn't need a signer because the client
 * broadcasts the transaction directly from their wallet.
 */
export interface ExactConcordiumSchemeConfig {
  /**
   * Callback to create and broadcast a Concordium transaction.
   * This is called when a payment is needed.
   *
   * @param payTo - The recipient address
   * @param amount - The amount in microCCD or token units
   * @param asset - The asset contract address (empty for native CCD)
   * @returns Promise resolving to transaction hash and sender address
   */
  createAndBroadcastTransaction: (
    payTo: string,
    amount: string,
    asset: string,
  ) => Promise<{ txHash: string; sender: string; blockHash?: string }>;
}

/**
 * Concordium client implementation for the Exact payment scheme.
 *
 * This implementation differs from EVM in that:
 * - No signature is created (transaction is broadcast directly)
 * - The client provides a callback to handle wallet interaction
 * - The payload contains the transaction hash after broadcast
 */
export class ExactConcordiumScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactConcordiumScheme instance.
   *
   * @param config - Configuration with transaction broadcast callback
   */
  constructor(private readonly config: ExactConcordiumSchemeConfig) {}

  /**
   * Creates a payment payload for the Exact scheme on Concordium.
   *
   * This will trigger the wallet to create and broadcast the transaction,
   * then return a payload with the transaction hash.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to a payment payload with txHash
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    // Call the user-provided callback to create and broadcast the transaction
    const { txHash, sender, blockHash } = await this.config.createAndBroadcastTransaction(
      paymentRequirements.payTo,
      paymentRequirements.amount,
      paymentRequirements.asset,
    );

    const payload: ExactConcordiumPayloadV2 = {
      txHash,
      sender,
      blockHash,
    };

    return {
      x402Version,
      payload,
    };
  }
}
