import { ErrorReasons, VerifyResponse } from "..";

type ErrorCode = (typeof ErrorReasons)[number];

/**
 *
 * @param input
 */

/**
 * Error subtype that encapsulates verification failures and the generated verification response.
 * It stores the original `VerifyInput` along with the derived `VerifyResponse` for inspection.
 */
export class VerifyError extends Error {
  public readonly input: VerifyInput;
  public readonly response: VerifyResponse;

  /**
   * Builds a `VerifyError` populated with the provided verification input and the processed response.
   *
   * @param input - Verification payload, includes invalidReason and context if needed
   */
  constructor(input: VerifyInput) {
    super(input.invalidReason);
    this.input = input;
    this.response = createVerifyResponse(input);
    this.name = "VerifyError";
  }
}

/**
 * Produces a `VerifyResponse` describing the verification failure based on the invalidReason
 * The response includes a human-readable `invalidDescription` based on the `invalidReason`.
 *
 * @param input - Verification payload whose `invalidReason` and optional context dictate the response details.
 * @returns A `VerifyResponse` with included error metadata.
 */
export function createVerifyResponse(input: VerifyInput): VerifyResponse {
  const { payer, invalidReason } = input;

  switch (invalidReason) {
    case "insufficient_funds": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Available balance of ${context.available} ${context.unit} is less than the required ${context.cost} ${context.unit}.`,
      };
    }
    case "invalid_exact_evm_payload_authorization_valid_after": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Authorization is not valid until ${context.expected}, received at ${context.value}.`,
      };
    }
    case "invalid_exact_evm_payload_authorization_valid_before": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Authorization expired on ${context.expected}, received at ${context.value}.`,
      };
    }
    case "invalid_exact_evm_payload_authorization_value": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Authorization covers ${context.available} ${context.unit}, but ${context.cost} ${context.unit} is required.`,
      };
    }
    case "invalid_exact_evm_payload_signature": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Permit Signature ${context.signature} is invalid.`,
      };
    }
    case "invalid_exact_evm_payload_recipient_mismatch": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Recipient ${context.value} does not match expected recipient ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Submitted transaction does not match the expected serialized value: ${context.transaction}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_amount_mismatch": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Transaction amount of ${context.value} differs from the required ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_create_ata_instruction":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription:
          "Transaction is missing the required create associated token account instruction.",
      };
    case "invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_payee": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Create ATA instruction targets ${context.value}, but expected payee is ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_asset": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Create ATA instruction references asset ${context.value}, but expected asset is ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_instructions":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Instruction set does not match the required exact sequence.",
      };
    case "invalid_exact_svm_payload_transaction_instructions_length": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Instruction list contains ${context.value} entries; expected exactly ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Compute limit instruction is missing from the transaction.",
      };
    case "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Compute price instruction is missing from the transaction.",
      };
    case "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Compute price of ${context.value} exceeds allowed maximum ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription:
          "Transfer instruction is not an SPL Token transfer checked instruction.",
      };
    case "invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription:
          "Transfer instruction is not a Token 2022 transfer checked instruction.",
      };
    case "invalid_exact_svm_payload_transaction_fee_payer_included_in_instruction_accounts":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Fee payer must not appear within the instruction account list.",
      };
    case "invalid_exact_svm_payload_transaction_fee_payer_transferring_funds": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Fee payer ${context.feePayer} should not be the same as the signer ${context.signer}`,
      };
    }
    case "invalid_exact_svm_payload_transaction_not_a_transfer_instruction": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Instruction ${context.value} is not a supported transfer instruction ${context.expected}.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_receiver_ata_not_found": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Receiver associated token account ${context.receiver} could not be located.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_sender_ata_not_found": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Sender associated token account ${context.sender} could not be located.`,
      };
    }
    case "invalid_exact_svm_payload_transaction_simulation_failed":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Preflight simulation failed for the submitted transaction.",
      };
    case "invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Transfer targets ${context.value}, but the expected associated token account is ${context.expected}.`,
      };
    }
    case "invalid_network": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Could not find requested referenced network ${context.network}.`,
      };
    }
    case "invalid_payload": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Payload value ${context.value} does not match the expected format ${context.expected}.`,
      };
    }
    case "invalid_payment_requirements": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Payment requirements value ${context.value} differs from expected ${context.expected}.`,
      };
    }
    case "invalid_scheme": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Scheme ${context.value} is invalid; expected ${context.expected}.`,
      };
    }
    case "invalid_payment": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Payment amount ${context.cost} ${context.unit} is incompatible with the authorized ${context.available} ${context.unit}.`,
      };
    }
    case "payment_expired":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Payment authorization has expired.",
      };
    case "invalid_transaction_state": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Transaction is in an invalid state: ${context.error}.`,
      };
    }
    case "invalid_x402_version": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `x402 version ${context.value} is not supported; expected version ${context.expected}.`,
      };
    }
    case "settle_exact_svm_block_height_exceeded": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Current block height ${context.blockHeight} exceeds the allowed settlement window.`,
      };
    }
    case "settle_exact_svm_transaction_confirmation_timed_out":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "Transaction confirmation timed out before settlement completed.",
      };
    case "unsupported_scheme": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Scheme ${context.value} is unsupported; expected scheme ${context.expected}.`,
      };
    }
    case "unexpected_settle_error": {
      const { context } = input;
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: `Unexpected error occurred during settlement: ${context.error}.`,
      };
    }
    case "unexpected_verify_error":
      return {
        payer,
        isValid: false,
        invalidReason,
        invalidDescription: "An unexpected error occurred during verification.",
      };
  }
}

