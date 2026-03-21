/**
 * Minimal type declarations for kaspa-wasm (rusty-kaspa master / v1.1.0+).
 *
 * These cover only the APIs used by the reference signer implementations.
 * Targets the current master branch API (object-based RpcClient constructor).
 *
 * Source of truth: https://github.com/kaspanet/rusty-kaspa/tree/master/wasm
 * API docs: https://kaspa.aspectron.org/docs/
 *
 * NOTE: The npm "kaspa" package v0.13.0 uses an OLDER API with positional
 * RpcClient constructor args. These declarations target the master branch.
 * Build from source or use nightly builds from kaspa.aspectron.org.
 */
declare module "kaspa" {
  /** Kaspa private key for signing transactions. */
  export class PrivateKey {
    /**
     * Create a PrivateKey from hex string.
     *
     * @param hex - Hex-encoded private key
     */
    constructor(hex: string);

    /**
     * Serialize the private key to hex string.
     *
     * @returns Hex-encoded private key
     */
    toString(): string;

    /**
     * Derive the keypair from this private key.
     *
     * @returns The corresponding keypair
     */
    toKeypair(): Keypair;
  }

  /** Public/private keypair derived from a PrivateKey. */
  export class Keypair {
    /** Compressed public key hex. */
    readonly publicKey: string;
    /** X-only public key hex (used in Schnorr signatures). */
    readonly xOnlyPublicKey: string;

    /**
     * Derive a Kaspa address for the given network.
     *
     * @param network - Network type or identifier
     * @returns The bech32-encoded Kaspa address
     */
    toAddress(network: NetworkType | NetworkId | string): Address;
  }

  /** Bech32-encoded Kaspa address. */
  export class Address {
    /**
     * Parse a Kaspa address string.
     *
     * @param address - Bech32-encoded Kaspa address
     */
    constructor(address: string);

    /** Network prefix (e.g., "kaspa", "kaspatest"). */
    readonly prefix: string;
    /** Bech32 payload (without prefix). */
    readonly payload: string;
    /** Address version string. */
    readonly version: string;

    /**
     * Serialize to full address string with prefix.
     *
     * @returns Full Kaspa address string
     */
    toString(): string;
  }

  /** 32-byte hash value used for transaction IDs and outpoints. */
  export class Hash {
    /**
     * Create a Hash from hex string.
     *
     * @param hex - Hex-encoded 32-byte hash
     */
    constructor(hex: string);

    /**
     * Serialize to hex string.
     *
     * @returns Hex-encoded hash
     */
    toString(): string;
  }

  /** Script public key defining output spend conditions. */
  export class ScriptPublicKey {
    /**
     * Create a ScriptPublicKey.
     *
     * @param version - Script version (0 for standard)
     * @param script - Hex-encoded script bytes
     */
    constructor(version: number, script: string);

    /** Script version. */
    readonly version: number;
    /** Hex-encoded script. */
    readonly script: string;
  }

  /** Reference to a specific output in a previous transaction. */
  export class TransactionOutpoint {
    /**
     * Create a TransactionOutpoint.
     *
     * @param transactionId - Hash of the referenced transaction
     * @param index - Output index within the referenced transaction
     */
    constructor(transactionId: Hash, index: number);

    /** Referenced transaction ID. */
    readonly transactionId: string;
    /** Output index. */
    readonly index: number;
  }

  /** Transaction input consuming a UTXO. */
  export class TransactionInput {
    /**
     * Create a TransactionInput.
     *
     * @param params - Input parameters
     */
    constructor(params: {
      previousOutpoint: TransactionOutpoint;
      signatureScript: string;
      sequence: bigint;
      sigOpCount: number;
    });

    /**
     * Serialize to JSON.
     *
     * @returns JSON representation
     */
    toJSON(): Record<string, unknown>;
  }

