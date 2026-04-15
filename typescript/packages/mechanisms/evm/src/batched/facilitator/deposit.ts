import { PaymentRequirements, VerifyResponse, SettleResponse } from "@x402/core/types";
import { getAddress, encodeAbiParameters, keccak256 } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { BatchedDepositPayload } from "../types";
import { batchSettlementABI, erc20BalanceOfABI } from "../abi";
import {
  BATCH_SETTLEMENT_ADDRESS,
  ERC3009_DEPOSIT_COLLECTOR_ADDRESS,
  receiveAuthorizationTypes,
} from "../constants";
import { getEvmChainId } from "../../utils";
import { multicall } from "../../multicall";
import * as Errors from "./errors";
import {
  erc3009AuthorizationTimeInvalidReason,
  validateChannelConfig,
  verifyBatchedVoucherTypedData,
} from "./utils";

/**
 * Verifies a deposit payload (ERC-3009 authorization + voucher) without executing any
 * on-chain transaction.
 *
 * Performs the following validations:
 * - Token in channelConfig matches the payment requirements asset.
 * - ERC-3009 authorization is present and its time window is valid.
 * - `ReceiveWithAuthorization` signature is valid (payer → contract).
 * - Accompanying voucher signature is valid (ECDSA or ERC-1271).
 * - Payer has sufficient token balance for the deposit.
 * - Resulting `maxClaimableAmount` does not exceed effective balance (existing + deposit).
 *
 * @param signer - Facilitator signer for on-chain reads and signature verification.
 * @param payload - The full deposit payload including channelConfig, amount, authorization, and voucher.
 * @param requirements - Server payment requirements (asset, EIP-712 domain info, timeout, etc.).
 * @returns A {@link VerifyResponse} with channel state in `extra` on success.
 */
export async function verifyDeposit(
  signer: FacilitatorEvmSigner,
  payload: BatchedDepositPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const { deposit, voucher } = payload;
  const config = deposit.channelConfig;
  const payer = config.payer;
  const chainId = getEvmChainId(requirements.network);

  const configErr = validateChannelConfig(config, voucher.channelId, requirements);
  if (configErr) {
    return { isValid: false, invalidReason: configErr, payer };
  }

  const extra = requirements.extra as
    | { name?: string; version?: string; assetTransferMethod?: string }
    | undefined;

  const transferMethod = extra?.assetTransferMethod ?? "eip3009";
  if (transferMethod !== "eip3009") {
    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType, payer };
  }

  const auth = deposit.authorization.erc3009Authorization;
  if (!auth) {
    return { isValid: false, invalidReason: Errors.ErrErc3009AuthorizationRequired, payer };
  }

  if (!extra?.name || !extra?.version) {
    return { isValid: false, invalidReason: Errors.ErrMissingEip712Domain, payer };
  }

  const validAfter = BigInt(auth.validAfter);
  const validBefore = BigInt(auth.validBefore);
  const timeInvalid = erc3009AuthorizationTimeInvalidReason(validAfter, validBefore);
  if (timeInvalid) {
    return { isValid: false, invalidReason: timeInvalid, payer };
  }

  const erc3009Nonce = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [voucher.channelId, BigInt(auth.salt)],
    ),
  );

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
        to: getAddress(ERC3009_DEPOSIT_COLLECTOR_ADDRESS),
        value: BigInt(deposit.amount),
        validAfter,
        validBefore,
        nonce: erc3009Nonce,
      },
      signature: auth.signature,
    });
  } catch {
    receiveAuthOk = false;
  }

  if (!receiveAuthOk) {
    return { isValid: false, invalidReason: Errors.ErrInvalidReceiveAuthorizationSignature, payer };
  }

  const voucherOk = await verifyBatchedVoucherTypedData(
    signer,
    {
      channelId: voucher.channelId,
      maxClaimableAmount: voucher.maxClaimableAmount,
      payerAuthorizer: config.payerAuthorizer,
      payer: config.payer,
      signature: voucher.signature,
    },
    chainId,
  );
  if (!voucherOk) {
    return { isValid: false, invalidReason: Errors.ErrInvalidVoucherSignature, payer };
  }

  const mcResults = await multicall(signer.readContract.bind(signer), [
    {
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "channels",
      args: [voucher.channelId],
    },
    {
      address: getAddress(requirements.asset),
      abi: erc20BalanceOfABI,
      functionName: "balanceOf",
      args: [getAddress(payer)],
    },
    {
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "pendingWithdrawals",
      args: [voucher.channelId],
    },
    {
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "refundNonce",
      args: [voucher.channelId],
    },
  ]);

  const [chRes, balRes, wdRes, rnRes] = mcResults;
  if (
    chRes.status === "failure" ||
    balRes.status === "failure" ||
    wdRes.status === "failure" ||
    rnRes.status === "failure"
  ) {
    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType, payer };
  }

  const [chBalance, chTotalClaimed] = chRes.result as [bigint, bigint];
  const payerBalance = balRes.result as bigint;
  const [, wdInitiatedAt] = wdRes.result as [bigint, bigint];
  const refundNonceVal = rnRes.result as bigint;
  const depositAmount = BigInt(deposit.amount);

  if (payerBalance < depositAmount) {
    return { isValid: false, invalidReason: Errors.ErrInsufficientBalance, payer };
  }

  const effectiveBalance = chBalance + depositAmount;
  const maxClaimableAmount = BigInt(voucher.maxClaimableAmount);

  if (maxClaimableAmount > effectiveBalance) {
    return { isValid: false, invalidReason: Errors.ErrCumulativeExceedsBalance, payer };
  }

  if (maxClaimableAmount <= chTotalClaimed) {
    return { isValid: false, invalidReason: Errors.ErrCumulativeAmountBelowClaimed, payer };
  }

  return {
    isValid: true,
    payer,
    extra: {
      channelId: voucher.channelId,
      balance: chBalance.toString(),
      totalClaimed: chTotalClaimed.toString(),
      withdrawRequestedAt: Number(wdInitiatedAt),
      refundNonce: refundNonceVal.toString(),
    },
  };
}

