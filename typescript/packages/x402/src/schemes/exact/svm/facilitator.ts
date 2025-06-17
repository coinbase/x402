import {
  VerifyResponse,
  SettleResponse,
  PaymentPayload,
  PaymentRequirements,
} from "../../../types/verify";
import { NetworkEnum } from "../../../types/shared";

// facilitator will:
// - propose a transaction to the client and send it in the 402 PAYMENT REQUIRED response
// - receive a partially signed transaction from the client
// - verify the partially signed transaction
// - sign the transaction
// - broadcast the transaction to the network
// - return success or failure info to the server which will then send it to the client

/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Verify the payment payload against the payment requirements.
 * TODO: Implement this and update docstring
 *
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
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
 * Propose a transaction to the client.
 * TODO: Implement this and update docstring
 *
 * @param payload - The payment payload to propose a transaction for
 * @param paymentRequirements - The payment requirements to propose a transaction for
 * @returns A base64 encoded string representing the serialized proposed transaction
 */
export async function proposeTransaction(
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  return "";
}

/* eslint-enable @typescript-eslint/no-unused-vars */