  /** Covenant binding tying an output to a covenant token via authorizing input. */
  export class CovenantBinding {
    /**
     * Create a CovenantBinding.
     *
     * @param authorizingInput - Index of the authorizing input
     * @param covenantId - Hash of the covenant token ID
     */
    constructor(authorizingInput: number, covenantId: Hash);
  }

  /** Transaction output defining where funds are sent. */
  export class TransactionOutput {
    /**
     * Create a TransactionOutput.
     *
     * @param value - Amount in sompi
     * @param scriptPublicKey - Spend conditions
     * @param covenant - Optional covenant binding for token outputs
     */
    constructor(value: bigint, scriptPublicKey: ScriptPublicKey, covenant?: CovenantBinding);

    /** Output amount in sompi. */
    readonly value: bigint;
    /** Output script. */
    readonly scriptPublicKey: ScriptPublicKey;

    /**
     * Serialize to JSON.
     *
     * @returns JSON representation
     */
    toJSON(): Record<string, unknown>;
  }

  /** Kaspa transaction containing inputs, outputs, and metadata. */
  export class Transaction {
    /**
     * Create a Transaction.
     *
     * @param params - Transaction parameters
     */
    constructor(params: {
      version: number;
      inputs: TransactionInput[];
      outputs: TransactionOutput[];
      lockTime: bigint;
      subnetworkId: string;
      gas: bigint;
      payload: string;
    });

    /** Transaction ID. */
    readonly id: string;
    /** Transaction inputs. */
    readonly inputs: TransactionInput[];
    /** Transaction outputs. */
    readonly outputs: TransactionOutput[];

    /**
     * Serialize to JSON.
     *
     * @returns JSON representation
     */
    toJSON(): Record<string, unknown>;

    /**
     * Compute and finalize the transaction hash.
     *
     * @returns The transaction hash
     */
    finalize(): Hash;
  }

  /** Transaction wrapper that includes UTXO context for signing. */
  export class SignableTransaction {
    /**
     * Create a SignableTransaction.
     *
     * @param tx - The transaction to sign
     * @param entries - UTXO entries for the transaction inputs
     */
    constructor(tx: Transaction, entries: UtxoEntries);

    /**
     * Serialize to JSON string.
     *
     * @returns JSON string
     */
    toJSON(): string;

    /**
     * Deserialize from JSON string.
     *
     * @param json - JSON string
     * @returns Deserialized SignableTransaction
     */
    static fromJSON(json: string): SignableTransaction;
  }

  /** Collection of UTXO entries for transaction signing. */
  export class UtxoEntries {
    /**
     * Create UtxoEntries.
     *
     * @param entries - Raw UTXO entry data
     */
    constructor(entries: unknown);
  }

  /** RPC encoding format. */
  export enum Encoding {
    Borsh = 0,
    SerdeJson = 1,
  }

  /** Kaspa network type. */
  export enum NetworkType {
    Mainnet = 0,
    Testnet = 1,
    Devnet = 2,
    Simnet = 3,
  }

  /** Kaspa network identifier. */
  export class NetworkId {
    /**
     * Create a NetworkId.
     *
     * @param value - Network identifier string
     */
    constructor(value: string);

    /**
     * Serialize to string.
     *
     * @returns Network identifier string
     */
    toString(): string;
  }

  /** Public node resolver for automatic endpoint discovery. */
  export class Resolver {
    /**
     * Create a Resolver.
     *
     * @param urls - Optional list of resolver URLs
     */
    constructor(urls?: string[]);
  }

  /**
   * RPC client configuration (master branch API).
   * All fields are optional — at minimum provide url or resolver + networkId.
   */
  export interface IRpcConfig {
    /** Public node resolver (if set, url is ignored). */
    resolver?: Resolver;
    /** WebSocket RPC URL (e.g., "ws://127.0.0.1:16110"). */
    url?: string;
    /** RPC encoding: Borsh (default) or SerdeJson. */
    encoding?: Encoding;
    /** Network identifier: "mainnet", "testnet-10", etc. */
    networkId?: NetworkId | string;
  }

