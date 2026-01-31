/**
 * Concordium Client for x402 facilitator.
 *
 * Supports:
 * - Native CCD transfers (transactionType: "transfer")
 * - PLT token transfers (transactionType: "tokenUpdate")
 */

import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import {
  TransactionHash,
  ContractAddress as SDKContractAddress,
  ReceiveName,
  Parameter,
  CcdAmount,
  BlockItemStatus,
} from "@concordium/web-sdk";

import { getChainConfig } from "../config";

export type TransactionStatus = "pending" | "committed" | "finalized" | "failed";

export interface TransactionInfo {
  txHash: string;
  status: TransactionStatus;
  sender: string;
  recipient?: string;
  amount?: string;
  asset?: string;
}

export interface ConcordiumClientConfig {
  host: string;
  port?: number;
  useTls?: boolean;
}

export interface ContractAddress {
  index: bigint;
  subindex: bigint;
}

export interface PaymentVerification {
  valid: boolean;
  reason?:
    | "not_found"
    | "pending"
    | "failed"
    | "recipient_mismatch"
    | "insufficient_amount"
    | "asset_mismatch";
  info?: TransactionInfo;
}

/** Raw transaction summary from Concordium SDK */
interface TransactionSummary {
  sender: { address?: string };
  transactionType: string;
  transfer?: {
    to?: { address?: string };
    amount?: CcdAmount.Type;
  };
  events?: TransactionEvent[];
}

/** Token transfer event from PLT transactions */
interface TransactionEvent {
  tag: string;
  to?: { address?: { address?: string } };
  amount?: { value?: bigint };
  tokenId?: { value?: string };
}

/** Block item status with an outcome */
type BlockItemStatusWithOutcome = BlockItemStatus & {
  outcome?: { summary?: TransactionSummary };
};

/**
 * Client for interacting with Concordium blockchain nodes via gRPC.
 */
export class ConcordiumClient {
  private config: Required<ConcordiumClientConfig>;
  private client: ConcordiumGRPCNodeClient | null = null;

  /**
   * Creates a new ConcordiumClient instance.
   *
   * @param config - Client configuration options
   */
  constructor(config: ConcordiumClientConfig) {
    this.config = {
      host: config.host,
      port: config.port ?? 20000,
      useTls: config.useTls ?? true,
    };
  }

  /**
   * Creates a ConcordiumClient from a network identifier.
   *
   * @param network - Network identifier (V1 name or CAIP-2 format)
   * @returns A new ConcordiumClient configured for the specified network
   * @throws Error if network is unknown
   */
  static fromNetwork(network: string): ConcordiumClient {
    const chain = getChainConfig(network);
    if (!chain) {
      throw new Error(`Unknown network: ${network}`);
    }

    const [host, port] = chain.grpcUrl.split(":");
    return new ConcordiumClient({
      host,
      port: parseInt(port, 10) || 20000,
    });
  }

  /**
   * Gets transaction status and details from the blockchain.
   * Supports both CCD transfers and PLT token transfers.
   *
   * @param txHash - Transaction hash to query
   * @returns Transaction info or null if not found
   */
  async getTransactionStatus(txHash: string): Promise<TransactionInfo | null> {
    const client = this.getClient();

    try {
      const hash = TransactionHash.fromHexString(txHash);
      const blockStatus = (await client.getBlockItemStatus(hash)) as BlockItemStatusWithOutcome;

      if (!blockStatus) {
        return null;
      }

      const status = this.mapStatus(blockStatus.status);
      const summary = blockStatus.outcome?.summary;

      if (!summary) {
        return { txHash, status, sender: "" };
      }

      const sender = summary.sender.address ?? "";
      const transactionType = summary.transactionType;

      if (transactionType === "failed") {
        return { txHash, status: "failed", sender };
      }

      // CCD transfer
      if (transactionType === "transfer" && summary.transfer) {
        const amountMicroCcd = summary.transfer.amount
          ? CcdAmount.toMicroCcd(summary.transfer.amount)
          : 0n;

        return {
          txHash,
          status,
          sender,
          recipient: summary.transfer.to?.address,
          amount: amountMicroCcd.toString(),
          asset: "",
        };
      }

      // PLT token transfer
      if (transactionType === "tokenUpdate" && summary.events?.length) {
        const transferEvent = summary.events.find(
          (e: TransactionEvent) => e.tag === "TokenTransfer",
        );

        if (transferEvent) {
          return {
            txHash,
            status,
            sender,
            recipient: transferEvent.to?.address?.address,
            amount: transferEvent.amount?.value?.toString(),
            asset: transferEvent.tokenId?.value,
          };
        }
      }

      return { txHash, status, sender };
    } catch {
      return null;
    }
  }

