import type { PaymentRequirements } from "@x402/core/types";
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenId,
  TransactionId,
  TransferTransaction,
} from "@hashgraph/sdk";
import { DEFAULT_REPLAY_WINDOW_MS } from "./constants";
import { isHbarAsset, normalizeHederaNetwork } from "./utils";

/**
 * Client-side signer interface for Hedera transactions.
 */
export type ClientHederaSigner = {
  /**
   * Hedera account id of the payer creating the transfer.
   */
  readonly accountId: string;

  /**
   * Builds and signs a partially-signed TransferTransaction,
   * returning it as base64 serialized bytes.
   *
   * @param requirements - Chosen payment requirements
   * @returns Base64 transaction
   */
  createPartiallySignedTransferTransaction(requirements: PaymentRequirements): Promise<string>;
};

/**
 * Optional account resolution result for alias policy checks.
 */
export type HederaAccountResolution = {
  exists: boolean;
  isAlias: boolean;
};

/**
 * Minimal facilitator signer interface for Hedera verification + settlement.
 */
export type FacilitatorHederaSigner = {
  /**
   * Get all fee payer account ids managed by facilitator.
   */
  getAddresses(): readonly string[];

  /**
   * Add fee payer signature and submit transaction.
   *
   * @param transactionBase64 - Base64 transaction payload
   * @param feePayer - Fee payer account
   * @param network - CAIP-2 network
   * @returns Settlement metadata
   */
  signAndSubmitTransaction(
    transactionBase64: string,
    feePayer: string,
    network: string,
  ): Promise<{ transactionId: string }>;

  /**
   * Optional replay-check hook.
   *
   * @param transactionId - Hedera transaction id
   * @returns True if transaction has already been seen/submitted
   */
  hasSeenTransaction?(transactionId: string): Promise<boolean>;

  /**
   * Optional replay-marking hook.
   *
   * @param transactionId - Hedera transaction id
   */
  markTransactionSeen?(transactionId: string): Promise<void>;

  /**
   * Optional account resolution hook (used for alias policy).
   *
   * @param accountIdOrAlias - payTo field value
   * @param network - CAIP-2 network
   * @returns Resolution status
   */
  resolveAccount?(accountIdOrAlias: string, network: string): Promise<HederaAccountResolution>;
};

/**
 * Base signer contract used to build a facilitator signer with
 * default replay-protection behavior.
 */
export type FacilitatorHederaSignerBase = Omit<
  FacilitatorHederaSigner,
  "hasSeenTransaction" | "markTransactionSeen"
>;

/**
 * Optional adapter configuration for facilitator signer helper.
 */
export type FacilitatorHederaSignerAdapterConfig = {
  /**
   * Replay dedupe window in milliseconds.
   *
   * @default 5 minutes
   */
  replayWindowMs?: number;
};

/**
 * Optional configuration for the default client signer helper.
 */
export type HederaClientSignerConfig = {
  /**
   * Optional explicit network.
   * If omitted, defaults to testnet.
   */
  network?: string;
  /**
   * Optional custom node endpoint.
   * Useful for private Hedera environments.
   */
  nodeUrl?: string;
};

/**
 * Identity helper for explicit client signer typing.
 *
 * @param signer - Client signer
 * @returns Same signer
 */
export function toClientHederaSigner(signer: ClientHederaSigner): ClientHederaSigner {
  return signer;
}

/**
 * Creates a default SDK-backed client signer from account credentials.
 *
 * @param accountId - Hedera account id of the payer
 * @param privateKey - Private key string accepted by Hedera SDK
 * @param config - Optional client configuration
 * @returns Client signer implementation
 */
export function createClientHederaSigner(
  accountId: string,
  privateKey: string,
  config: HederaClientSignerConfig = {},
): ClientHederaSigner {
  const normalizedNetwork = normalizeHederaNetwork(config.network ?? "hedera:testnet");
  const parsedAccountId = AccountId.fromString(accountId);
  const parsedPrivateKey = PrivateKey.fromString(privateKey);
  const client = createHederaClient(normalizedNetwork, config.nodeUrl);

  return {
    accountId: parsedAccountId.toString(),
    createPartiallySignedTransferTransaction: async (
      requirements: PaymentRequirements,
    ): Promise<string> => {
      normalizeHederaNetwork(requirements.network);
      const feePayer = requirements.extra?.feePayer;
      if (typeof feePayer !== "string") {
        throw new Error("feePayer is required in paymentRequirements.extra");
      }
      const amount = BigInt(requirements.amount);
      if (amount <= 0n) {
        throw new Error("amount must be greater than zero");
      }

      const payTo = AccountId.fromString(requirements.payTo);
      const tx = new TransferTransaction();
      if (isHbarAsset(requirements.asset)) {
        tx.addHbarTransfer(parsedAccountId, Hbar.fromTinybars((-amount).toString()));
        tx.addHbarTransfer(payTo, Hbar.fromTinybars(amount.toString()));
      } else {
        const tokenId = TokenId.fromString(requirements.asset);
        tx.addTokenTransfer(tokenId, parsedAccountId, -amount);
        tx.addTokenTransfer(tokenId, payTo, amount);
      }

      tx.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)));
      tx.setTransactionMemo(`x402:${Date.now().toString(36)}`);
      await tx.freezeWith(client);
      const signed = await tx.sign(parsedPrivateKey);
      return Buffer.from(signed.toBytes()).toString("base64");
    },
  };
}

/**
 * Creates a facilitator signer with in-memory replay tracking.
 * This mirrors the convenience helpers provided by other mechanisms.
 *
 * @param signer - Base facilitator signer implementation
 * @param config - Optional adapter configuration
 * @returns Facilitator signer with replay hooks
 */
export function toFacilitatorHederaSigner(
  signer: FacilitatorHederaSignerBase,
  config: FacilitatorHederaSignerAdapterConfig = {},
): FacilitatorHederaSigner {
  const replayWindowMs = config.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;
  const seenTransactions = new Map<string, number>();

  const pruneSeenTransactions = (now: number): void => {
    for (const [txId, seenAt] of seenTransactions.entries()) {
      if (now - seenAt > replayWindowMs) {
        seenTransactions.delete(txId);
      }
    }
  };

  return {
    ...signer,
    hasSeenTransaction: async (transactionId: string): Promise<boolean> => {
      const now = Date.now();
      pruneSeenTransactions(now);
      return seenTransactions.has(transactionId);
    },
    markTransactionSeen: async (transactionId: string): Promise<void> => {
      const now = Date.now();
      pruneSeenTransactions(now);
      seenTransactions.set(transactionId, now);
    },
  };
}

/**
 * Creates a Hedera SDK client for a CAIP-2 network.
 *
 * @param network - Hedera network identifier
 * @param nodeUrl - Optional custom node URL
 * @returns Hedera SDK client
 */
function createHederaClient(network: string, nodeUrl?: string): Client {
  if (nodeUrl) {
    // A custom endpoint is mapped to account 0.0.3 by default.
    // This can be overridden by constructing your own ClientHederaSigner.
    return Client.forNetwork({ [nodeUrl]: AccountId.fromString("0.0.3") });
  }
  if (network === "hedera:mainnet") {
    return Client.forMainnet();
  }
  return Client.forTestnet();
}
