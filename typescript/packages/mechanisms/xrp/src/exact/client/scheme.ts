/**
 * XRP Client Scheme Implementation
 *
 * Implements SchemeNetworkClient for the Exact payment scheme on XRP
 */

import { PaymentRequirements, SchemeNetworkClient, PaymentPayload, PaymentPayloadResult } from "@x402/core/types";
import { ClientXrpSigner, XrpPaymentTransaction, ExactXrpPayloadV2 } from "../../types";
import { Client, Wallet, xAddressToClassicAddress, isValidAddress } from "xrpl";
import { getNetworkUrl, validateXrpNetwork } from "../../utils/network";
import { buildPaymentTransaction } from "../../utils/transaction";

export interface ExactXrpSchemeConfig {
  /** XRPL server URL (auto-detected from network if not provided) */
  serverUrl?: string;
  /** Maximum fee willing to pay (in drops, default: 1000 = 0.001 XRP) */
  maxFeeDrops?: string;
  /** Number of ledgers until transaction expires (default: 20) */
  lastLedgerOffset?: number;
}

/**
 * XRP client implementation for the Exact payment scheme.
 */
export class ExactXrpScheme implements SchemeNetworkClient {
  readonly scheme = "exact";
  private client?: Client;
  private config: Required<ExactXrpSchemeConfig>;

  /**
   * Creates a new ExactXrpScheme instance.
   *
   * @param signer - The XRP signer for client operations
   * @param config - Optional configuration
   */
  constructor(
    private readonly signer: ClientXrpSigner,
    config?: ExactXrpSchemeConfig,
  ) {
    this.config = {
      serverUrl: config?.serverUrl ?? "",
      maxFeeDrops: config?.maxFeeDrops ?? "1000",
      lastLedgerOffset: config?.lastLedgerOffset ?? 20,
    };
  }

  /**
   * Connect to the XRPL server
   */
  async connect(): Promise<void> {
    if (!this.client) {
      // Will be initialized on first prepare with network info
      return;
    }
    if (!this.client.isConnected()) {
      await this.client.connect();
    }
  }

  /**
   * Disconnect from the XRPL server
   */
  async disconnect(): Promise<void> {
    if (this.client?.isConnected()) {
      await this.client.disconnect();
    }
  }

  /**
   * Prepare a payment payload for the given requirements.
   *
   * @param requirements - The payment requirements from the server
   * @returns The payment payload to be sent with the request
   */
  async prepare(requirements: PaymentRequirements): Promise<PaymentPayload> {
    // Validate network
    if (!validateXrpNetwork(requirements.network)) {
      throw new Error(`Unsupported network: ${requirements.network}. Expected xrp:mainnet, xrp:testnet, or xrp:devnet`);
    }

    // Initialize client if needed
    if (!this.client) {
      const serverUrl = this.config.serverUrl || getNetworkUrl(requirements.network);
      this.client = new Client(serverUrl);
    }

    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    // Get current ledger info
    const [currentLedger, fee, sequence] = await Promise.all([
      this.client.getLedgerIndex(),
      this.client.getFee(),
      this.signer.getNextSequence(this.client),
    ]);

    // Parse fee and cap at max
    const feeDrops = BigInt(fee);
    const maxFeeDrops = BigInt(this.config.maxFeeDrops);
    const finalFee = feeDrops > maxFeeDrops ? this.config.maxFeeDrops : fee.toString();

    // Handle destination (convert X-address if needed)
    let destination = requirements.payTo;
    let destinationTag: number | undefined = requirements.extra?.destinationTag as number | undefined;

    // Check if it's an X-address and extract components
    try {
      const decoded = xAddressToClassicAddress(destination);
      destination = decoded.classicAddress;
      // Only use extracted tag if not explicitly provided
      if (destinationTag === undefined && decoded.tag !== undefined && decoded.tag !== false) {
        destinationTag = decoded.tag;
      }
    } catch {
      // Not an X-address, use as-is
    }

    // Validate the destination address
    if (!isValidAddress(destination)) {
      throw new Error(`Invalid XRP destination address: ${requirements.payTo}`);
    }

    // Build the transaction
    const transaction = buildPaymentTransaction({
      account: this.signer.address,
      destination,
      amount: requirements.amount,
      fee: finalFee,
      sequence,
      lastLedgerSequence: currentLedger + this.config.lastLedgerOffset,
      destinationTag,
      memo: requirements.extra?.memo as { memoType: string; memoData: string } | undefined,
    });

    // Sign the transaction
    const signedBlob = await this.signer.signPayment(transaction);

    // Build the x402 payload
    const xrpPayload: ExactXrpPayloadV2 = {
      signedTransaction: signedBlob,
      transaction: transaction as XrpPaymentTransaction,
    };

    return {
      x402Version: 2,
      resource: {
        url: "", // Client doesn't know the URL, server fills this in
      },
      accepted: {
        ...requirements,
        // Store any extracted destination tag back in extra
        extra: {
          ...requirements.extra,
          ...(destinationTag !== undefined && { destinationTag }),
        },
      },
      payload: xrpPayload,
    };
  }
}
