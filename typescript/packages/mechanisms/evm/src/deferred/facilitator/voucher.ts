import { PaymentRequirements, VerifyResponse } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { DeferredVoucherPayload } from "../types";
import { deferredEscrowABI } from "../abi";
import { DEFERRED_ESCROW_ADDRESS } from "../constants";
import { getEvmChainId } from "../../utils";
import { multicall } from "../../multicall";
import * as Errors from "./errors";
import { serviceIdsEqual, verifyDeferredVoucherTypedData } from "./utils";

type ServiceState = {
  token: string;
  withdrawWindow: bigint;
  registered: boolean;
  payTo: string;
  unsettled: bigint;
  adminNonce: bigint;
};

type SubchannelState = {
  deposit: bigint;
  totalClaimed: bigint;
  nonce: bigint;
  withdrawRequestedAt: bigint;
};

/**
 * Verifies a voucher payload.
 *
 * Order: local `extra.serviceId` consistency → EIP-712 voucher signature → one Multicall3 batch
 * (`getService`, `getSubchannel`) → apply service/token/subchannel and voucher arithmetic gates.
 *
 * @param signer - The facilitator EVM signer.
 * @param payload - The deferred voucher payload.
 * @param requirements - The payment requirements.
 * @returns Verification result with payer and subchannel extras on success.
 */
export async function verifyVoucher(
  signer: FacilitatorEvmSigner,
  payload: DeferredVoucherPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const payer = payload.payer;
  const serviceId = payload.serviceId;
  const chainId = getEvmChainId(requirements.network);

  const extra = requirements.extra as { serviceId?: string } | undefined;

  if (!extra?.serviceId || !serviceIdsEqual(serviceId, extra.serviceId)) {
    return {
      isValid: false,
      invalidReason: extra?.serviceId ? Errors.ErrServiceIdMismatch : Errors.ErrMissingServiceId,
      payer,
    };
  }

  const voucherOk = await verifyDeferredVoucherTypedData(signer, payload, chainId);
  if (!voucherOk) {
    return { isValid: false, invalidReason: Errors.ErrInvalidVoucherSignature, payer };
  }

  const mcResults = await multicall(signer.readContract.bind(signer), [
    {
      address: getAddress(DEFERRED_ESCROW_ADDRESS),
      abi: deferredEscrowABI,
      functionName: "getService",
      args: [serviceId],
    },
    {
      address: getAddress(DEFERRED_ESCROW_ADDRESS),
      abi: deferredEscrowABI,
      functionName: "getSubchannel",
      args: [serviceId, getAddress(payer)],
    },
  ]);

  const [svcRes, subRes] = mcResults;
  if (svcRes.status === "failure" || subRes.status === "failure") {
    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType, payer };
  }

  const service = svcRes.result as ServiceState;
  const subchannel = subRes.result as SubchannelState;

  if (!service.registered) {
    return { isValid: false, invalidReason: Errors.ErrServiceNotFound, payer };
  }

  if (getAddress(service.token) !== getAddress(requirements.asset)) {
    return { isValid: false, invalidReason: Errors.ErrTokenMismatch, payer };
  }

  const remainingBalance = subchannel.deposit - subchannel.totalClaimed;
  if (remainingBalance <= 0n) {
    return { isValid: false, invalidReason: Errors.ErrSubchannelNotFound, payer };
  }

  const cumulativeAmount = BigInt(payload.cumulativeAmount);

  if (cumulativeAmount > subchannel.deposit) {
    return { isValid: false, invalidReason: Errors.ErrCumulativeAmountExceedsDeposit, payer };
  }

  if (cumulativeAmount <= subchannel.totalClaimed) {
    return { isValid: false, invalidReason: Errors.ErrCumulativeAmountBelowClaimed, payer };
  }

  if (BigInt(payload.nonce) <= subchannel.nonce) {
    return { isValid: false, invalidReason: Errors.ErrNonceNotIncreasing, payer };
  }

  return {
    isValid: true,
    payer,
    extra: {
      deposit: subchannel.deposit.toString(),
      totalClaimed: subchannel.totalClaimed.toString(),
      withdrawRequestedAt: Number(subchannel.withdrawRequestedAt),
    },
  };
}
