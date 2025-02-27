import { SignerWallet } from "./shared/evm/wallet";
import { createPaymentHeader as createPaymentHeaderExactEVM } from "./schemes/exact/evm/client";
import axios from "axios";
import { PaymentDetails, SettleResponse, VerifyResponse } from "./types";
import { toJsonSafe } from "./types";

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

export const { verify, settle } = useFacilitator();
