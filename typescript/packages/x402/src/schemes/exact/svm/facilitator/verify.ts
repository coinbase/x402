import {
  VerifyResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactSvmPayload,
  ErrorReasons,
} from "../../../../types/verify";
import { NetworkEnum, SupportedSVMNetworks } from "../../../../types/shared";
import {
  Address,
  assertIsInstructionWithAccounts,
  assertIsInstructionWithData,
  decompileTransactionMessageFetchingLookupTables,
  getCompiledTransactionMessageDecoder,
  KeyPairSigner,
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
import {
  decodeTransactionFromPayload,
  getRpcClient,
  signAndSimulateTransaction,
} from "../../../../shared/svm";
import { SCHEME } from "../../";

/**
 * Verify the payment payload against the payment requirements.
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
    // verify that the scheme and network are supported
    verifySchemesAndNetworks(payload, paymentRequirements);

    // decode the base64 encoded transaction
    const svmPayload = payload.payload as ExactSvmPayload;
    const decodedTransaction = decodeTransactionFromPayload(svmPayload);
    const rpc = getRpcClient(payload.network as NetworkEnum);

    // perform transaction introspection to validate the transaction structure and details
    await transactionIntrospection(svmPayload, paymentRequirements, rpc);

    // simulate the transaction to ensure it will execute successfully
    const simulateResult = await signAndSimulateTransaction(signer, decodedTransaction, rpc);
    if (simulateResult.value?.err) {
      throw new Error(`invalid_exact_svm_payload_transaction_simulation_failed`);
    }

    return {
      isValid: true,
      invalidReason: undefined,
    };
  } catch (error) {
    // if the error is one of the known error reasons, return the error reason
    if (error instanceof Error) {
      if (ErrorReasons.includes(error.message as (typeof ErrorReasons)[number])) {
        return {
          isValid: false,
          invalidReason: error.message as (typeof ErrorReasons)[number],
        };
      }
    }

    // if the error is not one of the known error reasons, return an unexpected error reason
    console.error(error);
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
    };
  }
}

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
 * Perform transaction introspection to validate the transaction structure and transfer details.
 * This function handles decoding the transaction, validating the transfer instruction,
 * and verifying all transfer details against the payment requirements.
 *
 * @param svmPayload - The SVM payload containing the transaction
 * @param paymentRequirements - The payment requirements to verify against
 * @param rpc - The RPC client to use for fetching token and ATA information
 */
async function transactionIntrospection(
  svmPayload: ExactSvmPayload,
  paymentRequirements: PaymentRequirements,
  rpc: RpcDevnet<SolanaRpcApiDevnet> | RpcMainnet<SolanaRpcApiMainnet>,
): Promise<void> {
  const decodedTransaction = decodeTransactionFromPayload(svmPayload);
  const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
    decodedTransaction.messageBytes,
  );
  const decompiledTransactionMessage = await decompileTransactionMessageFetchingLookupTables(
    compiledTransactionMessage,
    rpc,
  );

  // verify that the transaction and the transfer instruction are valid
  const tokenInstruction = getValidatedTransferInstruction(decompiledTransactionMessage);
  await verifyTransferDetails(tokenInstruction, paymentRequirements, rpc);
}

/**
 * Inspect the decompiled transaction message to make sure that it is an
 * expected transfer instruction.
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
  // verify that the transaction only contains one
  // token transfer instruction
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
