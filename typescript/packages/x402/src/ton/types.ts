// TON-specific types for x402
export type TonNetworkId = `ton:${"mainnet" | "testnet"}`; // CAIP-2: ton:mainnet, ton:testnet

export type TonAssetNative = {
  kind: "native";
  symbol: "TON";
  decimals: 9; // fixed for TON
};

export type TonAssetJetton = {
  kind: "jetton";
  master: string; // jetton master (workchain:address) - CAIP-19: ton:master_address
  symbol?: string;
  decimals: number; // usually 6 for USDT, but read from metadata when possible
};

export type TonAsset = TonAssetNative | TonAssetJetton;

export type TonExactPayment = {
  network: TonNetworkId;
  to: string; // merchant/facilitator address (raw or user-friendly)
  amountAtomic: string; // bigint-as-string
  memo: string; // invoiceId / paymentIntentId
  validUntil: number;
  asset: TonAsset;
};

// Normalized Jetton transfer event shape used by verifier and RPC layer
export type TonJettonTransferEvent = {
  txHash: string;
  master: string;
  amount: string; // atomic units as string
  memo: string; // forward_payload decoded as string
  to?: string; // optional destination (jetton wallet may differ)
};

export interface TonRpcLike {
  /**
   * Finds an incoming native TON transfer to `to` that matches `memo`.
   * Provider APIs differ; this method normalizes a minimal shape.
   *
   * @param to - Recipient address.
   * @param memo - Expected on-chain comment (memo).
   * @returns Matching transaction or null.
   */
  findIncomingByMemo(
    to: string,
    memo: string,
  ): Promise<{
    hash: string;
    to: string;
    amount: string;
    comment: string;
  } | null>;

  /**
   * Loads a native transaction by its hash.
   *
   * @param hash - Transaction hash.
   * @returns Normalized transaction or null.
   */
  getTxByHash(hash: string): Promise<{
    hash: string;
    to: string;
    amount: string;
    comment: string;
  } | null>;

  /**
   * Query jetton transfers to a given address with filters.
   *
   * @param to - Destination address to query transfers for.
   * @param filter - Filter options for jetton transfers.
   * @param filter.master - Jetton master contract address to match.
   * @param filter.memo - Memo string to match in the transfer payload.
   * @returns A matching jetton transfer object or null if not found.
   */
  getJettonTransferTo(
    to: string,
    filter: { master: string; memo: string },
  ): Promise<TonJettonTransferEvent | null>;

  /**
   * Get the current finality depth (number of blocks required for confirmation).
   *
   * @returns The required confirmation depth as a number.
   */
  getFinalityDepth?(): Promise<number>;
}
