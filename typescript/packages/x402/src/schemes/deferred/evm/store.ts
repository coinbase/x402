import {
  DeferredEvmPayloadSignedVoucher,
  DeferredEvmPayloadVoucher,
  DeferredVoucherCollection,
} from "../../../types/verify/schemes/deferred";

export type VoucherStoreActionResult = {
  success: boolean;
  error?: string;
};

/**
 * Voucher store interface for X402 deferred EVM schemes
 *
 * This abstract class defines the interface for storing, retrieving, and managing vouchers
 * in the deferred payment system. Implementations should provide persistent storage
 * with proper transaction safety.
 *
 * Key concepts:
 * - A `voucher` is uniquely identified by the pair (id, nonce).
 * - A `voucher series` is a set of vouchers that share the same id but with different nonces.
 * - A `voucher collection` is a record of a voucher being settled on-chain. Multiple collections can be
 * associated with a single voucher.
 *
 */
export abstract class VoucherStore {
  /**
   * Retrieve a voucher by id and nonce
   *
   * @param id - The voucher series identifier (64-character hex string)
   * @param nonce - Optional. The specific voucher nonce to retrieve, defaults to the latest voucher in the series.
   * @returns The voucher if found, null otherwise
   *
   * @example
   * ```typescript
   * // Get specific voucher
   * const voucher = await store.getVoucher("0x123...", 5);
   *
   * // Get latest voucher in series
   * const latest = await store.getVoucher("0x123...");
   * ```
   */
  abstract getVoucher(id: string, nonce?: number): Promise<DeferredEvmPayloadSignedVoucher | null>;

  /**
   * Retrieve all vouchers in a series by id
   *
   * @param id - The voucher series identifier
   * @param pagination - Pagination options
   * @returns Array of vouchers sorted by nonce (descending)
   *
   * Implementation requirements:
   * - Results must be sorted by nonce in descending order (newest first)
   * - Must support pagination with limit/offset
   * - Should return empty array if series doesn't exist
   * - Default limit should be reasonable (e.g., 100) if not specified
   *
   * @example
   * ```typescript
   * // Get first 10 vouchers in series
   * const vouchers = await store.getVoucherSeries("0x123...", { limit: 10, offset: 0 });
   * ```
   */
  abstract getVoucherSeries(
    id: string,
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>>;

  /**
   * Query vouchers with filtering and pagination
   *
   * @param query - Filter criteria
   * @param pagination - Pagination options
   * @returns Array of vouchers matching the criteria
   *
   * Query Options:
   * - buyer: Filter by buyer's address
   * - seller: Filter by seller's address
   * - latest: If true, return only the highest nonce voucher per series
   *
   * Behavior:
   * - When latest=true: returns one voucher per series (the one with highest nonce)
   * - When latest=false: returns all vouchers matching buyer/seller criteria
   * - Results should be sorted by nonce descending, then by timestamp descending
   *
   * @example
   * ```typescript
   * // Get all latest vouchers for a buyer
   * const latest = await store.getVouchers(
   *   { buyer: "0x123...", latest: true },
   *   { limit: 50 }
   * );
   *
   * // Get all historical vouchers for a pair
   * const history = await store.getVouchers(
   *   { buyer: "0x123...", seller: "0x456...", latest: false },
   *   { limit: 100, offset: 0 }
   * );
   * ```
   */
  abstract getVouchers(
    query: {
      buyer?: string;
      seller?: string;
      latest?: boolean;
    },
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>>;

  /**
   * Get the "latest available" voucher for a given buyer and seller.
   *
   * @param buyer - The buyer's address
   * @param seller - The seller's address
   * @returns The available voucher or null if none available
   *
   * The voucher to return must follow the following selection criteria:
   * 1. Voucher matches the provided buyer and seller addresses
   * 2. Voucher has the highest nonce for its series
   * 3. Among multiple matching series, select the one with the most recent timestamp
   *
   * @example
   * ```typescript
   * // Get the latest available voucher for a given buyer and seller
   * const voucher = await store.getAvailableVoucher("0xbuyer...", "0xseller...");
   * if (voucher) {
   *   // Process payment...
   * }
   * ```
   */
  abstract getAvailableVoucher(
    buyer: string,
    seller: string,
  ): Promise<DeferredEvmPayloadSignedVoucher | null>;

  /**
   * Store a new voucher in the system
   *
   * @param voucher - The signed voucher to store
   * @returns Result indicating success/failure
   *
   * @example
   * ```typescript
   * const result = await store.storeVoucher(signedVoucher, signature);
   * if (result.success) {
   *   console.log("Voucher stored successfully");
   * } else {
   *   console.error("Failed to store voucher:", result.error);
   * }
   * ```
   */
  abstract storeVoucher(
    voucher: DeferredEvmPayloadSignedVoucher,
  ): Promise<VoucherStoreActionResult>;

  /**
   * Record the settlement of a voucher on-chain
   *
   * @param voucher - The voucher that was settled
   * @param txHash - The transaction hash of the settlement
   * @param amount - The actual amount collected (as determined by on-chain logic)
   * @returns Result indicating success/failure
   *
   * @example
   * ```typescript
   * // Record settlement
   * const result = await store.settleVoucher(voucher, "0xabc123...", 1000000n);
   * ```
   */
  abstract settleVoucher(
    voucher: DeferredEvmPayloadVoucher,
    txHash: string,
    amount: bigint,
  ): Promise<VoucherStoreActionResult>;

  /**
   * Get the collections for a voucher
   *
   * @param query - The voucher id and nonce
   * @param pagination - Pagination options
   * @returns The collections for the voucher
   *
   * @example
   * ```typescript
   * // Get the collections for a voucher
   * const collections = await store.getVoucherCollections({ id: "0x123...", nonce: 5 }, { limit: 10, offset: 0 });
   * ```
   */
  abstract getVoucherCollections(
    query: {
      id?: string;
      nonce?: number;
    },
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<DeferredVoucherCollection>>;
}
