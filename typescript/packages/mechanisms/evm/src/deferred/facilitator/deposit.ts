import { PaymentRequirements, VerifyResponse, SettleResponse } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { DeferredDepositPayload } from "../types";
import { deferredEscrowABI, erc20BalanceOfABI } from "../abi";
import { DEFERRED_ESCROW_ADDRESS, receiveAuthorizationTypes } from "../constants";
import { getEvmChainId } from "../../utils";
import { multicall } from "../../multicall";
import * as Errors from "./errors";
import {
  erc3009AuthorizationTimeInvalidReason,
  serviceIdsEqual,
  verifyDeferredVoucherTypedData,
} from "./utils";

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
 * Verifies a deferred deposit payload.
 *
 * Execution order (EIP-6492 factory parsing and `receiveWithAuthorization` simulation are intentionally not part of facilitator verify):
 *
 * 1. **Local checks** (no escrow or ERC-20 balance reads): scheme/network are enforced in
 *    {@link DeferredEvmScheme.verify}. Here: `extra.serviceId` vs `deposit.serviceId`, deposit↔voucher
 *    `serviceId` / `payer`, EIP-3009-only path, `extra.name` / `version`, ERC-3009 authorization presence,
 *    authorization time windows vs local clock.
 * 2. **Signatures**: EIP-712 `ReceiveWithAuthorization` (token domain) + DeferredEscrow `Voucher` — before any
 *    batched chain reads so bad signatures do not trigger a multicall round-trip.
 * 3. **One Multicall3 batch**: `getService(serviceId)`, `getSubchannel(serviceId, payer)`, `balanceOf(payer)` on
 *    `requirements.asset`.
 * 4. **Apply results**: service registration, token match, balance, subchannel arithmetic, voucher/state gates.
 *
 * @param signer - The facilitator EVM signer.
 * @param payload - The deferred deposit payload.
 * @param requirements - The payment requirements.
 * @returns Verification result with payer and subchannel extras on success.
 */
