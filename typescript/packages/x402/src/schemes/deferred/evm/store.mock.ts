import {
  DeferredEvmPayloadSignedVoucher,
  DeferredEvmPayloadVoucher,
  DeferredVoucherCollection,
} from "../../../types";
import { VoucherStore, VoucherStoreActionResult } from "./store";

/**
 * In-memory implementation of the VoucherStore interface for testing and development
 *
 * This class provides a non-persistent storage solution for X402 deferred EVM vouchers.
 * It maintains vouchers and their collection records in memory arrays, making it suitable
 * for unit tests, integration tests, and local development environments.
 *
 * WARNING: do not use in production
 * This voucher store implementation does not persist data between application restarts
 * and might not be feature complete.
 */
export class InMemoryVoucherStore extends VoucherStore {
  public vouchers: Array<DeferredEvmPayloadSignedVoucher> = [];
  public collections: Array<DeferredVoucherCollection> = [];

  /**
   * Get a voucher by its id and nonce
   *
   * @param id - The id of the voucher
   * @param nonce - The nonce of the voucher
   * @returns The voucher or null if not found
   */
  async getVoucher(id: string, nonce?: number): Promise<DeferredEvmPayloadSignedVoucher | null> {
    if (nonce !== undefined) {
      return this.vouchers.find(voucher => voucher.id === id && voucher.nonce === nonce) ?? null;
    }

    return (
      this.vouchers
        .filter(voucher => voucher.id === id)
        .sort((a, b) => b.nonce - a.nonce)
        .at(0) ?? null
    );
  }

  /**
   * Get a series of vouchers by their id
   *
   * @param id - The id of the voucher series
   * @param pagination - The pagination options
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset of the first voucher to return
   * @returns The vouchers in the series
   */
  async getVoucherSeries(
    id: string,
    pagination: {
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>> {
    const { limit = 100, offset = 0 } = pagination;
    return this.vouchers
      .filter(voucher => voucher.id === id)
      .sort((a, b) => b.nonce - a.nonce)
      .slice(offset, offset + limit);
  }

  /**
   * Get all vouchers matching the query
   *
   * @param query - The query options
   * @param query.buyer - The buyer's address
   * @param query.seller - The seller's address
   * @param query.latest - Whether to return only the latest voucher per series
   * @param pagination - The pagination options
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset of the first voucher to return
   * @returns The vouchers matching the query
   */
  async getVouchers(
    query: {
      buyer?: string | undefined;
      seller?: string | undefined;
      latest?: boolean | undefined;
    },
    pagination: {
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>> {
    const { limit = 100, offset = 0 } = pagination;
    const { buyer, latest, seller } = query;

    // Filter vouchers by buyer and/or seller
    let filteredVouchers = this.vouchers.filter(voucher => {
      if (buyer && voucher.buyer !== buyer) return false;
      if (seller && voucher.seller !== seller) return false;
      return true;
    });

    // If latest=true, return only the latest voucher per series ID
    if (latest) {
      const voucherMap = new Map<string, DeferredEvmPayloadSignedVoucher>();

      filteredVouchers.forEach(voucher => {
        const existing = voucherMap.get(voucher.id);
        if (!existing || voucher.nonce > existing.nonce) {
          voucherMap.set(voucher.id, voucher);
        }
      });

      filteredVouchers = Array.from(voucherMap.values());
    }

    // Sort by nonce descending, then by timestamp descending
    return filteredVouchers
      .sort((a, b) => {
        if (b.nonce !== a.nonce) return b.nonce - a.nonce;
        return b.timestamp - a.timestamp;
      })
      .slice(offset, offset + limit);
  }

  /**
   * Get the "latest available" voucher for a given buyer and seller
   *
   * @param buyer - The buyer's address
   * @param seller - The seller's address
   * @returns The available voucher or null if none available
   */
  async getAvailableVoucher(
    buyer: string,
    seller: string,
  ): Promise<DeferredEvmPayloadSignedVoucher | null> {
    // Get all vouchers for this buyer/seller pair
    const vouchers = this.vouchers.filter(
      voucher => voucher.buyer === buyer && voucher.seller === seller,
    );

    if (vouchers.length === 0) return null;

    // Group by series ID and find the highest nonce per series
    const voucherMap = new Map<string, DeferredEvmPayloadSignedVoucher>();
    vouchers.forEach(voucher => {
      const existing = voucherMap.get(voucher.id);
      if (!existing || voucher.nonce > existing.nonce) {
        voucherMap.set(voucher.id, voucher);
      }
    });

    // Sort by timestamp descending to get the most recent
    const latestVouchers = Array.from(voucherMap.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );

    return latestVouchers.at(0) ?? null;
  }

  /**
   * Store a voucher
   *
   * @param voucher - The voucher to store
   * @returns The result of the operation
   */
  async storeVoucher(voucher: DeferredEvmPayloadSignedVoucher): Promise<VoucherStoreActionResult> {
    if (this.vouchers.some(v => v.id === voucher.id && v.nonce === voucher.nonce)) {
      return { success: false, error: "Voucher already exists" };
    }

    this.vouchers.push(voucher);
    return { success: true };
  }

  /**
   * Settle a voucher
   *
   * @param voucher - The voucher to settle
   * @param txHash - The transaction hash of the settlement
   * @param amount - The amount of the settlement
   * @returns The result of the operation
   */
  async settleVoucher(
    voucher: DeferredEvmPayloadVoucher,
    txHash: string,
    amount: bigint,
  ): Promise<VoucherStoreActionResult> {
    this.collections.push({
      voucherId: voucher.id,
      voucherNonce: voucher.nonce,
      transactionHash: txHash,
      collectedAmount: amount.toString(),
      asset: voucher.asset,
      chainId: voucher.chainId,
      collectedAt: Date.now(),
    });
    return { success: true };
  }

  /**
   * Get the voucher collections for a given voucher id and nonce
   *
   * @param query - The query options
   * @param query.id - The id of the voucher
   * @param query.nonce - The nonce of the voucher
   * @param pagination - The pagination options
   * @param pagination.limit - The maximum number of collections to return
   * @param pagination.offset - The offset of the first collection to return
   * @returns The voucher collections
   */
  async getVoucherCollections(
    query: {
      id?: string | undefined;
      nonce?: number | undefined;
    },
    pagination: {
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ): Promise<Array<DeferredVoucherCollection>> {
    const { limit = 100, offset = 0 } = pagination;
    const { id, nonce } = query;

    return this.collections
      .filter(collection => {
        if (id && collection.voucherId !== id) return false;
        if (nonce !== undefined && collection.voucherNonce !== nonce) return false;
        return true;
      })
      .slice(offset, offset + limit);
  }
}

export const voucherStore = new InMemoryVoucherStore();
