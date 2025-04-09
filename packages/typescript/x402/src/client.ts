import axios from "axios";
import { SignerWallet } from "./shared/evm/wallet.js";
import { createPaymentHeader as createPaymentHeaderExactEVM } from "./schemes/exact/evm/client.js";
import { PaymentDetails, SettleResponse, VerifyResponse } from "./types/index.js";
import { toJsonSafe } from "./types/index.js";

const supportedEVMNetworks = ["84532"];

export async function createPaymentHeader(
  client: SignerWallet,
  paymentDetails: PaymentDetails,
): Promise<string> {
  if (
    paymentDetails.scheme === "exact" &&
    supportedEVMNetworks.includes(paymentDetails.networkId)
  ) {
    return await createPaymentHeaderExactEVM(client, paymentDetails);
  }

  throw new Error("Unsupported scheme");
}

export function useFacilitator(url: string = "https://x402.org/facilitator") {
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

export const { verify, settle } = useFacilitator();
