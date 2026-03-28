/**
 * XRP Signers for x402
 * 
 * ClientXrpSigner - Used by clients to sign payment transactions
 * FacilitatorXrpSigner - Used by facilitators to verify and submit transactions
 */

import {
  Client,
  Wallet,
  xrpToDrops,
  dropsToXrp,
  decode,
  verifySignature as xrplVerifySignature,
} from "xrpl";
import type {
  ClientXrpSigner,
  FacilitatorXrpSigner,
  XrpPaymentTransaction,
} from "../types";

/**
 * Convert a Wallet to a ClientXrpSigner
 * Uses the XRPL Wallet class for signing
 */
export function toClientXrpSigner(wallet: Wallet): ClientXrpSigner {
  return {
    address: wallet.address,

    async signPayment(
      transaction: Omit<XrpPaymentTransaction, "TxnSignature" | "SigningPubKey">,
    ): Promise<string> {
      const signedTx = wallet.sign(transaction as unknown as Record<string, unknown>);
      return signedTx.tx_blob;
    },

    async getNextSequence(client: Client): Promise<number> {
      try {
        const response = await client.request({
          command: "account_info",
          account: wallet.address,
          ledger_index: "current",
        });
        return (response.result.account_data.Sequence || 1) as number;
      } catch {
        // Account not found - it will be created with sequence 1
        return 1;
      }
    },
  };
}

/**
 * Configuration for FacilitatorXrpClient
 */
export interface FacilitatorXrpClientConfig {
  /** XRPL server URL */
  server: string;
  /** Retry attempts for failed submissions */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelayMs?: number;
  /** Timeout for transaction validation in milliseconds */
  validationTimeoutMs?: number;
}

/**
 * Facilitator XRP Client implementation
 * Wraps an XRPL Client and provides x402-specific functionality
 */
export class FacilitatorXrpClient implements FacilitatorXrpSigner {
  private client: Client;
  private addresses: string[];
  private maxRetries: number;
  private retryDelayMs: number;
  private validationTimeoutMs: number;

  constructor(config: FacilitatorXrpClientConfig) {
    this.client = new Client(config.server);
    this.addresses = [];
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.validationTimeoutMs = config.validationTimeoutMs ?? 60000;
  }

  /**
   * Connect to the XRPL server
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Disconnect from the XRPL server
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  /**
   * Add addresses this facilitator can use
   */
  addAddress(address: string): void {
    if (!this.addresses.includes(address)) {
      this.addresses.push(address);
    }
  }

  getAddresses(): readonly string[] {
    return [...this.addresses];
  }

  async submitTransaction(signedTransaction: string): Promise<{ hash: string }> {
    // First, decode to get the transaction hash
    const decoded = decode(signedTransaction);
    const hash = decoded.hash as string;

    // Submit with retries
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.client.request({
          command: "submit",
          tx_blob: signedTransaction,
        });

        if (response.result.engine_result === "tesSUCCESS" ||
            response.result.engine_result?.startsWith("tec")) {
          return { hash };
        }

        // Transient failure - retry
        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelayMs);
        }
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelayMs);
        }
      }
    }

    throw lastError || new Error(`Failed to submit transaction after ${this.maxRetries} attempts`);
  }

  async waitForValidation(hash: string): Promise<{
    validated: boolean;
    result: string;
    metadata?: unknown;
  }> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.validationTimeoutMs) {
      try {
        const response = await this.client.request({
          command: "tx",
          transaction: hash,
          binary: false,
        });

        if (response.result.validated) {
          const meta = response.result.meta as Record<string, unknown> | undefined;
          return {
            validated: true,
            result: meta?.TransactionResult as string || "tesSUCCESS",
            metadata: meta,
          };
        }
      } catch {
        // Transaction not found yet, keep waiting
      }

      await this.delay(1000); // Poll every second
    }

    return { validated: false, result: "timeout" };
  }

  async verifySignature(
    transaction: XrpPaymentTransaction,
    signedBlob: string,
  ): Promise<boolean> {
    try {
      // Decode the signed blob
      const decoded = decode(signedBlob);

      // Verify it matches the transaction
      if ((decoded as unknown as Record<string, unknown>).TransactionType !== transaction.TransactionType ||
          (decoded as unknown as Record<string, unknown>).Account !== transaction.Account) {
        return false;
      }

      // Use XRPL's verifySignature function
      return xrplVerifySignature(signedBlob);
    } catch {
      return false;
    }
  }

  async getAccountInfo(address: string): Promise<{
    balance: string;
    sequence: number;
    ownerCount: number;
  }> {
    try {
      const response = await this.client.request({
        command: "account_info",
        account: address,
        ledger_index: "current",
      });

      const accountData = response.result.account_data as Record<string, unknown>;
      return {
        balance: accountData.Balance as string || "0",
        sequence: accountData.Sequence as number || 1,
        ownerCount: accountData.OwnerCount as number || 0,
      };
    } catch (error) {
      // Account not found
      if ((error as Error).message?.includes("actNotFound")) {
        return {
          balance: "0",
          sequence: 1,
          ownerCount: 0,
        };
      }
      throw error;
    }
  }

  async getLedgerIndex(): Promise<number> {
    const response = await this.client.request({
      command: "ledger_current",
    });
    return response.result.ledger_current_index as number;
  }

  async getFee(): Promise<string> {
    const response = await this.client.request({
      command: "fee",
    });
    const drops = response.result.drops as Record<string, unknown>;
    return (drops.minimum_fee as string) || "12";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Convert a FacilitatorXrpClient to a FacilitatorXrpSigner
 * This is the main export for facilitators
 */
export function toFacilitatorXrpSigner(
  client: FacilitatorXrpClient,
): FacilitatorXrpSigner {
  return client;
}

export type { ClientXrpSigner, FacilitatorXrpSigner };
