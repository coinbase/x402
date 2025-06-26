import { encodePayment } from "../../utils/paymentUtils";
import {
  Address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  partiallySignTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  type KeyPairSigner,
} from "@solana/kit";
import { PaymentPayload, PaymentRequirements } from "../../../types/verify";
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
  TransferCheckedInstruction,
} from "@solana-program/token-2022";
import { getRpcClient } from "../../../shared/svm/rpc";

/**
 * Creates and encodes a payment header for the given client and payment requirements.
 *
 * @param client - The signer instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to a base64 encoded payment header string
 */
export async function createPaymentHeader(
  client: KeyPairSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const paymentPayload = await createAndSignPayment(client, x402Version, paymentRequirements);
  return encodePayment(paymentPayload);
}

/**
 * Creates and signs a payment for the given client and payment requirements.
 *
 * @param client - The signer instance used to create and sign the payment tx
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to a payment payload containing a base64 encoded solana token transfer tx
 */
export async function createAndSignPayment(
  client: KeyPairSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const transactionMessage = await createTransferTransactionMessage(client, paymentRequirements);

  const signedTransaction = await partiallySignTransactionMessageWithSigners(transactionMessage);
  const base64EncodedWireTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // return payment payload
  return {
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    x402Version: x402Version,
    payload: {
      transaction: base64EncodedWireTransaction,
    },
  } as PaymentPayload;
}

/**
 * Creates a transfer instruction for the given client and payment requirements.
 *
 * @param client - The signer instance used to create the transfer instruction
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to the transfer instruction
 */
async function createTransferInstruction(
  client: KeyPairSigner,
  paymentRequirements: PaymentRequirements,
): Promise<TransferCheckedInstruction> {
  const { asset, extra, maxAmountRequired: amount, payTo } = paymentRequirements;

  const sourceATA = await findAssociatedTokenPda({
    mint: asset as Address,
    owner: client.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  const destinationATA = await findAssociatedTokenPda({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  return getTransferCheckedInstruction(
    {
      source: sourceATA[0],
      mint: asset as Address,
      destination: destinationATA[0],
      authority: client.address,
      amount: BigInt(amount),
      decimals: Number(extra?.decimals), // TODO: add decimals to extra field of solana payment requirements
    },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
  );
}

/**
 * Creates a transfer transaction message for the given client and payment requirements.
 *
 * @param client - The signer instance used to create the transfer transaction message
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to the transaction message with the transfer instruction
 */
async function createTransferTransactionMessage(
  client: KeyPairSigner,
  paymentRequirements: PaymentRequirements,
) {
  const transferIx = await createTransferInstruction(client, paymentRequirements);
  const rpc = getRpcClient(paymentRequirements.network);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const feePayer = paymentRequirements.extra?.feePayer as Address;

  return pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([transferIx], tx),
  );
}
