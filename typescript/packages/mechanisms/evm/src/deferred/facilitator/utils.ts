import { getAddress, verifyTypedData as viemVerifyTypedData } from "viem";
import type { PaymentRequirements } from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { BATCH_SETTLEMENT_ADDRESS, BATCH_SETTLEMENT_DOMAIN, voucherTypes } from "../constants";
import type { ChannelConfig } from "../types";
import { computeChannelId } from "../utils";
import * as Errors from "./errors";

/**
 * Case-insensitive comparison of two channel id hex strings.
 *
 * @param a - First channel id.
 * @param b - Second channel id (may be any unknown value).
 * @returns `true` when both ids refer to the same channel.
 */
export function channelIdsEqual(a: `0x${string}`, b: unknown): boolean {
  if (typeof b !== "string" || b.length === 0) return false;
  const norm = (x: string) => {
    let s = x.toLowerCase();
    if (s.startsWith("0x")) s = s.slice(2);
    return `0x${s}`;
  };
  return norm(a) === norm(b);
}

/**
 * Validates the time window of an ERC-3009 `ReceiveWithAuthorization`.
 *
 * @param validAfter - Earliest unix timestamp the authorization is valid (in seconds).
 * @param validBefore - Latest unix timestamp before which the authorization is valid.
 * @returns An error code string if the time window is invalid, otherwise `undefined`.
 */
export function erc3009AuthorizationTimeInvalidReason(
  validAfter: bigint,
  validBefore: bigint,
): string | undefined {
  const now = Math.floor(Date.now() / 1000);
  if (validBefore < BigInt(now + 6)) return Errors.ErrValidBeforeExpired;
  if (validAfter > BigInt(now)) return Errors.ErrValidAfterInFuture;
  return undefined;
}

/**
 * Dual-path voucher signature verification.
 *
 * When `payerAuthorizer` is a non-zero address, the signature is verified off-chain via
 * ECDSA recovery against that address (no RPC call).  When `payerAuthorizer` is `address(0)`,
 * verification falls back to an ERC-1271 `isValidSignature` call against the payer contract
 * (smart-wallet path).
 *
 * @param signer - Facilitator signer providing `verifyTypedData` (may issue RPC for ERC-1271).
 * @param params - Voucher fields and authorizer addresses needed for verification.
 * @param params.channelId - EIP-712 voucher channel id (`bytes32` hex).
 * @param params.maxClaimableAmount - Max cumulative claimable amount as a decimal string.
 * @param params.payerAuthorizer - Address that signed the voucher; zero address selects ERC-1271 verification.
 * @param params.payer - Payer contract address (used for ERC-1271).
 * @param params.signature - EIP-712 signature bytes over the voucher.
 * @param chainId - Numeric EVM chain id for the EIP-712 domain.
 * @returns `true` when the voucher signature is valid.
 */
export async function verifyDeferredVoucherTypedData(
  signer: FacilitatorEvmSigner,
  params: {
    channelId: `0x${string}`;
    maxClaimableAmount: string;
    payerAuthorizer: `0x${string}`;
    payer: `0x${string}`;
    signature: `0x${string}`;
  },
  chainId: number,
): Promise<boolean> {
  const domain = {
    ...BATCH_SETTLEMENT_DOMAIN,
    chainId,
    verifyingContract: getAddress(BATCH_SETTLEMENT_ADDRESS),
  };
  const message = {
    channelId: params.channelId,
    maxClaimableAmount: BigInt(params.maxClaimableAmount),
  };

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  try {
    if (params.payerAuthorizer !== zeroAddress) {
      const recovered = await viemVerifyTypedData({
        address: getAddress(params.payerAuthorizer),
        domain,
        types: voucherTypes,
        primaryType: "Voucher",
        message,
        signature: params.signature,
      });
      return recovered;
    }

    return await signer.verifyTypedData({
      address: getAddress(params.payer),
      domain,
      types: voucherTypes,
      primaryType: "Voucher",
      message,
      signature: params.signature,
    });
  } catch {
    return false;
  }
}

/**
 * Validates that a {@link ChannelConfig} is consistent with the claimed `channelId` and
 * the server's {@link PaymentRequirements}.
 *
 * @param config - The channel configuration from the payload.
 * @param channelId - The `channelId` claimed in the payload.
 * @param requirements - Server payment requirements to cross-check against.
 * @returns An error code string if validation fails, otherwise `undefined`.
 */
export function validateChannelConfig(
  config: ChannelConfig,
  channelId: `0x${string}`,
  requirements: PaymentRequirements,
): string | undefined {
  const computedId = computeChannelId(config);
  if (computedId.toLowerCase() !== channelId.toLowerCase()) {
    return Errors.ErrChannelIdMismatch;
  }

  if (getAddress(config.receiver) !== getAddress(requirements.payTo)) {
    return Errors.ErrReceiverMismatch;
  }

  const extra = requirements.extra as Record<string, unknown> | undefined;

  if (extra?.receiverAuthorizer) {
    if (getAddress(config.receiverAuthorizer) !== getAddress(extra.receiverAuthorizer as string)) {
      return Errors.ErrReceiverAuthorizerMismatch;
    }
  }

  if (getAddress(config.token) !== getAddress(requirements.asset)) {
    return Errors.ErrTokenMismatch;
  }

  if (extra?.withdrawDelay !== undefined && config.withdrawDelay !== Number(extra.withdrawDelay)) {
    return Errors.ErrWithdrawDelayMismatch;
  }

  return undefined;
}
