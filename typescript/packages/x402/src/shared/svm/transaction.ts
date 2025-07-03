import { ExactSvmPayload } from "../../types/verify/x402Specs";
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  KeyPairSigner,
  partiallySignTransaction,
  RpcDevnet,
  SolanaRpcApiDevnet,
  RpcMainnet,
  SolanaRpcApiMainnet,
  Transaction,
} from "@solana/kit";

/**
 * Given an object with a base64 encoded transaction, decode the
 * base64 encoded transaction into a solana transaction object.
 *
 * @param svmPayload - The SVM payload to decode
 * @returns The decoded transaction
 */
export function decodeTransaction(svmPayload: ExactSvmPayload): Transaction {
  try {
    const base64Encoder = getBase64Encoder();
    const transactionBytes = base64Encoder.encode(svmPayload.transaction);
    const transactionDecoder = getTransactionDecoder();
    return transactionDecoder.decode(transactionBytes);
  } catch (error) {
    console.error("error", error);
    throw new Error("invalid_exact_svm_payload_transaction");
  }
}

/**
 * Sign and simulate a transaction.
 *
 * @param signer - The signer that will sign the transaction
 * @param transaction - The transaction to sign and simulate
 * @param rpc - The RPC client to use to simulate the transaction
 * @returns The transaction simulation result
 */
export async function signAndSimulateTransaction(
  signer: KeyPairSigner,
  transaction: Transaction,
  rpc: RpcDevnet<SolanaRpcApiDevnet> | RpcMainnet<SolanaRpcApiMainnet>,
) {
  // sign the transaction as the fee payer
  const signedTransaction = await partiallySignTransaction([signer.keyPair], transaction);

  // serialize the signed transaction into a base64 encoded wire transaction
  const base64EncodedTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // simulate the transaction and verify that it will succeed
  const simulateTxConfig = {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
    encoding: "base64",
    accounts: undefined,
    innerInstructions: undefined,
    minContextSlot: undefined,
  } as const;

  const simulateResult = await rpc
    .simulateTransaction(base64EncodedTransaction, simulateTxConfig)
    .send();

  return simulateResult;
}
