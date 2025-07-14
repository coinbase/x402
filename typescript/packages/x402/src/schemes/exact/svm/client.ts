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
  fetchMint as fetchMintToken2022,
  findAssociatedTokenPda as findAssociatedTokenPdaToken2022,
  getTransferCheckedInstruction as getTransferCheckedInstructionToken2022,
  TOKEN_2022_PROGRAM_ADDRESS,
  TransferCheckedInstruction as TransferCheckedInstructionToken2022,
} from "@solana-program/token-2022";
import {
  findAssociatedTokenPda as findAssociatedTokenPdaToken,
  getTransferCheckedInstruction as getTransferCheckedInstructionToken,
  TOKEN_PROGRAM_ADDRESS,
  TransferCheckedInstruction as TransferCheckedInstructionToken,
} from "@solana-program/token";
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

/**
 * Creates a transfer instruction for the given client and payment requirements.
 * This function will determine which transfer instruction to create
 * based on the program that created the token (token-2022 or token).
 *
 * @param client - The signer instance used to create the transfer instruction
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to the transfer instruction
 */
async function createTransferInstruction(
  client: KeyPairSigner,
  paymentRequirements: PaymentRequirements,
): Promise<TransferCheckedInstructionToken2022 | TransferCheckedInstructionToken> {
  const { asset } = paymentRequirements;

  const rpc = getRpcClient(paymentRequirements.network);
  const tokenMint = await fetchMintToken2022(rpc, asset as Address); // works for both token and token-2022

  if (tokenMint.programAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()) {
    return createTransferInstructionToken(client, paymentRequirements, tokenMint.data.decimals);
  } else if (tokenMint.programAddress.toString() === TOKEN_2022_PROGRAM_ADDRESS.toString()) {
    return createTransferInstructionToken2022(client, paymentRequirements, tokenMint.data.decimals);
  } else {
    throw new Error("Asset was not created by a known token program");
  }
}

/**
 * Creates a transfer instruction for the given client and payment requirements.
 * This function will create a transfer instruction for a token created
 * by the token-2022 program: https://github.com/solana-program/token-2022
 *
 * @param client - The signer instance used to create the transfer instruction
 * @param paymentRequirements - The payment requirements
 * @param decimals - The decimals of the token
 * @returns A promise that resolves to the transfer instruction
 */
async function createTransferInstructionToken2022(
  client: KeyPairSigner,
  paymentRequirements: PaymentRequirements,
  decimals: number,
): Promise<TransferCheckedInstructionToken2022> {
  const { asset, maxAmountRequired: amount, payTo } = paymentRequirements;

  const sourceATA = await findAssociatedTokenPdaToken2022({
    mint: asset as Address,
    owner: client.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  const destinationATA = await findAssociatedTokenPdaToken2022({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  return getTransferCheckedInstructionToken2022(
    {
      source: sourceATA[0],
      mint: asset as Address,
      destination: destinationATA[0],
      authority: client.address,
      amount: BigInt(amount),
      decimals: decimals,
    },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
  );
}

/**
 * Creates a transfer instruction for the given client and payment requirements.
 * This function will create a transfer instruction for a token created
 * by the token program: https://github.com/solana-program/token/
 *
 * @param client - The signer instance used to create the transfer instruction
 * @param paymentRequirements - The payment requirements
 * @param decimals - The decimals of the token
 * @returns A promise that resolves to the transfer instruction
 */
async function createTransferInstructionToken(
  client: KeyPairSigner,
  paymentRequirements: PaymentRequirements,
  decimals: number,
): Promise<TransferCheckedInstructionToken> {
  const { asset, maxAmountRequired: amount, payTo } = paymentRequirements;

  const sourceATA = await findAssociatedTokenPdaToken({
    mint: asset as Address,
    owner: client.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const destinationATA = await findAssociatedTokenPdaToken({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return getTransferCheckedInstructionToken(
    {
      source: sourceATA[0],
      mint: asset as Address,
      destination: destinationATA[0],
      authority: client,
      amount: BigInt(amount),
      decimals: decimals,
    },
    { programAddress: TOKEN_PROGRAM_ADDRESS },
  );
}
