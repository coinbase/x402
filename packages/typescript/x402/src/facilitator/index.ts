import { Chain, Transport, Account } from "viem";
import { verify as verifyExact, settle as settleExact, decodePayment } from "../schemes/exact/evm/index.js";
import { ConnectedClient, SignerWallet } from "../shared/evm/wallet.js";
import { PaymentDetails, SettleResponse, VerifyResponse } from "../types/index.js";

const supportedEVMNetworks = ["84532"];

/**
 * Verifies a payment payload against the required payment details regardless of the scheme
 * this function wraps all verify functions for each specific scheme
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentDetails - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: string,
  paymentDetails: PaymentDetails,
): Promise<VerifyResponse> {
  if (paymentDetails.scheme == "exact" && supportedEVMNetworks.includes(paymentDetails.networkId)) {
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
export async function settle<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport>,
  payload: string,
  paymentDetails: PaymentDetails,
): Promise<SettleResponse> {
  const payment = decodePayment(payload);

  if (paymentDetails.scheme == "exact" && supportedEVMNetworks.includes(paymentDetails.networkId)) {
    return settleExact(client, payment, paymentDetails);
  }

  return {
    success: false,
    error: `Incompatible payload scheme. payload: ${paymentDetails.scheme}, supported: exact`,
  };
}

export type Supported = {
  x402Version: number;
  kind: {
    scheme: string;
    networkId: string;
  }[];
};
