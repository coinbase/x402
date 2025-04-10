import { SignerWallet } from "./shared/evm/wallet";
import { createPaymentHeader as createPaymentHeaderExactEVM } from "./schemes/exact/evm/client";
import axios from "axios";
import { PaymentRequirements, SettleResponse, VerifyResponse } from "./types";
import { toJsonSafe } from "./types";

const supportedEVMNetworks = ["84532"];

export async function createPaymentHeader(
  client: SignerWallet,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  if (
    paymentRequirements.scheme === "exact" &&
    supportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    return await createPaymentHeaderExactEVM(client, paymentRequirements);
  }

  throw new Error("Unsupported scheme");
}

export function useFacilitator(url: string = "https://x402.org/facilitator") {
  async function verify(payload: string, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    const res = await axios.post(`${url}/verify`, {
      payload: payload,
      details: toJsonSafe(paymentRequirements),
    });

    if (res.status !== 200) {
      throw new Error(`Failed to verify payment: ${res.statusText}`);
    }

    return res.data as VerifyResponse;
  }

  async function settle(payload: string, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    const res = await axios.post(`${url}/settle`, {
      payload: payload,
      details: toJsonSafe(paymentRequirements),
    });

    if (res.status !== 200) {
      throw new Error(`Failed to settle payment: ${res.statusText}`);
    }

    return res.data as SettleResponse;
  }

  return { verify, settle };
}

export const { verify, settle } = useFacilitator();
