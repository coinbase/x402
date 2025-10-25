/**
 * Represents a Hedera account address in the standard format.
 * 
 * Hedera addresses follow the pattern `0.0.{number}` where:
 * - `0.0.0` represents HBAR (native currency)
 * - `0.0.{shard}.{realm}.{account}` represents account addresses
 * - `0.0.{tokenId}` represents token IDs
 * 
 * @example
 * ```typescript
 * const accountId: HederaAddress = "0.0.123456";
 * const hbarId: HederaAddress = "0.0.0";
 * const tokenId: HederaAddress = "0.0.429274";
 * ```
 */
export type HederaAddress = `0.0.${number}`;