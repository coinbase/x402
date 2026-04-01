import { getAddress } from "viem";
import { ClientEvmSigner } from "../../signer";
import { DEFERRED_ESCROW_ADDRESS, DEFERRED_ESCROW_DOMAIN, voucherTypes } from "../constants";
import { DeferredVoucherFields } from "../types";
import { getEvmChainId } from "../../utils";

/**
 * Signs an EIP-712 Voucher typed data using the escrow contract domain.
 *
 * @param signer - The client EVM signer.
 * @param serviceId - The registered service id.
 * @param cumulativeAmount - Cumulative amount string in smallest units.
 * @param nonce - Voucher nonce.
 * @param network - The x402 network name for chain id resolution.
 * @returns The voucher fields including the signature.
 */
export async function signVoucher(
  signer: ClientEvmSigner,
  serviceId: `0x${string}`,
  cumulativeAmount: string,
  nonce: number,
  network: string,
): Promise<DeferredVoucherFields> {
  const chainId = getEvmChainId(network);

  const signature = await signer.signTypedData({
    domain: {
      ...DEFERRED_ESCROW_DOMAIN,
      chainId,
      verifyingContract: getAddress(DEFERRED_ESCROW_ADDRESS),
    },
    types: voucherTypes,
    primaryType: "Voucher",
    message: {
      serviceId,
      payer: getAddress(signer.address),
      cumulativeAmount: BigInt(cumulativeAmount),
      nonce: BigInt(nonce),
    },
  });

  return {
    serviceId,
    payer: signer.address,
    cumulativeAmount,
    nonce,
    signature,
  };
}
