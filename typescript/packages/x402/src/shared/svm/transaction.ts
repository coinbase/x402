import { ExactSvmPayload } from "../../types/verify/x402Specs";
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  KeyPairSigner,
  partiallySignTransaction,
  RpcDevnet,
  SolanaRpcApiDevnet,
  RpcMainnet,
  SolanaRpcApiMainnet,
  Transaction,
  CompiledTransactionMessage,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

/**
 * Given an object with a base64 encoded transaction, decode the
 * base64 encoded transaction into a solana transaction object.
 *
 * @param svmPayload - The SVM payload to decode
 * @returns The decoded transaction
 */
export function decodeTransactionFromPayload(svmPayload: ExactSvmPayload): Transaction {
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
 * Extract the token sender (owner of the source token account)
 * from the TransferChecked instruction.
 *
 * @param transaction - The transaction to extract the token payer from
 * @returns The token payer address as a base58 string
 */
export function getTokenPayerFromTransaction(transaction: Transaction): string {
  const compiled = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  ) as CompiledTransactionMessage;
  const staticAccounts = compiled.staticAccounts ?? [];
  const instructions = compiled.instructions ?? [];

  for (const ix of instructions) {
    const programIndex = ix.programAddressIndex;
    const programAddress = staticAccounts[programIndex].toString();
    if (
      programAddress === TOKEN_PROGRAM_ADDRESS.toString() ||
      programAddress === TOKEN_2022_PROGRAM_ADDRESS.toString()
    ) {
      const accountIndices: number[] = ix.accountIndices ?? [];
      if (accountIndices.length >= 4) {
        // TransferChecked account order: [source, mint, destination, owner, ...]
        const ownerIndex = accountIndices[3];
        const ownerAddress = staticAccounts[ownerIndex].toString();
        if (ownerAddress) return ownerAddress;
      }
    }
  }

  return "";
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
    sigVerify: true,
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