export async function verifyDeposit(
  signer: FacilitatorEvmSigner,
  payload: DeferredDepositPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const { deposit, voucher } = payload;
  const payer = deposit.payer;
  const serviceId = deposit.serviceId;
  const chainId = getEvmChainId(requirements.network);

  const extra = requirements.extra as
    | {
      serviceId?: string;
      name?: string;
      version?: string;
      assetTransferMethod?: string;
    }
    | undefined;

  if (!extra?.serviceId || !serviceIdsEqual(serviceId, extra.serviceId)) {
    return {
      isValid: false,
      invalidReason: extra?.serviceId ? Errors.ErrServiceIdMismatch : Errors.ErrMissingServiceId,
      payer,
    };
  }

  if (!serviceIdsEqual(voucher.serviceId, serviceId)) {
    return { isValid: false, invalidReason: Errors.ErrDepositVoucherMismatch, payer };
  }

  if (getAddress(voucher.payer) !== getAddress(payer)) {
    return { isValid: false, invalidReason: Errors.ErrDepositVoucherMismatch, payer };
  }

  const transferMethod = extra.assetTransferMethod ?? "eip3009";
  if (transferMethod !== "eip3009") {
    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType, payer };
  }

  const auth = deposit.authorization.erc3009Authorization;
  if (!auth) {
    return { isValid: false, invalidReason: Errors.ErrErc3009AuthorizationRequired, payer };
  }

  if (!extra.name || !extra.version) {
    return { isValid: false, invalidReason: Errors.ErrMissingEip712Domain, payer };
  }

  const validAfter = BigInt(auth.validAfter);
  const validBefore = BigInt(auth.validBefore);
  const timeInvalid = erc3009AuthorizationTimeInvalidReason(validAfter, validBefore);
  if (timeInvalid) {
    return { isValid: false, invalidReason: timeInvalid, payer };
  }

  let receiveAuthOk = false;
  try {
    receiveAuthOk = await signer.verifyTypedData({
      address: getAddress(payer),
      domain: {
        name: extra.name,
        version: extra.version,
        chainId,
        verifyingContract: getAddress(requirements.asset),
      },
      types: receiveAuthorizationTypes,
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: getAddress(payer),
        to: getAddress(DEFERRED_ESCROW_ADDRESS),
        value: BigInt(deposit.amount),
        validAfter,
        validBefore,
        nonce: auth.nonce,
      },
      signature: auth.signature,
    });
  } catch {
    receiveAuthOk = false;
  }

  if (!receiveAuthOk) {
    return { isValid: false, invalidReason: Errors.ErrInvalidReceiveAuthorizationSignature, payer };
  }

  const voucherOk = await verifyDeferredVoucherTypedData(signer, voucher, chainId);
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
    {
      address: getAddress(requirements.asset),
      abi: erc20BalanceOfABI,
      functionName: "balanceOf",
      args: [getAddress(payer)],
    },
  ]);

  const [svcRes, subRes, balRes] = mcResults;
  if (svcRes.status === "failure" || subRes.status === "failure" || balRes.status === "failure") {
    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType, payer };
  }

  const service = svcRes.result as ServiceState;
  const subchannel = subRes.result as SubchannelState;
  const balance = balRes.result as bigint;

  if (!service.registered) {
    return { isValid: false, invalidReason: Errors.ErrServiceNotFound, payer };
  }

  if (getAddress(service.token) !== getAddress(requirements.asset)) {
    return { isValid: false, invalidReason: Errors.ErrTokenMismatch, payer };
  }

  const depositAmount = BigInt(deposit.amount);

  if (balance < depositAmount) {
    return { isValid: false, invalidReason: Errors.ErrInsufficientBalance, payer };
  }

  const effectiveDeposit = subchannel.deposit + depositAmount;
  const cumulativeAmount = BigInt(voucher.cumulativeAmount);

  if (cumulativeAmount > effectiveDeposit) {
    return { isValid: false, invalidReason: Errors.ErrCumulativeAmountExceedsDeposit, payer };
  }

  if (cumulativeAmount <= subchannel.totalClaimed) {
    return { isValid: false, invalidReason: Errors.ErrCumulativeAmountBelowClaimed, payer };
  }

  if (BigInt(voucher.nonce) <= subchannel.nonce) {
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

/**
 * Settles a deposit by calling depositWithERC3009 on the escrow contract.
 *
 * @param signer - The facilitator EVM signer.
 * @param payload - The deferred deposit payload.
 * @param requirements - The payment requirements.
 * @returns Settlement outcome with transaction hash and updated subchannel state.
 */
export async function settleDeposit(
  signer: FacilitatorEvmSigner,
  payload: DeferredDepositPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const { deposit } = payload;
  const payer = deposit.payer;
  const auth = deposit.authorization.erc3009Authorization;

  if (!auth) {
    return {
      success: false,
      errorReason: Errors.ErrInvalidPayloadType,
      errorMessage: "Only erc3009Authorization is currently supported",
      transaction: "",
      network: requirements.network,
      payer,
    };
  }

  const verified = await verifyDeposit(signer, payload, requirements);
  if (!verified.isValid) {
    return {
      success: false,
      errorReason: verified.invalidReason ?? Errors.ErrInvalidPayloadType,
      transaction: "",
      network: requirements.network,
      payer: verified.payer,
    };
  }

  try {
    const tx = await signer.writeContract({
      address: getAddress(DEFERRED_ESCROW_ADDRESS),
      abi: deferredEscrowABI,
      functionName: "depositWithERC3009",
      args: [
        deposit.serviceId,
        getAddress(payer),
        BigInt(deposit.amount),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce,
        auth.signature,
      ],
    });

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrDepositTransactionFailed,
        transaction: tx,
        network: requirements.network,
        payer,
      };
    }

    return {
      success: true,
      transaction: tx,
      network: requirements.network,
      payer,
      amount: requirements.amount,
      extra: {
        deposit: (
          BigInt(String(verified.extra?.deposit ?? "0")) + BigInt(deposit.amount)
        ).toString(),
        totalClaimed: verified.extra?.totalClaimed ?? "0",
        withdrawRequestedAt: Number(verified.extra?.withdrawRequestedAt ?? 0),
      },
    };
  } catch {
    return {
      success: false,
      errorReason: Errors.ErrDepositTransactionFailed,
      transaction: "",
      network: requirements.network,
      payer,
    };
  }
}
