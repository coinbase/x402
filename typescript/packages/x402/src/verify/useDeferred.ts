import { toJsonSafe } from "../shared/json";
import {
  DeferredErrorResponse,
  DeferredVoucherCollectionsResponse,
  DeferredVoucherResponse,
  DeferredVouchersResponse,
  FacilitatorConfig,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../types";

/**
 * Creates a facilitator client for interacting with the X402 payment deferred facilitator service
 *
 * @param facilitator - The facilitator config to use.
 * @returns An object containing functions for interacting with a deferred facilitator
 */
export function useDeferredFacilitator(facilitator: FacilitatorConfig) {
  /**
   * Fetches a voucher by its id and nonce.
   *
   * @param id - The id of the voucher to fetch
   * @param nonce - The nonce of the voucher to fetch
   * @returns The voucher
   */
  async function getVoucher(id: string, nonce: number): Promise<DeferredVoucherResponse> {
    const response = await fetch(`${facilitator.url}/deferred/vouchers/${id}/${nonce}`);
    const responseJson = (await response.json()) as DeferredVoucherResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  /**
   * Fetches a voucher series by its id, sorted by nonce in descending order.
   *
   * @param id - The id of the voucher to fetch
   * @param pagination - The pagination parameters
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset to start from
   * @returns The vouchers
   */
  async function getVoucherSeries(
    id: string,
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<DeferredVouchersResponse> {
    const { limit, offset } = pagination;

    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    const queryString = params.toString();

    const response = await fetch(
      `${facilitator.url}/deferred/vouchers/${id}${queryString ? `?${queryString}` : ""}`,
    );
    const responseJson = (await response.json()) as DeferredVouchersResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  /**
   * Fetches vouchers for a given buyer and seller
   *
   * @param query - The query parameters
   * @param query.buyer - The buyer address
   * @param query.seller - The seller address
   * @param query.latest - Whether to return the latest voucher for each id
   * @param pagination - The pagination parameters
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset to start from
   * @returns The vouchers
   */
  async function getVouchers(
    query: {
      buyer: string;
      seller: string;
      latest?: boolean;
    },
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<DeferredVouchersResponse> {
    const { buyer, seller, latest } = query;
    const { limit, offset } = pagination;

    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    if (latest !== undefined) params.append("latest", latest.toString());
    if (buyer !== undefined) params.append("buyer", buyer);
    if (seller !== undefined) params.append("seller", seller);
    const queryString = params.toString();

    const response = await fetch(
      `${facilitator.url}/deferred/vouchers${queryString ? `?${queryString}` : ""}`,
    );
    const responseJson = (await response.json()) as DeferredVouchersResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  /**
   * Fetches the latest available voucher for a given buyer and seller
   *
   * @param buyer - The buyer address
   * @param seller - The seller address
   * @returns The voucher
   */
  async function getAvailableVoucher(
    buyer: string,
    seller: string,
  ): Promise<DeferredVoucherResponse> {
    const response = await fetch(
      `${facilitator.url}/deferred/vouchers/available/${buyer}/${seller}`,
    );
    const responseJson = (await response.json()) as DeferredVoucherResponse;

    // If the voucher is not found we don't throw, clients should just create a new voucher from scratch
    if (response.status === 404) {
      return {
        error: "voucher_not_found",
      };
    }

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch available voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson;
  }

  /**
   * Stores a voucher in the facilitator. Before storing, it verifies the payload and payment
   * requirements, equivalent to calling POST /verify
   *
   * @param payload - The payment payload
   * @param paymentRequirements - The payment requirements
   * @returns The voucher response
   */
  async function storeVoucher(
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse | DeferredVoucherResponse> {
    const response = await fetch(`${facilitator.url}/deferred/vouchers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements),
      }),
    });

    const responseJson = (await response.json()) as VerifyResponse | DeferredVoucherResponse;

    if (response.status !== 201 || "error" in responseJson || "invalidReason" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        (responseJson as VerifyResponse).invalidReason ||
        `Failed to verify and store voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson as VerifyResponse | DeferredVoucherResponse;
  }

  /**
   * Verifies a voucher signature and onchain state.
   *
   * @param id - The id of the voucher to verify
   * @param nonce - The nonce of the voucher to verify
   * @returns The verification result
   */
  async function verifyVoucher(id: string, nonce: number): Promise<VerifyResponse> {
    const response = await fetch(`${facilitator.url}/deferred/vouchers/${id}/${nonce}/verify`, {
      method: "POST",
    });
    const responseJson = await response.json();

    if (response.status !== 200) {
      const errorMessage = `Failed to verify voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson as VerifyResponse;
  }

  /**
   * Settles a voucher by its id and nonce.
   *
   * @param id - The id of the voucher to settle
   * @param nonce - The nonce of the voucher to settle
   * @returns The settlement result
   */
  async function settleVoucher(id: string, nonce: number): Promise<SettleResponse> {
    const response = await fetch(`${facilitator.url}/deferred/vouchers/${id}/${nonce}/settle`, {
      method: "POST",
    });
    const responseJson = await response.json();

    if (response.status !== 200) {
      const errorMessage = `Failed to settle voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson as SettleResponse;
  }

  /**
   * Fetches the latest voucher for a given buyer and seller
   *
   * @param query - The query parameters
   * @param query.id - The id of the voucher
   * @param query.nonce - The nonce of the voucher
   * @param pagination - The pagination parameters
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset to start from
   * @returns The vouchers
   */
  async function getVoucherCollections(
    query: {
      id?: string;
      nonce?: number;
    },
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<DeferredVoucherCollectionsResponse> {
    const { id, nonce } = query;
    const { limit, offset } = pagination;

    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    if (id !== undefined) params.append("id", id);
    if (nonce !== undefined) params.append("nonce", nonce.toString());
    const queryString = params.toString();

    const response = await fetch(
      `${facilitator.url}/deferred/vouchers/collections${queryString ? `?${queryString}` : ""}`,
    );
    const responseJson = (await response.json()) as DeferredVoucherCollectionsResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher collections: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  return {
    getVoucher,
    getVouchers,
    getVoucherSeries,
    getAvailableVoucher,
    storeVoucher,
    verifyVoucher,
    settleVoucher,
    getVoucherCollections,
  };
}
