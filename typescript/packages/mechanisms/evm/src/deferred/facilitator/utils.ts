import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { DEFERRED_ESCROW_ADDRESS, DEFERRED_ESCROW_DOMAIN, voucherTypes } from "../constants";
import * as Errors from "./errors";

/**
 * Compare two `bytes32` service id hex strings (case-insensitive, optional 0x).
 *
 * @param a - First service id hex string.
 * @param b - Second value; compared only if it is a non-empty string.
 * @returns Whether the normalized ids are equal.
 */
export function serviceIdsEqual(a: `0x${string}`, b: unknown): boolean {
  if (typeof b !== "string" || b.length === 0) return false;
  const norm = (x: string) => {
    let s = x.toLowerCase();
    if (s.startsWith("0x")) s = s.slice(2);
    return `0x${s}`;
  };
  return norm(a) === norm(b);
}

/**
 * Same semantics as exact EIP-3009 verify: small buffer on `validBefore`, local clock.
 *
 * @param validAfter - Unix timestamp (seconds) after which the authorization is valid.
 * @param validBefore - Unix timestamp (seconds) before which the authorization is valid.
 * @returns Error code string if invalid, otherwise undefined.
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
 * Verifies an EIP-712 `Voucher` typed signature for DeferredEscrow (off-chain voucher).
 *
 * @param signer - Facilitator signer (verifyTypedData / ERC-1271 as implemented by the signer).
 * @param params - Voucher fields and signature from the payload.
 * @param params.serviceId - `bytes32` service identifier in the typed message.
 * @param params.payer - Address that signed the voucher (`message.payer`).
 * @param params.cumulativeAmount - Spend cap as a decimal string (uint256 in the typed message).
 * @param params.nonce - Voucher nonce (uint256 in the typed message).
 * @param params.signature - EIP-712 signature over the `Voucher` struct.
 * @param chainId - EIP-155 chain id for the escrow domain.
 * @returns True if the signature is valid for the reconstructed typed data.
 */
export async function verifyDeferredVoucherTypedData(
  signer: FacilitatorEvmSigner,
  params: {
    serviceId: `0x${string}`;
    payer: `0x${string}`;
    cumulativeAmount: string;
    nonce: number;
    signature: `0x${string}`;
  },
  chainId: number,
): Promise<boolean> {
  try {
    return await signer.verifyTypedData({
      address: getAddress(params.payer),
      domain: {
        ...DEFERRED_ESCROW_DOMAIN,
        chainId,
        verifyingContract: getAddress(DEFERRED_ESCROW_ADDRESS),
      },
      types: voucherTypes,
      primaryType: "Voucher",
      message: {
        serviceId: params.serviceId,
        payer: getAddress(params.payer),
        cumulativeAmount: BigInt(params.cumulativeAmount),
        nonce: BigInt(params.nonce),
      },
      signature: params.signature,
    });
  } catch {
    return false;
  }
}
