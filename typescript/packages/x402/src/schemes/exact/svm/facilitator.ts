import {
  VerifyResponse,
  SettleResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactSvmPayload,
  ErrorReasons,
} from "../../../types/verify";
import { NetworkEnum, SupportedSVMNetworks } from "../../../types/shared";
import {
  Address,
  assertIsInstructionWithAccounts,
  assertIsInstructionWithData,
  assertIsTransactionMessageWithBlockhashLifetime,
  Commitment,
  decompileTransactionMessageFetchingLookupTables,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getSignatureFromTransaction,
  isSolanaError,
  KeyPairSigner,
  SendTransactionApi,
  signTransaction,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
  SolanaRpcApiDevnet,
  SolanaRpcApiMainnet,
  RpcDevnet,
  RpcMainnet,
} from "@solana/kit";
import {
  fetchToken,
  findAssociatedTokenPda,
  identifyToken2022Instruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstruction2022,
  Token2022Instruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  identifyTokenInstruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstructionToken,
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
} from "@solana-program/token";
import { SCHEME } from "..";
import {
  decodeTransaction,
  getRpcClient,
  getRpcSubscriptions,
  signAndSimulateTransaction,
} from "../../../shared/svm";
import { createBlockHeightExceedencePromiseFactory, waitForRecentTransactionConfirmation, createRecentSignatureConfirmationPromiseFactory } from "@solana/transaction-confirmation";

/**
 * Verify the payment payload against the payment requirements.
 * TODO: update docstring
 * TODO: remove logging and extra steps
 *
 * @param signer - The signer that will sign and simulate the transaction
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  signer: KeyPairSigner,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  try {
    verifySchemesAndNetworks(payload, paymentRequirements);

    const svmPayload = payload.payload as ExactSvmPayload;
    const decodedTransaction = decodeTransaction(svmPayload);

    // We can see the signatures of the transaction
    for (const [address, maybeSignature] of Object.entries(decodedTransaction.signatures)) {
      if (maybeSignature) {
        console.log(`[step 1] ${address} has signed the transaction`);
      } else {
        console.log(`[step 1] ${address} is required to sign the transaction but hasn't yet`);
      }
    }

    const rpc = getRpcClient(payload.network as NetworkEnum);
    const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
      decodedTransaction.messageBytes,
    );
    const decompiledTransactionMessage = await decompileTransactionMessageFetchingLookupTables(
      compiledTransactionMessage,
      rpc,
    );

    const tokenInstruction = getValidatedTransferInstruction(decompiledTransactionMessage);

    await verifyTransferDetails(tokenInstruction, paymentRequirements, rpc);

    const simulateResult = await signAndSimulateTransaction(signer, decodedTransaction, rpc);
    if (simulateResult.value?.err) {
      throw new Error(`invalid_exact_svm_payload_transaction_simulation_failed`);
    }

    return {
      isValid: true,
      invalidReason: undefined,
    };
  } catch (e) {
    // if the error is one of the known error reasons, return the error reason
    if (e instanceof Error) {
      if (ErrorReasons.includes(e.message as (typeof ErrorReasons)[number])) {
        return {
          isValid: false,
          invalidReason: e.message as (typeof ErrorReasons)[number],
        };
      }
    }

    // if the error is not one of the known error reasons, return an unexpected error reason
    console.error(e);
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
    };
  }
}

/**
 * Settle the payment payload against the payment requirements.
 * TODO: Implement this and update docstring
 * TODO: handle durable nonce lifetime transactions
 *
 * @param payload - The payment payload to settle
 * @param paymentRequirements - The payment requirements to settle against
 * @returns A SettleResponse indicating if the payment is settled and any error reason
 */
