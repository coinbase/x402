import {
  VerifyResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactSvmPayload,
  ErrorReasons,
} from "../../../../types/verify";
import { SupportedSVMNetworks } from "../../../../types/shared";
import {
  Address,
  assertIsInstructionWithAccounts,
  assertIsInstructionWithData,
  CompilableTransactionMessage,
  decompileTransactionMessageFetchingLookupTables,
  fetchEncodedAccounts,
  getCompiledTransactionMessageDecoder,
  KeyPairSigner,
  SolanaRpcApiDevnet,
  SolanaRpcApiMainnet,
  RpcDevnet,
  RpcMainnet,
  Instruction,
  AccountLookupMeta,
  AccountMeta,
  InstructionWithData,
} from "@solana/kit";
import {
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
} from "@solana-program/compute-budget";
import {
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
    const rpc = getRpcClient(payload.network);

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
  const transactionMessage = await decompileTransactionMessageFetchingLookupTables(
    compiledTransactionMessage,
    rpc,
  );

  // verify that the transaction contains the expected instructions
  verifyTransactionInstructions(transactionMessage);

  // validate that the transfer instruction is valid
  const tokenInstruction = getValidatedTransferInstruction(transactionMessage.instructions[2]);
  await verifyTransferDetails(tokenInstruction, paymentRequirements, rpc);
}

/**
 * Verify that the transaction contains the expected instructions.
 *
 * @param transactionMessage - The transaction message to verify
 * @throws Error if the transaction does not contain the expected instructions
 */
function verifyTransactionInstructions(transactionMessage: CompilableTransactionMessage) {
  // validate the number of expected instructions
  if (transactionMessage.instructions.length !== 3) {
    throw new Error(`invalid_exact_svm_payload_transaction_instructions_length`);
  }
  const computeLimitInstruction = transactionMessage.instructions[0];
  const computePriceInstruction = transactionMessage.instructions[1];

  verifyComputeLimitInstruction(computeLimitInstruction);
  verifyComputePriceInstruction(computePriceInstruction);
}

/**
 * Verify that the compute limit instruction is valid.
 *
 * @param instruction - The compute limit instruction to verify
 * @throws Error if the compute limit instruction is invalid
 */
function verifyComputeLimitInstruction(
  instruction: Instruction<
    string,
    readonly (AccountLookupMeta<string, string> | AccountMeta<string>)[]
  >,
) {
  try {
    if (
      instruction.programAddress.toString() !== COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() ||
      instruction.data?.[0] !== 2 // discriminator of set compute unit limit instruction
    ) {
      throw new Error(
        `invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction`,
      );
    }
    parseSetComputeUnitLimitInstruction(
      instruction as InstructionWithData<Uint8Array<ArrayBufferLike>>,
    );
  } catch (error) {
    console.error(error);
    throw new Error(`invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction`);
  }
}

/**
 * Verify that the compute price instruction is valid.
 *
 * @param instruction - The compute price instruction to verify
 * @throws Error if the compute price instruction is invalid
 */
function verifyComputePriceInstruction(
  instruction: Instruction<
    string,
    readonly (AccountLookupMeta<string, string> | AccountMeta<string>)[]
  >,
) {
  try {
    if (
      instruction.programAddress.toString() !== COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() ||
      instruction.data?.[0] !== 3 // discriminator of set compute unit price instruction
    ) {
      throw new Error(
        `invalid_exact_svm_payload_transaction_instructions_compute_price_instruction`,
      );
    }
    parseSetComputeUnitPriceInstruction(
      instruction as InstructionWithData<Uint8Array<ArrayBufferLike>>,
    );
  } catch (error) {
    console.error(error);
    throw new Error(`invalid_exact_svm_payload_transaction_instructions_compute_price_instruction`);
  }
}

/**
 * Inspect the decompiled transaction message to make sure that it is a valid
 * transfer instruction.
 *
 * @param instruction - The instruction to get the transfer instruction from
 * @returns The validated transfer instruction
 */
export function getValidatedTransferInstruction(
  instruction: Instruction<
    string,
    readonly (AccountLookupMeta<string, string> | AccountMeta<string>)[]
  >,
) {
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

  // verify that the source and destination ATAs exist
  const addresses = [tokenInstruction.accounts.source.address, payToATA[0]];
  const maybeAccounts = await fetchEncodedAccounts(rpc, addresses);
  const missingAccounts = maybeAccounts.filter(a => !a.exists);
  for (const account of missingAccounts) {
    if (account.address === tokenInstruction.accounts.source.address) {
      throw new Error(`invalid_exact_svm_payload_transaction_sender_ata_not_found`);
    }
    if (account.address === payToATA[0]) {
      throw new Error(`invalid_exact_svm_payload_transaction_receiver_ata_not_found`);
    }
  }

  // verify that the amount is correct
  const instructionAmount = tokenInstruction.data.amount;
  const paymentRequirementsAmount = BigInt(paymentRequirements.maxAmountRequired);
  if (instructionAmount !== paymentRequirementsAmount) {
    throw new Error(`invalid_exact_svm_payload_transaction_amount_mismatch`);
  }
}
