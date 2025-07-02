import {
  VerifyResponse,
  SettleResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactSvmPayload,
} from "../../../types/verify";
import { NetworkEnum, SupportedSVMNetworks } from "../../../types/shared";
import {
  Address,
  assertIsInstructionWithAccounts,
  assertIsInstructionWithData,
  decompileTransactionMessageFetchingLookupTables,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  KeyPairSigner,
  partiallySignTransaction,
  signTransaction,
  Transaction,
} from "@solana/kit";
import {
  fetchToken,
  findAssociatedTokenPda,
  identifyToken2022Instruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstruction2022,
  Token2022Instruction,
  TOKEN_2022_PROGRAM_ADDRESS
} from "@solana-program/token-2022";
import {
  identifyTokenInstruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstructionToken,
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
} from "@solana-program/token";
import { SCHEME } from "..";
import { getRpcClient } from "../../../shared/svm/rpc";


/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Verify the payment payload against the payment requirements.
 * TODO: Implement this and update docstring
 * TODO: refactor this behemoth
 *
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  signer: KeyPairSigner,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // verify that the scheme is supported
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `unsupported_scheme`
    };
  }

  // verify that the network is valid
  if (
    payload.network !== paymentRequirements.network ||
    !SupportedSVMNetworks.includes(paymentRequirements.network)
  ) {
    return {
      isValid: false,
      invalidReason: `invalid_network`,
    };
  }

  // verify that the transaction can be decoded and serialized into a transaction
  const svmPayload = payload.payload as ExactSvmPayload;
  let decodedTransaction: Transaction;
  try {
    const base64Encoder = getBase64Encoder();
    const transactionBytes = base64Encoder.encode(svmPayload.transaction);
    const transactionDecoder = getTransactionDecoder();
    decodedTransaction = transactionDecoder.decode(transactionBytes);
  } catch (error) {
    console.error("error", error);
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction`,
    };
  }

  // inspect the transaction and verify that the only instruction is a transfer instruction
  for (const [address, maybeSignature] of Object.entries(decodedTransaction.signatures)) {
    if (maybeSignature) {
      console.log(`[step 1] ${address} has signed the transaction`);
    } else {
      console.log(`[step 1] ${address} is required to sign the transaction but hasn't yet`);
    }
  }

  const compiledTransactionMessageDecoder = getCompiledTransactionMessageDecoder();
  const compiledTransactionMessage = compiledTransactionMessageDecoder.decode(decodedTransaction.messageBytes);

  console.log("compiledTransactionMessage", compiledTransactionMessage);

  console.log(`[step 2] The transaction is version ${compiledTransactionMessage.version}`);

  // We can see the lifetime token, though we don't have enough context yet to know if it's a blockhash or a durable nonce
  console.log(
    `[step 2] We can see the transaction lifetime token, but we don't know if it's a blockhash or durable nonce: ${compiledTransactionMessage.lifetimeToken}`,
  );

  // We can see the static accounts:
  console.log(compiledTransactionMessage.staticAccounts, '[step 2] Static accounts of the transaction');

  // The `addressLookupTables` field is only included for non-legacy transactions
  if (compiledTransactionMessage.version === 'legacy') {
    throw new Error('We used version: 0');
  }

  // Now we can view address lookup tables:
  console.log(compiledTransactionMessage.addressTableLookups, '[step 2] Address lookup tables for the transaction');


  // We can see the instructions:
  console.log(compiledTransactionMessage.instructions, '[step 2] Instructions of the transaction');

  console.log(
    { ...compiledTransactionMessage.instructions[0], data: '(removed for brevity)' },
    '[step 2] The first instruction of the compiled transaction message',
  );

  const rpc = getRpcClient(payload.network as NetworkEnum);

  const decompiledTransactionMessage =
    await decompileTransactionMessageFetchingLookupTables(
      compiledTransactionMessage,
      rpc,
    );

  // This is our `TransactionMessage` structure, which is much easier to understand and parse
  // This is the same data structure that was created before we first signed the transaction

  // We can see the fee payer:
  console.log(`[step 3] The transaction fee payer is ${decompiledTransactionMessage.feePayer.address}`);

  // And the lifetime constraint:
  console.log(decompiledTransactionMessage.lifetimeConstraint, '[step 3] The transaction lifetime constraint');

  if ('blockhash' in decompiledTransactionMessage.lifetimeConstraint) {
    console.log(`[step 3] The transaction blockhash is ${decompiledTransactionMessage.lifetimeConstraint.blockhash}`);
  }

  // verify that the transaction only contains one instruction (the transfer instruction)
  if (decompiledTransactionMessage.instructions.length !== 1) {
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_instructions`,
    };
  }

  // verify that the instruction is a transfer instruction
  const instruction = decompiledTransactionMessage.instructions[0];

  try {
    assertIsInstructionWithData(instruction);
    assertIsInstructionWithAccounts(instruction);
  } catch (error) {
    console.error("error", error);
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_instructions`,
    };
  }

  let tokenInstruction;

  // spl-token program
  if (instruction.programAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()) {

    // not a transfer checked instruction
    const identifiedInstruction = identifyTokenInstruction(instruction);
    if (identifiedInstruction !== TokenInstruction.TransferChecked) {
      return {
        isValid: false,
        invalidReason: `invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked`,
      };
    }

    // parse the transfer checked instruction
    tokenInstruction = parseTransferCheckedInstructionToken({
      ...instruction,
      data: new Uint8Array(instruction.data),
    });
  }
  // token-2022 program
  else if (instruction.programAddress.toString() === TOKEN_2022_PROGRAM_ADDRESS.toString()) {

    // not a transfer checked instruction
    const identifiedInstruction = identifyToken2022Instruction(instruction);
    if (identifiedInstruction !== Token2022Instruction.TransferChecked) {
      return {
        isValid: false,
        invalidReason: `invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked`,
      };
    }

    // parse the transfer checked instruction
    tokenInstruction = parseTransferCheckedInstruction2022({
      ...instruction,
      data: new Uint8Array(instruction.data),
    });
  }
  // invalid instruction
  else {
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_not_a_transfer_instruction`,
    };
  }

  console.log("tokenInstruction", tokenInstruction);

  // verify that the destination address is the Associated Token Account of the 
  // payTo address from the payment requirements
  let payToATA;
  if (tokenInstruction.programAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()) {
    console.log("token program address", TOKEN_PROGRAM_ADDRESS.toString());
    payToATA = await findAssociatedTokenPda({
      mint: tokenInstruction.accounts.mint.address,
      owner: paymentRequirements.payTo as Address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
  }
  else if (tokenInstruction.programAddress.toString() === TOKEN_2022_PROGRAM_ADDRESS.toString()) {
    console.log("token-2022 program address", TOKEN_2022_PROGRAM_ADDRESS.toString());
    payToATA = await findAssociatedTokenPda({
      mint: tokenInstruction.accounts.mint.address,
      owner: paymentRequirements.payTo as Address,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
  }
  else {
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_cannot_derive_receiver_ata`,
    };
  }

  console.log("payToATA", payToATA);
  if (tokenInstruction.accounts.destination.address !== payToATA[0]) {
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata`,
    };
  }

  // verify that the destination ATA exists
  try {
    const tokenAccount = await fetchToken(rpc, payToATA[0]);
    console.log("receiver tokenAccount", tokenAccount);
  } catch (error) {
    console.error(error);
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_receiver_ata_not_found`,
    };
  }

  // verify that the source ATA exists
  try {
    const tokenAccount = await fetchToken(rpc, tokenInstruction.accounts.source.address);
    console.log("sender tokenAccount", tokenAccount);
  } catch (error) {
    console.error(error);
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_sender_ata_not_found`,
    };
  }

  // verify that the amount is correct
  const instructionAmount = tokenInstruction.data.amount;
  const paymentRequirementsAmount = BigInt(paymentRequirements.maxAmountRequired);
  if (instructionAmount !== paymentRequirementsAmount) {
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_amount_mismatch`,
    };
  }

  // sign the transaction as the fee payer
  console.log("signer.keyPair.publicKey.type", signer.keyPair.publicKey.type);
  const signedTransaction = await partiallySignTransaction([signer.keyPair], decodedTransaction);
  console.log("signedTransaction", signedTransaction);

  // serialize the signed transaction into a base64 encoded wire transaction
  const base64EncodedTransaction = getBase64EncodedWireTransaction(signedTransaction);
  console.log("base64EncodedTransaction", base64EncodedTransaction);

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

  console.log(simulateResult);

  if (simulateResult.value?.err) {
    return {
      isValid: false,
      invalidReason: `invalid_exact_svm_payload_transaction_simulation_failed`,
    };
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer: "",
  };
}

/**
 * Settle the payment payload against the payment requirements.
 * TODO: Implement this and update docstring
 *
 * @param payload - The payment payload to settle
 * @param paymentRequirements - The payment requirements to settle against
 * @returns A SettleResponse indicating if the payment is settled and any error reason
 */
export async function settle(
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  return {
    success: true,
    errorReason: undefined,
    payer: "",
    transaction: "",
    network: NetworkEnum.SOLANA_MAINNET,
  };
}

/**
 * Get the fee payer for the given signer.
 *
 * @param signer - The signer to get the fee payer for
 * @returns The fee payer address
 */
export function getFeePayer(signer: KeyPairSigner): GetFeePayerResponse {
  return {
    feePayer: signer.address.toString(),
  };
}

export type GetFeePayerResponse = {
  feePayer: string;
};

/* eslint-enable @typescript-eslint/no-unused-vars */
