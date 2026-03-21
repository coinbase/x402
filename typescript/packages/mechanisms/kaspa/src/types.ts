/**
 * Kaspa-specific types for x402 payment protocol.
 *
 * Kaspa uses a UTXO model with Schnorr signatures.
 * The payment payload is a signed Kaspa transaction.
 *
 * kaspa-wasm API notes:
 *   - TransactionOutpoint requires Hash instance (not string)
 *   - TransactionOutput takes positional args: (value: bigint, spk: ScriptPublicKey)
 *   - ScriptPublicKey constructor: (version: number, scriptHex: string)
 *   - P2PK script format: "20" + xOnlyPubKey + "ac"
 *   - Address.payload is the bech32 payload (not hex)
 *   - signMessage returns string directly (not {signature: string})
 */

/** CAIP-2 network identifiers for Kaspa */
export type KaspaNetwork = "kaspa:mainnet" | "kaspa:testnet" | "kaspa:devnet" | "kaspa:simnet";

/** A Kaspa address (Bech32-encoded, e.g., "kaspa:qr0lr4ml...") */
export type KaspaAddress = string;

/** A hex-encoded 32-byte transaction ID */
export type TransactionId = string;

/**
 * UTXO reference — identifies an unspent output to be consumed.
 * Maps to kaspa-wasm UtxoEntry.
 */
export type UtxoEntry = {
  transactionId: TransactionId;
  index: number;
  amount: bigint; // sompi (1 KAS = 100_000_000 sompi)
  scriptPublicKey: {
    version: number;
    script: string; // hex-encoded script
  };
  blockDaaScore: bigint;
  isCoinbase: boolean;
  /** Covenant token ID (64-char hex). Absent for native KAS UTXOs. */
  covenantId?: string;
};

/**
 * Transaction output — defines where funds go.
 * kaspa-wasm: new TransactionOutput(value, scriptPublicKey)
 *   where scriptPublicKey = new ScriptPublicKey(version, scriptHex)
 */
export type TransactionOutput = {
  value: bigint; // sompi
  scriptPublicKey: {
    version: number;
    script: string; // hex-encoded script
  };
  /** Covenant binding for token outputs. Absent for native KAS outputs. */
  covenant?: {
    authorizingInput: number;
    covenantId: string;
  };
};

/**
 * The x402 payment payload for Kaspa.
 * Contains a fully signed Kaspa transaction ready for broadcast.
 */
export type ExactKaspaPayloadV2 = {
  /** Hex-encoded signed Kaspa transaction */
  transaction: string;
};

/**
 * Parsed transaction data returned by FacilitatorKaspaSigner.parseTransaction().
 * Used by the facilitator to verify outputs match payment requirements.
 *
 * The facilitator scheme compares output addresses against requirements.payTo
 * using both script hex and bech32 address formats, so signer implementations
 * may return either format in the address field.
 */
export type ParsedTransaction = {
  /**
   * Identifiers for the transaction's funding sources.
   * May be sender addresses (if derivable from signatureScript or UTXO lookup)
   * or input outpoint transaction IDs as a fallback identifier.
   */
  inputAddresses: string[];
  /** Decoded transaction outputs */
  outputs: {
    /** Output destination: script hex (e.g., "20{pubkey}ac") or Kaspa address */
    address: string;
    amount: bigint; // sompi
    /** Covenant token ID if this output carries a token. Absent for native KAS. */
    covenantId?: string;
  }[];
};

/**
 * Extra data included in PaymentRequirements for Kaspa.
 */
export type KaspaPaymentExtra = {
  /** Minimum fee in sompi (optional, client can choose higher) */
  minFee?: string;
};