  /** WebSocket RPC client for communicating with a Kaspa node. */
  export class RpcClient {
    /**
     * Create an RpcClient.
     *
     * @param config - RPC configuration
     */
    constructor(config?: IRpcConfig);

    /**
     * Connect to the RPC endpoint.
     *
     * @param options - Optional connection options
     * @returns Resolves when connected
     */
    connect(options?: unknown): Promise<void>;

    /**
     * Disconnect from the RPC endpoint.
     *
     * @returns Resolves when disconnected
     */
    disconnect(): Promise<void>;

    /** RPC endpoint URL. */
    readonly url: string | undefined;
    /** Whether the connection is open. */
    readonly open: boolean;

    /**
     * Get UTXOs for the given addresses.
     *
     * @param params - Object containing addresses array
     * @returns UTXO entries for the addresses
     */
    getUtxosByAddresses(params: { addresses: string[] }): Promise<UtxosByAddressesResponse>;

    /**
     * Submit a signed transaction to the network.
     *
     * @param transaction - Signed transaction to submit
     * @param allowOrphan - Whether to allow orphan transactions
     * @returns Object containing the transaction ID
     */
    submitTransaction(
      transaction: Transaction | Record<string, unknown>,
      allowOrphan?: boolean,
    ): Promise<{ transactionId: string }>;

    /**
     * Get the balance for an address.
     *
     * @param params - Object containing the address
     * @returns Object containing the balance in sompi
     */
    getBalanceByAddress(params: { address: string }): Promise<{ balance: bigint }>;
  }

  /**
   * Sign a transaction with the given private keys.
   *
   * @param mtx - The signable transaction
   * @param privateKeys - Array of private keys for signing
   * @param verifyScripts - Whether to verify scripts after signing
   * @returns The signed transaction
   */
  export function signTransaction(
    mtx: SignableTransaction,
    privateKeys: PrivateKey[],
    verifyScripts: boolean,
  ): SignableTransaction;

  /**
   * Sign a message with a private key.
   *
   * @param params - Object containing message and privateKey
   * @param params.message - The message to sign
   * @param params.privateKey - Hex-encoded private key
   * @returns The hex-encoded signature
   */
  export function signMessage(params: { message: string; privateKey: string }): string;

  /**
   * Verify a signed message.
   *
   * @param params - Object containing message, signature, and publicKey
   * @param params.message - The signed message
   * @param params.signature - Hex-encoded signature to verify
   * @param params.publicKey - Hex-encoded public key of the signer
   * @returns True if the signature is valid
   */
  export function verifyMessage(params: {
    message: string;
    signature: string;
    publicKey: string;
  }): boolean;

  /**
   * Convert a KAS amount string to sompi.
   *
   * @param kas - Amount in KAS as a string
   * @returns Amount in sompi
   */
  export function kaspaToSompi(kas: string): bigint;

  /** Response from getUtxosByAddresses RPC call. */
  export interface UtxosByAddressesResponse {
    /** UTXO entries. */
    entries: UtxoEntryReference[];
  }

  /** Single UTXO entry reference from RPC response. */
  export interface UtxoEntryReference {
    /** Address that owns this UTXO. */
    address: Address;
    /** Transaction outpoint identifying this UTXO. */
    outpoint: { transactionId: string; index: number };
    /** UTXO details. */
    utxoEntry: {
      /** Amount in sompi. */
      amount: bigint;
      /** Script defining spend conditions. */
      scriptPublicKey: ScriptPublicKey;
      /** DAA score of the block containing this UTXO. */
      blockDaaScore: bigint;
      /** Whether this UTXO is from a coinbase transaction. */
      isCoinbase: boolean;
      /** Covenant token ID (present after Covenants++ HF for token UTXOs). */
      covenantId?: string;
    };
  }
}
