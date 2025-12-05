/**
 * Facilitator – NEAR /settle (Skeleton)
 * TODO:
 *  - Wrap SignedDelegateAction into Action::Delegate tx
 *  - Sign with relayer, submit via RPC, return tx hash
 *  - Idempotency on (sender, nonce)
 */

export interface SettleInput {
  network: "near-mainnet" | "near-testnet";
  signedDelegateAction_b64: string; // NEP-366 path
}

export interface SettleOk {
  ok: true;
  txHash: string;
  relayer: string;
  network: "near-mainnet" | "near-testnet";
}

export type SettleFail = { ok: false; reason: string; code: string };

/**
 * Settles a NEAR payment by submitting a signed delegate action to the network
 *
 * @param _ - The settlement input containing network and signed delegate action
 * @returns Settlement result with transaction hash or failure reason
 */
export async function settleNearExact(_: SettleInput): Promise<SettleOk | SettleFail> {
  // TODO: real settlement
  return {
    ok: true,
    txHash: "TODO_tx_hash",
    relayer: "facilitator.testnet",
    network: _.network,
  };
}
