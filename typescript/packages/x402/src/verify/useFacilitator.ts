import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../types/verify";
import axios from "axios";
import { createAuthHeader, toJsonSafe } from "../shared";
import { Resource } from "../types";
import { config } from "dotenv";

config();

export type CreateHeaders = () => Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
}>;

/**
 * Creates a CDP auth header for the facilitator service
 *
 * @param apiKeyId - The CDP API key ID
 * @param apiKeySecret - The CDP API key secret
 * @returns A function that returns the auth headers
 */
export function createCdpAuthHeaders(apiKeyId?: string, apiKeySecret?: string): CreateHeaders {
  apiKeyId = apiKeyId ?? process.env.CDP_API_KEY_ID;
  apiKeySecret = apiKeySecret ?? process.env.CDP_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      "Missing environment variables: CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set when using default facilitator",
    );
  }

  return async () => {
    return {
      verify: {
        Authorization: await createAuthHeader(
          apiKeyId,
          apiKeySecret,
          "api.cdp.coinbase.com",
          "/platform/v2/x402/verify",
        ),
      },
      settle: {
        Authorization: await createAuthHeader(
          apiKeyId,
          apiKeySecret,
          "api.cdp.coinbase.com",
          "/platform/v2/x402/settle",
        ),
      },
    };
  };
}

/**
 * Creates a facilitator client for interacting with the X402 payment facilitator service
 *
 * @param url - The base URL of the facilitator service (defaults to "https://x402.org/facilitator")
 * @param createAuthHeaders - Optional function to create an auth header for the facilitator service. If using Coinbase's facilitator, use the createAuthHeaders function.
 * @returns An object containing verify and settle functions for interacting with the facilitator
 */
export function useFacilitator(
  url: Resource = "https://x402.org/facilitator",
  createAuthHeaders?: CreateHeaders, // TODO: default to createCdpAuthHeaders() once the `url` default is updated to `https://api.cdp.coinbase.com/platform/v2/x402`
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
        payload: toJsonSafe(payload),
        details: toJsonSafe(paymentRequirements),
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
        payload: toJsonSafe(payload),
        details: toJsonSafe(paymentRequirements),
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
