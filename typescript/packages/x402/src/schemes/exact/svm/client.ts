import { encodePayment } from "../../utils";
import {
  Address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  partiallySignTransactionMessageWithSigners,
  prependTransactionMessageInstruction,
  getBase64EncodedWireTransaction,
  type KeyPairSigner,
  RpcDevnet,
  SolanaRpcApiDevnet,
  RpcMainnet,
  SolanaRpcApiMainnet,
  AccountRole,
  fetchEncodedAccount,
  TransactionSigner,
  Instruction,
} from "@solana/kit";
import { PaymentPayload, PaymentRequirements } from "../../../types/verify";
import {
  fetchMint as fetchMintToken2022,
  findAssociatedTokenPda as findAssociatedTokenPdaToken2022,
  getCreateAssociatedTokenInstruction as getCreateAssociatedTokenInstructionToken2022,
  getTransferCheckedInstruction as getTransferCheckedInstructionToken2022,
  TOKEN_2022_PROGRAM_ADDRESS,
  TransferCheckedInstruction as TransferCheckedInstructionToken2022,
} from "@solana-program/token-2022";
import {
  findAssociatedTokenPda as findAssociatedTokenPdaToken,
  getCreateAssociatedTokenInstruction as getCreateAssociatedTokenInstructionToken,
  getTransferCheckedInstruction as getTransferCheckedInstructionToken,
  TOKEN_PROGRAM_ADDRESS,
  TransferCheckedInstruction as TransferCheckedInstructionToken,
} from "@solana-program/token";
import {
  estimateComputeUnitLimitFactory,
  getSetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from "@solana-program/compute-budget";
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
  const rpc = getRpcClient(paymentRequirements.network);

  // create the transfer instruction
  const transferInstructions = await createAtaAndTransferInstructions(client, paymentRequirements);

  // get priority fee
  const computeUnitPrice = await getComputeUnitPrice(rpc, transferInstructions);

  // estimate the compute budget limit (gas limit)
  const feePayer = paymentRequirements.extra?.feePayer as Address;
  const txToSimulate = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageComputeUnitPrice(computeUnitPrice, tx),
    tx => setTransactionMessageFeePayer(feePayer, tx),
    tx => appendTransactionMessageInstructions(transferInstructions, tx),
  );
  const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc });
  const estimatedUnits = await estimateComputeUnitLimit(txToSimulate);

  // finalize the transaction message by adding the compute budget limit and blockhash
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const tx = pipe(
    txToSimulate,
    tx =>
      prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({ units: estimatedUnits }),
        tx,
      ),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  );

  return tx;
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
async function createAtaAndTransferInstructions(
  client: KeyPairSigner,
  paymentRequirements: PaymentRequirements,
): Promise<Instruction[]> {
  const { asset } = paymentRequirements;

  const rpc = getRpcClient(paymentRequirements.network);
  const tokenMint = await fetchMintToken2022(rpc, asset as Address); // works for both token and token-2022

  // create the ATA (if needed) and transfer instructions
  let instructions: Instruction[] = [];

  // spl-token
  if (tokenMint.programAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()) {
    // create the ATA (if needed)
    const createAtaIx = await createTokenATAOrUndefined(paymentRequirements);
    if (createAtaIx) {
      instructions.push(createAtaIx);
    }

    // create the transfer instruction
    const transferIx = await createTransferInstructionToken(
      client,
      paymentRequirements,
      tokenMint.data.decimals,
    );
    instructions.push(transferIx);
  }

  // token-2022
  else if (tokenMint.programAddress.toString() === TOKEN_2022_PROGRAM_ADDRESS.toString()) {
    // create the ATA (if needed)
    const createAtaIx = await createToken2022ATAOrUndefined(paymentRequirements);
    if (createAtaIx) {
      instructions.push(createAtaIx);
    }

    // create the transfer instruction
    const transferIx = await createTransferInstructionToken2022(
      client,
      paymentRequirements,
      tokenMint.data.decimals,
    );
    instructions.push(transferIx);
  }

  // unknown token program
  else {
    throw new Error("Asset was not created by a known token program");
  }

  return instructions;
}

/**
 * Returns a token-2022 create ATA instruction for the payTo address if the ATA account has not been created.
 * The create ATA instruction will be paid for by the feePayer in the payment requirements.
 *
 * Returns undefined if the ATA account already exists.
 *
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to the create ATA instruction or undefined if the ATA account already exists
 * @throws an error if the feePayer is not provided in the payment requirements
 */
