import { ConnectedClient, SignerWallet } from "../shared/evm/wallet";
import { PaymentDetails, SettleResponse, VerifyResponse, toJsonSafe } from "../shared/types";
import {
  verify as verifyExact,
  settle as settleExact,
  decodePayment as decodePaymentExact,
} from "../schemes/exact/evm";
import axios from "axios";
import { Chain, Transport, Account } from "viem";

/* Running your own Facilitator */
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
    const payment = decodePaymentExact(payload);
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
  const payment = decodePaymentExact(payload);

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
/* End running your own Facilitator */

/* Verifying / Settling with a Facilitator */
export function useFacilitator(url: string = "http://localhost:4020") {
  async function verify(payload: string, paymentDetails: PaymentDetails): Promise<VerifyResponse> {
    const res = await axios.post(`${url}/verify`, {
      payload: payload,
      details: toJsonSafe(paymentDetails),
    });

    if (res.status !== 200) {
      throw new Error(`Failed to verify payment: ${res.statusText}`);
    }

    return res.data as VerifyResponse;
  }

  async function settle(payload: string, paymentDetails: PaymentDetails): Promise<SettleResponse> {
    const res = await axios.post(`${url}/settle`, {
      payload: payload,
      details: toJsonSafe(paymentDetails),
    });

    if (res.status !== 200) {
      throw new Error(`Failed to settle payment: ${res.statusText}`);
    }

    return res.data as SettleResponse;
  }

  return { verify, settle };
}
/* End Verifying / Settling with a Facilitator */
