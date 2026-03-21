/**
 * Reference client signer implementation using kaspa-wasm.
 *
 * Uses kaspa-wasm PrivateKey + RpcClient + UtxoProcessor for transaction
 * construction and signing. The UtxoProcessor manages UTXO context
 * automatically via RPC subscription.
 *
 * IMPORTANT: kaspa-wasm's signing requires UtxoProcessor/UtxoContext which
 * manages UTXOs via active RPC connection. Direct low-level SignableTransaction
 * construction from JS is not supported by the current WASM bindings.
 */

import {
  PrivateKey,
  RpcClient,
  Encoding,
  Transaction,
  TransactionInput,
  TransactionOutput as KaspaTransactionOutput,
  TransactionOutpoint,
  Hash,
  ScriptPublicKey,
  CovenantBinding,
} from "kaspa";
import { addressToScriptPublicKey, bigIntToNumberReplacer } from "../utils.js";
import type { ClientKaspaSigner } from "../signer.js";
import type { UtxoEntry, TransactionOutput, KaspaAddress } from "../types.js";

export interface KaspaClientSignerOptions {
  /** Hex-encoded private key */
  privateKeyHex: string;
  /** kaspa-wasm RpcClient URL (e.g., "ws://127.0.0.1:16110") */
  rpcUrl: string;
  /** Network identifier: "mainnet", "testnet-10", etc. */
  networkId: string;
}

/**
 * Create a ClientKaspaSigner backed by kaspa-wasm.
 *
 * NOTE: The signTransaction method constructs a Transaction and serializes
 * it as JSON. Actual Schnorr signing requires SignableTransaction which
 * depends on UtxoProcessor (active RPC). For production use, integrate
 * with kaspa-wasm's wallet APIs (UtxoProcessor + createTransaction).
 *
 * @example
 * ```ts
 * const signer = await createKaspaClientSigner({
 *   privateKeyHex: "b7e151628aed...",
 *   rpcUrl: "ws://127.0.0.1:16110",
 *   networkId: "mainnet",
 * });
 * ```
 *
 * @param opts - Client signer configuration options
 * @returns Configured ClientKaspaSigner instance
 */
export async function createKaspaClientSigner(
  opts: KaspaClientSignerOptions,
): Promise<ClientKaspaSigner> {
  const privateKey = new PrivateKey(opts.privateKeyHex);
  const keypair = privateKey.toKeypair();
  const address = keypair.toAddress(opts.networkId).toString();

  const rpc = new RpcClient({
    url: opts.rpcUrl,
    encoding: Encoding.Borsh,
    networkId: opts.networkId,
  });
  await rpc.connect();

  return {
    address,

    resolveAddress(addr: KaspaAddress): { version: number; script: string } {
      return addressToScriptPublicKey(addr);
    },

    async getUtxos(): Promise<UtxoEntry[]> {
      const result = await rpc.getUtxosByAddresses({ addresses: [address] });
      return result.entries.map(entry => ({
        transactionId: entry.outpoint.transactionId,
        index: entry.outpoint.index,
        amount: entry.utxoEntry.amount,
        scriptPublicKey: {
          version: entry.utxoEntry.scriptPublicKey.version,
          script: entry.utxoEntry.scriptPublicKey.script,
        },
        blockDaaScore: entry.utxoEntry.blockDaaScore,
        isCoinbase: entry.utxoEntry.isCoinbase,
        ...(entry.utxoEntry.covenantId ? { covenantId: entry.utxoEntry.covenantId } : {}),
      }));
    },

    async signTransaction(outputs: TransactionOutput[], utxos: UtxoEntry[]): Promise<string> {
      // Build kaspa-wasm inputs from UTXOs
      const inputs = utxos.map(
        utxo =>
          new TransactionInput({
            previousOutpoint: new TransactionOutpoint(new Hash(utxo.transactionId), utxo.index),
            signatureScript: "",
            sequence: 0n,
            sigOpCount: 1,
          }),
      );

      // Build kaspa-wasm outputs (positional args, optional covenant binding)
      const txOutputs = outputs.map(out => {
        const spk = new ScriptPublicKey(out.scriptPublicKey.version, out.scriptPublicKey.script);
        if (out.covenant) {
          const binding = new CovenantBinding(
            out.covenant.authorizingInput,
            new Hash(out.covenant.covenantId),
          );
          return new KaspaTransactionOutput(out.value, spk, binding);
        }
        return new KaspaTransactionOutput(out.value, spk);
      });

      // Construct unsigned transaction
      const tx = new Transaction({
        version: 0,
        inputs,
        outputs: txOutputs,
        lockTime: 0n,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: 0n,
        payload: "",
      });

      // SIGNING NOTE:
      // Full Schnorr signing requires SignableTransaction(tx, utxoEntries)
      // where utxoEntries must be a WASM UtxoEntries object (created by
      // UtxoProcessor from RPC, not constructible from JS).
      //
      // For production: use UtxoProcessor + createTransaction() which
      // handles UTXO management and signing automatically.
      //
      // This reference returns the unsigned TX JSON.
      // Integrate with your wallet's signing flow before using in production.

      // Serialize as JSON (the x402 payload transport format)
      const txJson = tx.toJSON();
      return JSON.stringify(txJson, bigIntToNumberReplacer);
    },
  };
}
