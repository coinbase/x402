import { decodePayment } from "../exact/evm";
import { ConnectedClient, SignerWallet } from "../shared/evm/wallet";
import { PaymentDetails, SettleResponse, VerifyResponse } from "../types";
import { verify as verifyExact, settle as settleExact } from "../exact/evm";

export * as hono from "./hono";

const supportedEVMNetworks = ["84532"];

/**
 * Verifies a payment payload against the required payment details regardless of the scheme
 * this function wraps all verify functions for each specific scheme
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentDetails - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  client: ConnectedClient,
  payload: string,
  paymentDetails: PaymentDetails
): Promise<VerifyResponse> {
  if (
    paymentDetails.scheme == "exact" &&
    supportedEVMNetworks.includes(paymentDetails.networkId)
  ) {
    const payment = decodePayment(payload);
    const valid = await verifyExact(client, payment, paymentDetails);
    return valid;
  }
  return {
    isValid: false,
    invalidReason: `Incompatible payload scheme. payload: ${paymentDetails.scheme}, supported: exact`,
  };
}

/**
 * Settles a payment payload against the required payment details regardless of the scheme
 * this function wraps all settle functions for each specific scheme
 * @param client - The signer wallet used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentDetails - The payment requirements that the payload must satisfy
 * @returns A SettleResponse indicating if the payment is settled and any settlement reason
 */
export async function settle(
  client: SignerWallet,
  payload: string,
  paymentDetails: PaymentDetails
): Promise<SettleResponse> {
  const payment = decodePayment(payload);

  if (
    paymentDetails.scheme == "exact" &&
    supportedEVMNetworks.includes(paymentDetails.networkId)
  ) {
    return settleExact(client, payment, paymentDetails);
  }

  return {
    success: false,
    error: `Incompatible payload scheme. payload: ${paymentDetails.scheme}, supported: exact`,
  };
}