  /**
   * Waits for a transaction to reach finalization or failure.
   *
   * @param txHash - Transaction hash to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 60000)
   * @returns Transaction info when finalized/failed, or null if not found
   */
  async waitForFinalization(
    txHash: string,
    timeoutMs: number = 60000,
  ): Promise<TransactionInfo | null> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const info = await this.getTransactionStatus(txHash);

      if (!info) return null;
      if (info.status === "finalized" || info.status === "failed") {
        return info;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    return this.getTransactionStatus(txHash);
  }

  /**
   * Verifies a payment transaction meets expected criteria.
   *
   * @param txHash - Transaction hash to verify
   * @param expected - Expected payment parameters
   * @param expected.recipient - Expected recipient address
   * @param expected.minAmount - Minimum required amount in smallest units
   * @param expected.asset - Expected asset (empty string for CCD)
   * @returns Verification result with reason if invalid
   */
  async verifyPayment(
    txHash: string,
    expected: { recipient: string; minAmount: bigint; asset?: string },
  ): Promise<PaymentVerification> {
    const info = await this.getTransactionStatus(txHash);

    if (!info) {
      return { valid: false, reason: "not_found" };
    }

    if (info.status === "failed") {
      return { valid: false, reason: "failed", info };
    }

    if (info.status === "pending") {
      return { valid: false, reason: "pending", info };
    }

    if (!info.recipient || !this.addressEquals(info.recipient, expected.recipient)) {
      return { valid: false, reason: "recipient_mismatch", info };
    }

    if (BigInt(info.amount ?? "0") < expected.minAmount) {
      return { valid: false, reason: "insufficient_amount", info };
    }

    const expectedAsset = expected.asset ?? "";
    const actualAsset = info.asset ?? "";
    if (expectedAsset !== actualAsset) {
      return { valid: false, reason: "asset_mismatch", info };
    }

    return { valid: true, info };
  }

  /**
   * Invokes a smart contract method (read-only).
   *
   * @param contract - Contract address (index and subindex)
   * @param method - Fully qualified method name (e.g., "contract.view")
   * @param params - Optional serialized parameters
   * @returns Invocation result with return value or error
   */
  async invokeContract(
    contract: ContractAddress,
    method: string,
    params?: Uint8Array,
  ): Promise<{ success: boolean; returnValue?: Uint8Array; error?: string }> {
    const client = this.getClient();

    try {
      const address = SDKContractAddress.create(contract.index, contract.subindex);

      const result = await client.invokeContract({
        contract: address,
        method: ReceiveName.fromString(method),
        parameter: params
          ? Parameter.fromBuffer(new Uint8Array(params).buffer as ArrayBuffer)
          : undefined,
      });

      if (result.tag === "failure") {
        return { success: false, error: String(result.reason) };
      }

      return {
        success: true,
        returnValue: result.returnValue?.buffer
          ? new Uint8Array(result.returnValue.buffer)
          : undefined,
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Gets or creates the gRPC client instance.
   *
   * @returns The gRPC client
   */
  private getClient(): ConcordiumGRPCNodeClient {
    if (!this.client) {
      const grpcCredentials = this.config.useTls
        ? credentials.createSsl()
        : credentials.createInsecure();

      this.client = new ConcordiumGRPCNodeClient(
        this.config.host,
        this.config.port,
        grpcCredentials,
      );
    }

    return this.client;
  }

  /**
   * Maps SDK transaction status to internal status.
   *
   * @param status - SDK status string
   * @returns Normalized transaction status
   */
  private mapStatus(status: string): TransactionStatus {
    switch (status) {
      case "finalized":
        return "finalized";
      case "committed":
        return "committed";
      default:
        return "pending";
    }
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
