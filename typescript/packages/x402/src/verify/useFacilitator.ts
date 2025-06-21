import { toJsonSafe } from "../shared";
import { FacilitatorConfig } from "../types";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../types/verify";

const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

export type CreateHeaders = () => Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
}>;

/**
 * Creates a facilitator client for interacting with the X402 payment facilitator service
 *
 * @param facilitator - The facilitator config to use. If not provided, the default facilitator will be used.
 * @returns An object containing verify and settle functions for interacting with the facilitator
 */
export function useFacilitator(facilitator?: FacilitatorConfig) {
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
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.verify };
    }

    const res = await fetch(`${url}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements),
      }),
    });

    if (res.status !== 200) {
      throw new Error(`Failed to verify payment: ${res.statusText}`);
    }

    const data = await res.json();
    return data as VerifyResponse;
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
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.settle };
    }

    const res = await fetch(`${url}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements),
      }),
    });

    if (res.status !== 200) {
      const text = res.statusText;
      throw new Error(`Failed to settle payment: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data as SettleResponse;
  }

  /**
   * Gets the address of the facilitator that will be used to pay the network fee.
   *
   * @param facilitator - The facilitator config to use. If not provided, the default facilitator will be used.
   * @returns A promise that resolves to the fee payer's address.
   */
  async function getFeePayer(facilitator?: FacilitatorConfig): Promise<string> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const res = await fetch(`${url}/fee-payer`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (res.status !== 200) {
      throw new Error(`Failed to get fee payer: ${res.statusText}`);
    }

    const data = await res.json();
    return data as string;
  }

  return { verify, settle, getFeePayer };
}
