/**
 * Reference facilitator signer implementation using kaspa-wasm.
 *
 * Wraps a kaspa-wasm RpcClient to implement FacilitatorKaspaSigner.
 * The facilitator does NOT hold private keys — it only verifies and broadcasts.
 *
 * Transaction format: JSON string from Transaction.toJSON() with BigInt→Number.
 * See utils.ts SerializedTransaction for the exact format.
 */

import {
  RpcClient,
  Encoding,
  Transaction,
  TransactionInput,
  TransactionOutput,
  TransactionOutpoint,
  Hash,
  ScriptPublicKey,
  CovenantBinding,
} from "kaspa";
import type { FacilitatorKaspaSigner } from "../signer.js";
import type { KaspaAddress, TransactionId, UtxoEntry, ParsedTransaction } from "../types.js";
import type { SerializedTransaction } from "../utils.js";

export interface KaspaFacilitatorSignerOptions {
  /** kaspa-wasm RpcClient URL (e.g., "ws://127.0.0.1:16110") */
  rpcUrl: string;
  /** Network identifier: "mainnet", "testnet-10", etc. */
  networkId: string;
  /** Kaspa addresses the facilitator manages (payTo addresses) */
  addresses: KaspaAddress[];
  /** Confirmation poll interval in ms (default: 500) */
  confirmationPollMs?: number;
}

/**
 * Reconstruct a kaspa-wasm Transaction from the serialized JSON format.
 *
 * @param txData - Serialized transaction data
 * @returns Reconstructed kaspa-wasm Transaction instance
 */
function reconstructTransaction(txData: SerializedTransaction): Transaction {
  const inputs = txData.inputs.map(
    i =>
      new TransactionInput({
        previousOutpoint: new TransactionOutpoint(
          new Hash(i.previousOutpoint.transactionId),
          i.previousOutpoint.index,
        ),
        signatureScript: i.signatureScript,
        sequence: BigInt(i.sequence),
        sigOpCount: i.sigOpCount,
      }),
  );

  const outputs = txData.outputs.map(o => {
    const spk = new ScriptPublicKey(o.scriptPublicKey.version, o.scriptPublicKey.script);
    if (o.covenant) {
      const binding = new CovenantBinding(
        o.covenant.authorizingInput,
        new Hash(o.covenant.covenantId),
      );
      return new TransactionOutput(BigInt(o.value), spk, binding);
    }
    return new TransactionOutput(BigInt(o.value), spk);
  });

  return new Transaction({
    version: txData.version,
    inputs,
    outputs,
    lockTime: BigInt(txData.lockTime),
    subnetworkId: txData.subnetworkId,
    gas: BigInt(txData.gas),
    payload: txData.payload,
  });
}

/**
 * Reverse a P2PK script ("20" + pubkeyHex + "ac") to a Kaspa address.
 * Returns the hex-encoded script as-is if not a recognized format.
 *
 * @param scriptPublicKey - Script public key with version and hex script
 * @param scriptPublicKey.version - Script version number
 * @param scriptPublicKey.script - Hex-encoded script bytes
 * @returns Address hint as script hex
 */
function scriptToAddressHint(scriptPublicKey: { version: number; script: string }): string {
  // For now, return the script hex as an address hint.
  // Full implementation requires bech32 encoding which is the
  // reverse of addressToScriptPublicKey.
  // The facilitator can match scripts directly without converting
  // back to addresses.
  return scriptPublicKey.script;
}

/**
 * Create a FacilitatorKaspaSigner backed by kaspa-wasm RpcClient.
 *
 * @example
 * ```ts
 * const signer = await createKaspaFacilitatorSigner({
 *   rpcUrl: "ws://127.0.0.1:16110",
 *   networkId: "mainnet",
 *   addresses: ["kaspa:qr0lr4ml..."],
 * });
 * ```
 *
 * @param opts - Facilitator signer configuration options
 * @returns Configured FacilitatorKaspaSigner instance
 */
export async function createKaspaFacilitatorSigner(
  opts: KaspaFacilitatorSignerOptions,
): Promise<FacilitatorKaspaSigner> {
  const rpc = new RpcClient({
    url: opts.rpcUrl,
    encoding: Encoding.Borsh,
    networkId: opts.networkId,
  });
  await rpc.connect();

  const addresses = opts.addresses;
  const pollMs = opts.confirmationPollMs ?? 500;

  return {
    getAddresses(): readonly KaspaAddress[] {
      return addresses;
    },

    async parseTransaction(transaction: string): Promise<ParsedTransaction> {
      const txData = JSON.parse(transaction) as SerializedTransaction;

      // Extract output addresses from scriptPublicKey
      const outputs = txData.outputs.map(o => ({
        address: scriptToAddressHint(o.scriptPublicKey),
        amount: BigInt(o.value),
        ...(o.covenant ? { covenantId: o.covenant.covenantId } : {}),
      }));

      // Extract input "addresses" from the UTXO scripts
      // In a full implementation, look up the input UTXOs by outpoint
      // to get the sender's scriptPublicKey/address.
      const inputAddresses: string[] = [];
      for (const input of txData.inputs) {
        // The signatureScript contains the signature + pubkey for P2PK inputs.
        // For P2PK, the signature script is: <sig><pubkey>
        // The pubkey can be extracted to derive the sender address.
        // For simplicity, we mark inputs by their outpoint.
        inputAddresses.push(input.previousOutpoint.transactionId);
      }

      return { inputAddresses, outputs };
    },

    async verifyTransaction(transaction: string): Promise<boolean> {
      try {
        // Parse the transaction JSON
        const txData = JSON.parse(transaction) as SerializedTransaction;

        // Reconstruct the kaspa-wasm Transaction object
        const tx = reconstructTransaction(txData);

        // Structural validation: TX must have valid structure
        if (!tx.id || tx.inputs.length === 0 || tx.outputs.length === 0) {
          return false;
        }

        // Signature validation: check that signatureScript is non-empty
        // (indicates the TX was actually signed)
        for (const input of txData.inputs) {
          if (!input.signatureScript || input.signatureScript.length === 0) {
            return false;
          }
        }

        // Full Schnorr signature verification would require:
        // 1. Computing the sighash for each input (using UTXO data)
        // 2. Extracting the public key from signatureScript
        // 3. Verifying the Schnorr signature over the sighash
        // The Kaspa node also validates on submission (submitTransaction).

        return true;
      } catch {
        return false;
      }
    },

    async submitTransaction(transaction: string): Promise<TransactionId> {
      const txData = JSON.parse(transaction) as SerializedTransaction;
      const tx = reconstructTransaction(txData);

      const result = await rpc.submitTransaction(tx);
      return result.transactionId;
    },

    async waitForConfirmation(_transactionId: TransactionId, timeoutMs?: number): Promise<boolean> {
      const timeout = timeoutMs ?? 30_000;

      // At 10 BPS, Kaspa confirms transactions in seconds.
      // Simple strategy: wait a fixed duration then assume confirmed.
      // Production: use RPC subscriptions for block notifications and
      // check if the TX appears in the virtual selected parent chain.
      await new Promise(r => setTimeout(r, Math.min(pollMs * 6, timeout)));
      return true;
    },

    async getBalance(address: KaspaAddress): Promise<bigint> {
      const result = await rpc.getBalanceByAddress({ address });
      return result.balance;
    },

    async getUtxos(address: KaspaAddress): Promise<UtxoEntry[]> {
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
  };
}
