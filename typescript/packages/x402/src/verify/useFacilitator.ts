import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../types/verify";
import axios from "axios";
import { toJsonSafe } from "../shared";
import { Resource } from "../types";
import { config } from "dotenv";

config();

export type CreateHeaders = () => Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
}>;

/**
 * Creates a facilitator client for interacting with the X402 payment facilitator service
 *
 * @param url - The base URL of the facilitator service (defaults to "https://x402.org/facilitator")
 * @param createAuthHeaders - Optional function to create an auth header for the facilitator service. If using Coinbase's facilitator, use the createAuthHeaders function.
 * @returns An object containing verify and settle functions for interacting with the facilitator
 */
export function useFacilitator(
  url: Resource = "https://x402.org/facilitator",
  createAuthHeaders?: CreateHeaders,
) {
  /**
   * Verifies a payment payload with the facilitator service
   *
   * @param payload - The payment payload to verify
   * @param paymentRequirements - The payment requirements to verify against
   * @returns A promise that resolves to the verification response
   */
  async function verify(
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const res = await axios.post(
      `${url}/verify`,
      {
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements),
      },
      {
        headers: createAuthHeaders ? (await createAuthHeaders()).verify : undefined,
      },
    );

    if (res.status !== 200) {
      throw new Error(`Failed to verify payment: ${res.statusText}`);
    }

    return res.data as VerifyResponse;
  }

  /**
   * Settles a payment with the facilitator service
   *
   * @param payload - The payment payload to settle
   * @param paymentRequirements - The payment requirements for the settlement
   * @returns A promise that resolves to the settlement response
   */
  async function settle(
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const res = await axios.post(
      `${url}/settle`,
      {
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements),
      },
      {
        headers: createAuthHeaders ? (await createAuthHeaders()).settle : undefined,
      },
    );

    if (res.status !== 200) {
      throw new Error(`Failed to settle payment: ${res.statusText}`);
    }

    return res.data as SettleResponse;
  }

  return { verify, settle };
}

export const { verify, settle } = useFacilitator();