async function createToken2022ATAOrUndefined(
  paymentRequirements: PaymentRequirements,
): Promise<Instruction | undefined> {
  const { asset, payTo, extra, network } = paymentRequirements;
  const feePayer = extra?.feePayer as Address;

  // feePayer is required
  if (!feePayer) {
    throw new Error(
      "feePayer is required in paymentRequirements.extra in order to set the " +
        "facilitator as the fee payer for the create associated token account instruction",
    );
  }

  // derive the ATA of the payTo address
  const [destinationATAAddress] = await findAssociatedTokenPdaToken2022({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  // check if the ATA exists
  const rpc = getRpcClient(network);
  const maybeAccount = await fetchEncodedAccount(rpc, destinationATAAddress);

  // if the ATA does not exist, return an instruction to create it
  if (!maybeAccount.exists) {
    return getCreateAssociatedTokenInstructionToken2022({
      payer: paymentRequirements.extra?.feePayer as TransactionSigner<string>,
      ata: destinationATAAddress,
      owner: payTo as Address,
      mint: asset as Address,
    });
  }

  // if the ATA exists, return undefined
  return undefined;
}

/**
 * Returns a spl-token create ATA instruction for the payTo address if the ATA account has not been created.
 * The create ATA instruction will be paid for by the feePayer in the payment requirements.
 *
 * Returns undefined if the ATA account already exists.
 *
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to the create ATA instruction or undefined if the ATA account already exists
 * @throws an error if the feePayer is not provided in the payment requirements
 */
async function createTokenATAOrUndefined(
  paymentRequirements: PaymentRequirements,
): Promise<Instruction | undefined> {
  const { asset, payTo, extra, network } = paymentRequirements;
  const feePayer = extra?.feePayer as Address;

  // feePayer is required
  if (!feePayer) {
    throw new Error(
      "feePayer is required in paymentRequirements.extra in order to set the " +
        "facilitator as the fee payer for the create associated token account instruction",
    );
  }

  // derive the ATA of the payTo address
  const [destinationATAAddress] = await findAssociatedTokenPdaToken({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // check if the ATA exists
  const rpc = getRpcClient(network);
  const maybeAccount = await fetchEncodedAccount(rpc, destinationATAAddress);

  // if the ATA does not exist, return an instruction to create it
  if (!maybeAccount.exists) {
    return getCreateAssociatedTokenInstructionToken({
      payer: paymentRequirements.extra?.feePayer as TransactionSigner<string>,
      ata: destinationATAAddress,
      owner: payTo as Address,
      mint: asset as Address,
    });
  }

  // if the ATA exists, return undefined
  return undefined;
}

/**
 * Creates a token-2022 transfer instruction for the given client and payment requirements.
 * This function will create a transfer instruction for a token created
 * by the token-2022 program: https://github.com/solana-program/token-2022
 *
 * @param client - The signer instance who's tokens will be debited from
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

  const [sourceATA] = await findAssociatedTokenPdaToken2022({
    mint: asset as Address,
    owner: client.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  const [destinationATA] = await findAssociatedTokenPdaToken2022({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  return getTransferCheckedInstructionToken2022(
    {
      source: sourceATA,
      mint: asset as Address,
      destination: destinationATA,
      authority: client,
      amount: BigInt(amount),
      decimals: decimals,
    },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
  );
}

/**
 * Creates an spl-token transfer instruction for the given client and payment requirements.
 * This function will create a transfer instruction for a token created
 * by the token program: https://github.com/solana-program/token/
 *
 * @param client - The signer instance who's tokens will be debited from
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

  const [sourceATA] = await findAssociatedTokenPdaToken({
    mint: asset as Address,
    owner: client.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const [destinationATA] = await findAssociatedTokenPdaToken({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return getTransferCheckedInstructionToken(
    {
      source: sourceATA,
      mint: asset as Address,
      destination: destinationATA,
      authority: client,
      amount: BigInt(amount),
      decimals: decimals,
    },
    { programAddress: TOKEN_PROGRAM_ADDRESS },
  );
}

/**
 * Gets a suitable compute unit price for the given instructions.
 *
 * @param rpc - The RPC client to use for getting the recent prioritization fees
 * @param instructions - The instructions to get the compute unit price for
 * @returns A promise that resolves to the compute unit price
 */
async function getComputeUnitPrice(
  rpc: RpcDevnet<SolanaRpcApiDevnet> | RpcMainnet<SolanaRpcApiMainnet>,
  instructions: Instruction[],
): Promise<number> {
  // get the addresses of the write locked accounts
  const writeLockedAccounts: Address[] = [
    ...new Set(
      instructions.flatMap(
        instruction =>
          instruction.accounts
            ?.filter(account => account.role === AccountRole.WRITABLE)
            .map(account => account.address) ?? [],
      ),
    ),
  ];

  // call RPC to get the recent prioritization fees on the write-locked accounts
  const recentPrices = await rpc.getRecentPrioritizationFees(writeLockedAccounts).send();

  if (recentPrices.length === 0) {
    return 10_000_000; // default to 10 lamports, same as phantom wallet
  }

  // take the 90th percentile of the recent prices
  const sortedPrices = [...recentPrices].sort((a, b) =>
    Number(a.prioritizationFee - b.prioritizationFee),
  );
  const percentileIndex = Math.floor(0.9 * (sortedPrices.length - 1));
  const percentilePrice = sortedPrices[percentileIndex].prioritizationFee;
  const bidPrice = Math.ceil(Number(percentilePrice));

  if (bidPrice === 0) {
    return 10_000_000; // default to 10,000,000 microlamports, same as phantom wallet
  }

  return bidPrice;
}