type VerifyInput = { payer?: string } & ErrorWithContext;
type ErrorWithContext = {
  [K in ErrorCode]: ErrorCodeContext[K] extends undefined
    ? { invalidReason: K }
    : { invalidReason: K; context: ErrorCodeContext[K] };
}[ErrorCode];

/* eslint-disable  @typescript-eslint/no-explicit-any */
type ValidateErrorCodeContext<T extends Record<ErrorCode, any>> = T;
type ErrorCodeContext = ValidateErrorCodeContext<{
  insufficient_funds: FundMismatch;
  invalid_exact_evm_payload_authorization_valid_after: ExpectedBigInt;
  invalid_exact_evm_payload_authorization_valid_before: ExpectedBigInt;
  invalid_exact_evm_payload_authorization_value: FundMismatch;
  invalid_exact_evm_payload_signature: { signature: string };
  invalid_exact_evm_payload_recipient_mismatch: ExpectedString;
  invalid_exact_svm_payload_transaction: { transaction: string };
  invalid_exact_svm_payload_transaction_amount_mismatch: ExpectedBigInt;
  invalid_exact_svm_payload_transaction_create_ata_instruction: undefined;
  invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_payee: ExpectedString;
  invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_asset: ExpectedString;
  invalid_exact_svm_payload_transaction_instructions: undefined;
  invalid_exact_svm_payload_transaction_instructions_length: ExpectedString;
  invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction: undefined;
  invalid_exact_svm_payload_transaction_instructions_compute_price_instruction: undefined;
  invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high: ExpectedBigInt;
  invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked: undefined;
  invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked: undefined;
  invalid_exact_svm_payload_transaction_fee_payer_included_in_instruction_accounts: undefined;
  invalid_exact_svm_payload_transaction_fee_payer_transferring_funds: {
    feePayer: string;
    signer: string;
  };
  invalid_exact_svm_payload_transaction_not_a_transfer_instruction: ExpectedString;
  invalid_exact_svm_payload_transaction_receiver_ata_not_found: { receiver: string };
  invalid_exact_svm_payload_transaction_sender_ata_not_found: { sender: string };
  invalid_exact_svm_payload_transaction_simulation_failed: undefined;
  invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata: ExpectedString;
  invalid_network: { network: string };
  invalid_payload: ExpectedString;
  invalid_payment_requirements: ExpectedString;
  invalid_scheme: ExpectedString;
  invalid_payment: FundMismatch;
  payment_expired: undefined;
  invalid_transaction_state: { error: string };
  invalid_x402_version: ExpectedNumber;
  settle_exact_svm_block_height_exceeded: { blockHeight: number };
  settle_exact_svm_transaction_confirmation_timed_out: undefined;
  unsupported_scheme: ExpectedString;
  unexpected_settle_error: { error: string };
  unexpected_verify_error: undefined;
}>;

type FundMismatch = {
  available: bigint;
  cost: bigint;
  unit: string;
};

type ExpectedString = {
  value: string;
  expected: string;
};

type ExpectedNumber = {
  value: number;
  expected: number;
};

type ExpectedBigInt = {
  value: bigint;
  expected: bigint;
};
