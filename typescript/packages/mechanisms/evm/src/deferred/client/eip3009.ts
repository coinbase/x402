import { PaymentRequirements, PaymentPayloadResult } from "@x402/core/types";
import { getAddress } from "viem";
import { ClientEvmSigner } from "../../signer";
import { DeferredDepositPayload } from "../types";
import { DEFERRED_ESCROW_ADDRESS, receiveAuthorizationTypes } from "../constants";
import { createNonce, getEvmChainId } from "../../utils";
import { signVoucher } from "./voucher";

/**
 * Creates a deposit payload with EIP-3009 ReceiveWithAuthorization
 * (to = escrow contract) plus the first voucher.
 *
 * @param signer - The client EVM signer.
 * @param x402Version - The x402 protocol version for the payload envelope.
 * @param paymentRequirements - Requirements including asset, timeouts, and EIP-712 domain in `extra`.
 * @param depositAmount - Token amount to deposit (smallest units).
 * @param cumulativeAmount - New cumulative charged amount for the voucher.
 * @param voucherNonce - Nonce for the signed voucher.
 * @returns The x402 version and typed deferred deposit payload.
 */
export async function createDeferredEIP3009DepositPayload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  depositAmount: string,
  cumulativeAmount: string,
  voucherNonce: number,
): Promise<PaymentPayloadResult> {
  const serviceId = paymentRequirements.extra?.serviceId as `0x${string}`;
  if (!serviceId) {
    throw new Error("Missing serviceId in paymentRequirements.extra");
  }

  const nonce = createNonce();
  const now = Math.floor(Date.now() / 1000);
  const chainId = getEvmChainId(paymentRequirements.network);

  if (!paymentRequirements.extra?.name || !paymentRequirements.extra?.version) {
    throw new Error(
      `EIP-712 domain parameters (name, version) are required in payment requirements for asset ${paymentRequirements.asset}`,
    );
  }

  const { name, version } = paymentRequirements.extra;

  const signature = await signer.signTypedData({
    domain: {
      name,
      version,
      chainId,
      verifyingContract: getAddress(paymentRequirements.asset),
    },
    types: receiveAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: getAddress(signer.address),
      to: getAddress(DEFERRED_ESCROW_ADDRESS),
      value: BigInt(depositAmount),
      validAfter: BigInt(now - 600),
      validBefore: BigInt(now + paymentRequirements.maxTimeoutSeconds),
      nonce,
    },
  });

  const voucher = await signVoucher(
    signer,
    serviceId,
    cumulativeAmount,
    voucherNonce,
    paymentRequirements.network,
  );

  const payload: DeferredDepositPayload = {
    type: "deposit",
    deposit: {
      serviceId,
      payer: signer.address,
      amount: depositAmount,
      authorization: {
        erc3009Authorization: {
          validAfter: (now - 600).toString(),
          validBefore: (now + paymentRequirements.maxTimeoutSeconds).toString(),
          nonce,
          signature,
        },
      },
    },
    voucher,
  };

  return {
    x402Version,
    payload,
  };
}
