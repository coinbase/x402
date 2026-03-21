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
 *
 * @param mtx
 * @param privateKeys
 * @param verifyScripts
 * @param params
 * @param params.message
 * @param params.privateKey
 * @param params.signature
 * @param params.publicKey
 * @param kas
 */
declare module "kaspa" {
  /**
   *
   */
  export class PrivateKey {
    /**
     *
     */
    constructor(hex: string);
    /**
     *
     */
    toString(): string;
    /**
     *
     */
    toKeypair(): Keypair;
  }

  /**
   *
   */
  export class Keypair {
    readonly publicKey: string;
    readonly xOnlyPublicKey: string;
    /**
     *
     */
    toAddress(network: NetworkType | NetworkId | string): Address;
  }

  /**
   *
   */
  export class Address {
    /**
     *
     */
    constructor(address: string);
    readonly prefix: string;
    readonly payload: string;
    readonly version: string;
    /**
     *
     */
    toString(): string;
  }

  /**
   *
   */
  export class Hash {
    /**
     *
     */
    constructor(hex: string);
    /**
     *
     */
    toString(): string;
  }

  /**
   *
   */
  export class ScriptPublicKey {
    /**
     *
     */
    constructor(version: number, script: string);
    readonly version: number;
    readonly script: string;
  }

  /**
   *
   */
  export class TransactionOutpoint {
    /**
     *
     */
    constructor(transactionId: Hash, index: number);
    readonly transactionId: string;
    readonly index: number;
  }

  /**
   *
   */
  export class TransactionInput {
    /**
     *
     */
    constructor(params: {
      previousOutpoint: TransactionOutpoint;
      signatureScript: string;
      sequence: bigint;
      sigOpCount: number;
    });
    /**
     *
     */
    toJSON(): Record<string, unknown>;
  }

  /** Covenant binding: ties an output to a covenant token via authorizing input. */
  export class CovenantBinding {
    /**
     *
     */
    constructor(authorizingInput: number, covenantId: Hash);
  }

  /**
   * Positional args: (value, scriptPublicKey, covenant?)
   * 3rd arg is optional CovenantBinding for token outputs.
   */
  export class TransactionOutput {
    /**
     *
     */
    constructor(value: bigint, scriptPublicKey: ScriptPublicKey, covenant?: CovenantBinding);
    readonly value: bigint;
    readonly scriptPublicKey: ScriptPublicKey;
    /**
     *
     */
    toJSON(): Record<string, unknown>;
  }

  /**
   *
   */
  export class Transaction {
    /**
     *
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
    readonly id: string;
    readonly inputs: TransactionInput[];
    readonly outputs: TransactionOutput[];
    /**
     *
     */
    toJSON(): Record<string, unknown>;
    /**
     *
     */
    finalize(): Hash;
  }

  /**
   *
   */
  export class SignableTransaction {
    /**
     *
     */
    constructor(tx: Transaction, entries: UtxoEntries);
    /**
     *
     */
    toJSON(): string;
    /**
     *
     */
    static fromJSON(json: string): SignableTransaction;
  }

  /**
   *
   */
  export class UtxoEntries {
    /**
     *
     */
    constructor(entries: unknown);
  }

  /** RPC encoding format */
  export enum Encoding {
    Borsh = 0,
    SerdeJson = 1,
  }

  /** Kaspa network type */
  export enum NetworkType {
    Mainnet = 0,
    Testnet = 1,
    Devnet = 2,
    Simnet = 3,
  }

  /**
   *
   */
  export class NetworkId {
    /**
     *
     */
    constructor(value: string);
    /**
     *
     */
    toString(): string;
  }

  /**
   *
   */
  export class Resolver {
    /**
     *
     */
    constructor(urls?: string[]);
  }

  /**
   * RPC client configuration (master branch API).
   * All fields are optional — at minimum provide url or resolver + networkId.
   */
  export interface IRpcConfig {
    /** Public node resolver (if set, url is ignored) */
    resolver?: Resolver;
    /** WebSocket RPC URL (e.g., "ws://127.0.0.1:16110") */
    url?: string;
    /** RPC encoding: Borsh (default) or SerdeJson */
    encoding?: Encoding;
    /** Network identifier: "mainnet", "testnet-10", etc. */
    networkId?: NetworkId | string;
  }

  /**
   *
   */
  export class RpcClient {
    /**
     *
     */
    constructor(config?: IRpcConfig);
    /**
     *
     */
    connect(options?: unknown): Promise<void>;
    /**
     *
     */
    disconnect(): Promise<void>;
    readonly url: string | undefined;
    readonly open: boolean;
    /**
     *
     */
    getUtxosByAddresses(params: { addresses: string[] }): Promise<UtxosByAddressesResponse>;
    /**
     *
     */
    submitTransaction(
      transaction: Transaction | Record<string, unknown>,
      allowOrphan?: boolean,
    ): Promise<{ transactionId: string }>;
    /**
     *
     */
    getBalanceByAddress(params: { address: string }): Promise<{ balance: bigint }>;
  }

  export function signTransaction(
    mtx: SignableTransaction,
    privateKeys: PrivateKey[],
    verifyScripts: boolean,
  ): SignableTransaction;

  export function signMessage(params: { message: string; privateKey: string }): string;

  export function verifyMessage(params: {
    message: string;
    signature: string;
    publicKey: string;
  }): boolean;

  export function kaspaToSompi(kas: string): bigint;

  export interface UtxosByAddressesResponse {
    entries: UtxoEntryReference[];
  }

  export interface UtxoEntryReference {
    address: Address;
    outpoint: { transactionId: string; index: number };
    utxoEntry: {
      amount: bigint;
      scriptPublicKey: ScriptPublicKey;
      blockDaaScore: bigint;
      isCoinbase: boolean;
      /** Covenant token ID (present after Covenants++ HF for token UTXOs). */
      covenantId?: string;
    };
  }
}