export async function settle(
  signer: KeyPairSigner,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  console.log("in exact svm settle");
  // verify the payment is still valid
  const verifyResponse = await verify(signer, payload, paymentRequirements);
  if (!verifyResponse.isValid) {
    return {
      success: false,
      errorReason: verifyResponse.invalidReason,
      network: payload.network,
      transaction: ""
    };
  }

  // decode the transaction from a base64 encoded string
  const svmPayload = payload.payload as ExactSvmPayload;
  const decodedTransaction = decodeTransaction(svmPayload);

  // sign the transaction with the fee payer
  const signedTransaction = await signTransaction([signer.keyPair], decodedTransaction);

  // decode the transaction message from a byte array
  const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
    signedTransaction.messageBytes,
  );

  const rpc = getRpcClient(payload.network as NetworkEnum);
  const rpcSubscriptions = getRpcSubscriptions(payload.network as NetworkEnum);

  // decompile the transaction message
  const decompiledTransactionMessage = await decompileTransactionMessageFetchingLookupTables(
    compiledTransactionMessage,
    rpc,
  );

  // assert that the transaction has a blockhash lifetime constraint
  assertIsTransactionMessageWithBlockhashLifetime(decompiledTransactionMessage);

  const payer = compiledTransactionMessage.staticAccounts[0];
  const abortController = new AbortController();
  const commitment = "confirmed" as Commitment;
  const signature = getSignatureFromTransaction(signedTransaction);

  const getRecentSignatureConfirmationPromise = createRecentSignatureConfirmationPromiseFactory({
    rpc,
    rpcSubscriptions,
  } as Parameters<typeof createRecentSignatureConfirmationPromiseFactory>[0]);

  const getBlockHeightExceedencePromise = createBlockHeightExceedencePromiseFactory({
    rpc,
    rpcSubscriptions,
  } as Parameters<typeof createBlockHeightExceedencePromiseFactory>[0]);

  const config = {
    abortSignal: abortController.signal,
    commitment,
    getBlockHeightExceedencePromise,
    getRecentSignatureConfirmationPromise,
  }

  const signedTransactionWithBlockhashLifetime = {
    ...signedTransaction,
    lifetimeConstraint: decompiledTransactionMessage.lifetimeConstraint,
  }

  // Set a timeout to abort after 60 seconds
  const timeout = setTimeout(() => {
    abortController.abort("Transaction confirmation timed out after 60 seconds");
  }, 60000);

  try {
    // serialize the signed transaction into a base64 encoded wire transaction
    const base64EncodedTransaction = getBase64EncodedWireTransaction(signedTransaction);

    // set default sendTxConfig if not provided
    const sendTxConfig = { skipPreflight: true, encoding: "base64" };

    type SendTransactionConfig = Parameters<SendTransactionApi["sendTransaction"]>[1];

    // send the transaction to the network
    console.log("sending tx to network: ", signature);
    await rpc
      .sendTransaction(base64EncodedTransaction, sendTxConfig as SendTransactionConfig)
      .send();

    console.log("waiting for tx to be confirmed");
    await waitForRecentTransactionConfirmation({
      ...config,
      transaction: signedTransactionWithBlockhashLifetime,
    });
    console.log("tx confirmed: ", signature);

    return {
      success: true,
      errorReason: undefined,
      payer: payer,
      transaction: signature,
      network: payload.network,
    };
  } catch (error) {
    console.error("Error settling transaction: ", error);

    // block height exceeded
    if (isSolanaError(error, SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED)) {
      return {
        success: false,
        errorReason: "settle_exact_svm_block_height_exceeded",
        network: payload.network,
        transaction: signature,
      };
    }
    // transaction confirmation timed out
    else if (error instanceof DOMException && error.name === "AbortError") {
      return {
        success: false,
        errorReason: "settle_exact_svm_transaction_confirmation_timed_out",
        network: payload.network,
        transaction: signature,
      };
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
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

/**
 * Verify that the scheme and network are supported.
 *
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 */
export function verifySchemesAndNetworks(
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): void {
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    throw new Error("unsupported_scheme");
  }

  if (
    payload.network !== paymentRequirements.network ||
    !SupportedSVMNetworks.includes(paymentRequirements.network)
  ) {
    throw new Error("invalid_network");
  }
}

/**
 * Introspect the decompiled transaction message to make sure that it is an
 * expected transfer instruction.
 *
 * If it is, return the validated transfer instruction.
 *
 * @param decompiledTransactionMessage - The decompiled transaction message to get the transfer instruction from
 * @returns The validated transfer instruction
 */
export function getValidatedTransferInstruction(
  decompiledTransactionMessage: ReturnType<
    typeof decompileTransactionMessageFetchingLookupTables
  > extends Promise<infer U>
    ? U
    : never,
) {
  // verify that the transaction only contains one instruction (the transfer instruction)
  if (decompiledTransactionMessage.instructions.length !== 1) {
    throw new Error(`invalid_exact_svm_payload_transaction_instructions_length`);
  }

  const instruction = decompiledTransactionMessage.instructions[0];

  try {
    assertIsInstructionWithData(instruction);
    assertIsInstructionWithAccounts(instruction);
  } catch (error) {
    console.error("error", error);
    throw new Error(`invalid_exact_svm_payload_transaction_instructions`);
  }

  let tokenInstruction;

  // spl-token program
  if (instruction.programAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()) {
    const identifiedInstruction = identifyTokenInstruction(instruction);
    if (identifiedInstruction !== TokenInstruction.TransferChecked) {
      throw new Error(
        `invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked`,
      );
    }
    tokenInstruction = parseTransferCheckedInstructionToken({
      ...instruction,
      data: new Uint8Array(instruction.data),
    });
  }
  // token-2022 program
  else if (instruction.programAddress.toString() === TOKEN_2022_PROGRAM_ADDRESS.toString()) {
    const identifiedInstruction = identifyToken2022Instruction(instruction);
    if (identifiedInstruction !== Token2022Instruction.TransferChecked) {
      throw new Error(
        `invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked`,
      );
    }
    tokenInstruction = parseTransferCheckedInstruction2022({
      ...instruction,
      data: new Uint8Array(instruction.data),
    });
  }
  // invalid instruction
  else {
    throw new Error(`invalid_exact_svm_payload_transaction_not_a_transfer_instruction`);
  }
  return tokenInstruction;
}

/**
 * Verify the transfer instruction details.
 *
 * @param tokenInstruction - The token instruction to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @param rpc - The RPC client to use to fetch the token and ATA
 */
export async function verifyTransferDetails(
  tokenInstruction: ReturnType<typeof getValidatedTransferInstruction>,
  paymentRequirements: PaymentRequirements,
  rpc: RpcDevnet<SolanaRpcApiDevnet> | RpcMainnet<SolanaRpcApiMainnet>,
) {
  const tokenProgramAddress =
    tokenInstruction.programAddress.toString() === TOKEN_PROGRAM_ADDRESS.toString()
      ? TOKEN_PROGRAM_ADDRESS
      : TOKEN_2022_PROGRAM_ADDRESS;

  const payToATA = await findAssociatedTokenPda({
    mint: tokenInstruction.accounts.mint.address,
    owner: paymentRequirements.payTo as Address,
    tokenProgram: tokenProgramAddress,
  });

  if (tokenInstruction.accounts.destination.address !== payToATA[0]) {
    throw new Error(`invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata`);
  }

  // verify that the destination ATA exists
  try {
    await fetchToken(rpc, payToATA[0]);
  } catch (error) {
    console.error(error);
    throw new Error(`invalid_exact_svm_payload_transaction_receiver_ata_not_found`);
  }

  // verify that the source ATA exists
  try {
    await fetchToken(rpc, tokenInstruction.accounts.source.address);
  } catch (error) {
    console.error(error);
    throw new Error(`invalid_exact_svm_payload_transaction_sender_ata_not_found`);
  }

  // verify that the amount is correct
  const instructionAmount = tokenInstruction.data.amount;
  const paymentRequirementsAmount = BigInt(paymentRequirements.maxAmountRequired);
  if (instructionAmount !== paymentRequirementsAmount) {
    throw new Error(`invalid_exact_svm_payload_transaction_amount_mismatch`);
  }
}
