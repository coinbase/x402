/**
 * XRP types for x402 payment protocol
 */

/**
 * XRP network identifiers in CAIP-2 format
 */
export type XrpNetwork = "xrp:mainnet" | "xrp:testnet" | "xrp:devnet" | `xrp:${string}`;

/**
 * XRP transaction type for Payments
 */
export type TransactionType = "Payment";

/**
 * XRP Memo structure
 */
export interface XrpMemo {
  Memo: {
    MemoType?: string;
    MemoData?: string;
    MemoFormat?: string;
  };
}

/**
 * XRP Payment transaction structure
 */
export interface XrpPaymentTransaction {
  TransactionType: "Payment";
  Account: string;
  Destination: string;
  Amount: string; // Drops
  Fee: string; // Drops
  Sequence: number;
  LastLedgerSequence: number;
  DestinationTag?: number;
  Memos?: XrpMemo[];
  SigningPubKey?: string;
  TxnSignature?: string;
}

/**
 * XRP exact scheme payload for x402 v2
 */
export interface ExactXrpPayloadV2 {
  signedTransaction: string; // Hex-encoded signed transaction blob
  transaction: XrpPaymentTransaction;
}

/**
 * XRP exact scheme payload for x402 v1
 * Same as v2 for XRP
 */
export type ExactXrpPayloadV1 = ExactXrpPayloadV2;

/**
 * Client signer interface for XRP
 * Used to sign payment transactions
 */
export interface ClientXrpSigner {
  /** The XRP address (r... format) */
  readonly address: string;

  /**
   * Sign a payment transaction
   * @param transaction - The payment transaction to sign
   * @returns The signed transaction blob as hex string
   */
  signPayment(transaction: Omit<XrpPaymentTransaction, "TxnSignature" | "SigningPubKey">): Promise<string>;

  /**
   * Get the next sequence number for this account
   * @param client - XRPL client
   * @returns The next sequence number
   */
  getNextSequence(client: unknown): Promise<number>;
}

/**
 * Facilitator signer interface for XRP
 * Used to verify and submit transactions
 */
export interface FacilitatorXrpSigner {
  /**
   * Get all addresses this facilitator can use
   */
  getAddresses(): readonly string[];

  /**
   * Submit a signed transaction to the XRPL
   * @param signedTransaction - The signed transaction blob
   * @returns The transaction hash
   */
  submitTransaction(signedTransaction: string): Promise<{ hash: string }>;

  /**
   * Wait for transaction validation
   * @param hash - The transaction hash
   * @returns The validation result
   */
  waitForValidation(hash: string): Promise<{ validated: boolean; result: string; metadata?: unknown }>;

  /**
   * Verify a transaction signature
   * @param transaction - The transaction
   * @param signedBlob - The signed transaction blob
   * @returns Whether the signature is valid
   */
  verifySignature(transaction: XrpPaymentTransaction, signedBlob: string): Promise<boolean>;

  /**
   * Get account info
   * @param address - The account address
   * @returns Account info including balance and sequence
   */
  getAccountInfo(address: string): Promise<{
    balance: string;
    sequence: number;
    ownerCount: number;
  }>;

  /**
   * Get current ledger info
   * @returns Current ledger index
   */
  getLedgerIndex(): Promise<number>;

  /**
   * Get current fee
   * @returns Current fee in drops
   */
  getFee(): Promise<string>;
}

/**
 * XRP-specific extra data for payment requirements
 */
export interface XrpPaymentExtra {
  /** Destination tag for recipient identification */
  destinationTag?: number;
  /** Reference data stored in memo */
  memo?: {
    memoType: string;
    memoData: string;
  };
}

/**
 * Type guard to check if a payload is a valid XRP payload
 */
export function isXrpPayload(payload: unknown): payload is ExactXrpPayloadV2 {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "signedTransaction" in payload &&
    typeof (payload as Record<string, unknown>).signedTransaction === "string" &&
    "transaction" in payload &&
    typeof (payload as Record<string, unknown>).transaction === "object" &&
    (payload as Record<string, unknown>).transaction !== null &&
    "TransactionType" in ((payload as Record<string, unknown>).transaction as Record<string, unknown>) &&
    ((payload as Record<string, unknown>).transaction as Record<string, unknown>).TransactionType === "Payment"
  );
}
