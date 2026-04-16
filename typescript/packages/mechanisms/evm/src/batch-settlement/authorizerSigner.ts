import { getAddress } from "viem";
import type { AuthorizerSigner, BatchSettlementVoucherClaim } from "./types";
import {
  BATCH_SETTLEMENT_ADDRESS,
  BATCH_SETTLEMENT_DOMAIN,
  claimBatchTypes,
  refundTypes,
} from "./constants";
import { computeChannelId } from "./utils";
import { getEvmChainId } from "../utils";

/**
 * Signs a `ClaimBatch` EIP-712 digest for `claimWithSignature()`.
 *
 * @param signer - Authorizer signer holding the `receiverAuthorizer` key.
 * @param claims - Voucher claims to include in the batch.
 * @param network - CAIP-2 network identifier (e.g. `"eip155:84532"`).
 * @returns EIP-712 signature over `ClaimBatch(ClaimEntry[] claims)`.
 */
export async function signClaimBatch(
  signer: AuthorizerSigner,
  claims: BatchSettlementVoucherClaim[],
  network: string,
): Promise<`0x${string}`> {
  const chainId = getEvmChainId(network);

  const claimEntries = claims.map(c => ({
    channelId: computeChannelId(c.voucher.channel),
    maxClaimableAmount: BigInt(c.voucher.maxClaimableAmount),
    totalClaimed: BigInt(c.totalClaimed),
  }));

  return signer.signTypedData({
    domain: {
      ...BATCH_SETTLEMENT_DOMAIN,
      chainId,
      verifyingContract: getAddress(BATCH_SETTLEMENT_ADDRESS),
    },
    types: claimBatchTypes as unknown as Record<string, Array<{ name: string; type: string }>>,
    primaryType: "ClaimBatch",
    message: {
      claims: claimEntries,
    },
  });
}

/**
 * Signs a `Refund` EIP-712 digest for `refundWithSignature()`.
 *
 * @param signer - Authorizer signer holding the `receiverAuthorizer` key.
 * @param channelId - Channel to authorize refund for.
 * @param amount - Refund amount (capped to unclaimed escrow on-chain).
 * @param nonce - Must match on-chain `refundNonce(channelId)`.
 * @param network - CAIP-2 network identifier (e.g. `"eip155:84532"`).
 * @returns EIP-712 signature over `Refund(channelId, nonce, amount)`.
 */
export async function signRefund(
  signer: AuthorizerSigner,
  channelId: `0x${string}`,
  amount: string,
  nonce: string,
  network: string,
): Promise<`0x${string}`> {
  const chainId = getEvmChainId(network);

  return signer.signTypedData({
    domain: {
      ...BATCH_SETTLEMENT_DOMAIN,
      chainId,
      verifyingContract: getAddress(BATCH_SETTLEMENT_ADDRESS),
    },
    types: refundTypes as unknown as Record<string, Array<{ name: string; type: string }>>,
    primaryType: "Refund",
    message: {
      channelId,
      nonce: BigInt(nonce),
      amount: BigInt(amount),
    },
  });
}