/**
 * Executes an ERC-3009 deposit on-chain by calling `deposit` with the
 * ERC3009DepositCollector on the batched contract.
 *
 * The deposit is first verified via {@link verifyDeposit}; if invalid the returned
 * {@link SettleResponse} will have `success: false` with the verification reason.
 *
 * @param signer - Facilitator signer used to submit the on-chain transaction.
 * @param payload - The deposit payload (channelConfig, amount, authorization, voucher).
 * @param requirements - Server payment requirements.
 * @returns A {@link SettleResponse} with the transaction hash and updated channel state in `extra`.
 */
export async function settleDeposit(
  signer: FacilitatorEvmSigner,
  payload: BatchedDepositPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const { deposit, voucher } = payload;
  const config = deposit.channelConfig;
  const payer = config.payer;
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
    const configTuple = {
      payer: getAddress(config.payer),
      payerAuthorizer: getAddress(config.payerAuthorizer),
      receiver: getAddress(config.receiver),
      receiverAuthorizer: getAddress(config.receiverAuthorizer),
      token: getAddress(config.token),
      withdrawDelay: config.withdrawDelay,
      salt: config.salt,
    };

    const salt = BigInt(auth.salt);
    const collectorData = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      [BigInt(auth.validAfter), BigInt(auth.validBefore), salt, auth.signature],
    );

    const tx = await signer.writeContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "deposit",
      args: [
        configTuple,
        BigInt(deposit.amount),
        getAddress(ERC3009_DEPOSIT_COLLECTOR_ADDRESS),
        collectorData,
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
        channelId: voucher.channelId,
        balance: (
          BigInt(String(verified.extra?.balance ?? "0")) + BigInt(deposit.amount)
        ).toString(),
        totalClaimed: verified.extra?.totalClaimed ?? "0",
        withdrawRequestedAt: 0,
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
