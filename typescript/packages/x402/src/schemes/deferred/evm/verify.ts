import { Account, Chain, Address, Hex, Transport, getAddress } from "viem";
import {
  DeferredEvmPayloadSignedVoucher,
  DeferredEvmPayloadSignedVoucherSchema,
  DeferredEvmPayloadVoucher,
  DeferredPaymentPayload,
  DeferredPaymentRequirements,
  DEFERRRED_SCHEME,
  DeferredEscrowFlushAuthorizationSigned,
} from "../../../types/verify/schemes/deferred";
import { DeferredEscrowDepositAuthorization, VerifyResponse } from "../../../types";
import { getNetworkId } from "../../../shared";
import {
  verifyDepositAuthorizationInnerSignature,
  verifyPermitSignature,
  verifyVoucherSignature,
  verifyFlushAuthorizationSignature,
} from "./sign";
import { ConnectedClient } from "../../../types/shared/evm/wallet";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";
import { VoucherStore } from "./store";

/**
 * Data returned from the getVerificationData contract call
 */
export type OnchainVerificationData = {
  voucherOutstanding: bigint;
  voucherCollectable: bigint;
  balance: bigint;
  availableBalance: bigint;
  allowance: bigint;
  nonce: bigint;
  isDepositNonceUsed: boolean;
};

/**
 * Verifies the payment payload satisfies the payment requirements.
 *
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns Verification result
 */
export function verifyPaymentRequirements(
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: DeferredPaymentRequirements,
): VerifyResponse {
  // scheme
  if (paymentPayload.scheme !== DEFERRRED_SCHEME) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_scheme`,
    };
  }
  if (paymentRequirements.scheme !== DEFERRRED_SCHEME) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_requirements_scheme`,
    };
  }

  // network
  if (paymentPayload.network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_network_mismatch`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  let chainId: number;
  try {
    chainId = getNetworkId(paymentRequirements.network);
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network_unsupported`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (chainId !== paymentPayload.payload.voucher.chainId) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_chain_id`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // maxAmountRequired
  const requiredVoucherValueAggregate =
    paymentRequirements.extra.type === "new"
      ? BigInt(paymentRequirements.maxAmountRequired)
      : BigInt(paymentRequirements.maxAmountRequired) +
        BigInt(paymentRequirements.extra.voucher.valueAggregate);
  if (BigInt(paymentPayload.payload.voucher.valueAggregate) < requiredVoucherValueAggregate) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // payTo
  if (getAddress(paymentPayload.payload.voucher.seller) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // asset
  if (paymentPayload.payload.voucher.asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies the voucher structrure is valid and continuity is maintained
 *
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns Verification result
 */
export function verifyVoucherContinuity(
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: DeferredPaymentRequirements,
): VerifyResponse {
  const voucher = paymentPayload.payload.voucher;

  // expiration
  const now = Math.floor(Date.now() / 1000);
  if (voucher.expiry < now) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // timestamp
  if (voucher.timestamp > now) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_timestamp_too_early",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // -- New voucher --
  if (paymentRequirements.extra.type === "new") {
    if (voucher.nonce != 0) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_non_zero_nonce",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    if (BigInt(voucher.valueAggregate) === 0n) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_zero_value_aggregate",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  // -- Aggregation voucher --
  if (paymentRequirements.extra.type === "aggregation") {
    const previousVoucher = paymentRequirements.extra.voucher;
    // id
    if (voucher.id.toLowerCase() !== previousVoucher.id.toLowerCase()) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_id_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // buyer
    if (getAddress(voucher.buyer) !== getAddress(previousVoucher.buyer)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_buyer_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // seller
    if (getAddress(voucher.seller) !== getAddress(previousVoucher.seller)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_seller_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // valueAggregate
    if (BigInt(voucher.valueAggregate) < BigInt(previousVoucher.valueAggregate)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value_aggregate_decreasing",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // asset
    if (getAddress(voucher.asset) !== getAddress(previousVoucher.asset)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_asset_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // timestamp
    if (voucher.timestamp < previousVoucher.timestamp) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_timestamp_decreasing",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // nonce
    if (voucher.nonce !== previousVoucher.nonce + 1) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_nonce_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // escrow
    if (getAddress(voucher.escrow) !== getAddress(previousVoucher.escrow)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_escrow_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // chainId
    if (voucher.chainId !== previousVoucher.chainId) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_chain_id_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // expiry
    if (voucher.expiry < previousVoucher.expiry) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_expiry_decreasing",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies the voucher signature is valid
 *
 * - ✅ Verify the voucher signature is valid
 * - ✅ Verify the voucher signer is the buyer
 *
 * @param voucher - The voucher to verify
 * @param signature - The signature of the voucher
 * @returns Verification result
 */
export async function verifyVoucherSignatureWrapper(
  voucher: DeferredEvmPayloadVoucher,
  signature: string,
): Promise<VerifyResponse> {
  const voucherSignatureIsValid = await verifyVoucherSignature(
    voucher,
    signature as Hex,
    voucher.buyer as Address,
  );
  if (!voucherSignatureIsValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies a voucher is available in the voucher store
 *
 * This function will retrieve voucher (id,nonce) and verify it
 * against the voucher provided.
 *
 * @param voucher - The voucher to verify
 * @param signature - The signature of the voucher
 * @param id - The id of the voucher
 * @param nonce - The nonce of the voucher
 * @param voucherStore - The voucher store to use for verification
 * @returns Verification result
 */
export async function verifyVoucherAvailability(
  voucher: DeferredEvmPayloadVoucher,
  signature: string,
  id: string,
  nonce: number,
  voucherStore: VoucherStore,
): Promise<VerifyResponse> {
  const storeVoucher = await voucherStore.getVoucher(id, nonce);
  if (!storeVoucher) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_found",
      payer: voucher.buyer,
    };
  }
  const signedVoucher = DeferredEvmPayloadSignedVoucherSchema.parse({
    ...voucher,
    signature,
  });

  const duplicateResult = verifyVoucherDuplicate(signedVoucher, storeVoucher);
  if (!duplicateResult.isValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_found_not_duplicate",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies two vouchers are the same, down to the signature
 *
 * @param newVoucher - The new voucher to verify
 * @param previousVoucher - The previous voucher to verify against
 * @returns Verification result
 */
export function verifyVoucherDuplicate(
  newVoucher: DeferredEvmPayloadSignedVoucher,
  previousVoucher: DeferredEvmPayloadSignedVoucher,
): VerifyResponse {
  if (
    newVoucher.id.toLowerCase() === previousVoucher.id.toLowerCase() &&
    getAddress(newVoucher.buyer) === getAddress(previousVoucher.buyer) &&
    getAddress(newVoucher.seller) === getAddress(previousVoucher.seller) &&
    newVoucher.valueAggregate === previousVoucher.valueAggregate &&
    getAddress(newVoucher.asset) === getAddress(previousVoucher.asset) &&
    newVoucher.timestamp === previousVoucher.timestamp &&
    newVoucher.nonce === previousVoucher.nonce &&
    getAddress(newVoucher.escrow) === getAddress(previousVoucher.escrow) &&
    newVoucher.chainId === previousVoucher.chainId &&
    newVoucher.expiry === previousVoucher.expiry &&
    newVoucher.signature.toLowerCase() === previousVoucher.signature.toLowerCase()
  ) {
    return {
      isValid: true,
    };
  }

  return {
    isValid: false,
    invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
    payer: newVoucher.buyer,
  };
}

/**
 * Fetches all on-chain verification data in a single contract call
 *
 * @param client - The client to use for the onchain state verification
 * @param voucher - The voucher to verify
 * @param depositAuthNonce - The deposit authorization nonce (or undefined to use zero bytes)
 * @returns On-chain verification data or VerifyResponse with error
 */
export async function getOnchainVerificationData<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  voucher: DeferredEvmPayloadVoucher,
  depositAuthNonce?: string,
): Promise<{ data?: OnchainVerificationData } & VerifyResponse> {
  try {
    depositAuthNonce =
      depositAuthNonce || "0x0000000000000000000000000000000000000000000000000000000000000000";

    const [
      voucherOutstanding,
      voucherCollectable,
      balance,
      availableBalance,
      allowance,
      permitNonce,
      isDepositNonceUsed,
    ] = await client.readContract({
      address: voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "getVerificationData",
      args: [
        {
          id: voucher.id as Hex,
          buyer: voucher.buyer as Address,
          seller: voucher.seller as Address,
          valueAggregate: BigInt(voucher.valueAggregate),
          asset: voucher.asset as Address,
          timestamp: BigInt(voucher.timestamp),
          nonce: BigInt(voucher.nonce),
          escrow: voucher.escrow as Address,
          chainId: BigInt(voucher.chainId),
          expiry: BigInt(voucher.expiry),
        },
        depositAuthNonce as Hex,
      ],
    });

    return {
      isValid: true,
      data: {
        voucherOutstanding,
        voucherCollectable,
        balance,
        availableBalance,
        allowance,
        nonce: permitNonce,
        isDepositNonceUsed,
      },
    };
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_verification_data",
    };
  }
}

/**
 * Verifies the onchain state allows the payment to be settled. Accepts an optional deposit authorization, treating
 * the associated funds as additional balance in the escrow deposit.
 *
 * - ✅ (on-chain) Verifies buyer has sufficient asset balance
 *
 * @param voucher - The voucher to verify
 * @param depositAuthorization - An already verified deposit authorization, used to consider additional balance to the buyer's account
 * @param onchainData - Pre-fetched onchain verification data
 * @param ignoreThawing - Whether to consider thawing funds in the escrow account
 * @returns Verification result
 */
export function verifyVoucherOnchainState(
  voucher: DeferredEvmPayloadVoucher,
  depositAuthorization: DeferredEscrowDepositAuthorization | undefined,
  onchainData: OnchainVerificationData,
  ignoreThawing: boolean = false,
): VerifyResponse {
  // By default we ignore funds that are thawing, however when settling a voucher those should be considered
  const balance = ignoreThawing ? onchainData.balance : onchainData.availableBalance;

  // If a deposit authorization is provided we consider it as additional balance in the escrow deposit
  // Note that we do not verify the validity of the deposit authorization here
  const authorizationBalance = depositAuthorization
    ? BigInt(depositAuthorization.depositAuthorization.amount)
    : 0n;

  // Verify buyer has sufficient asset balance
  if (balance + authorizationBalance < onchainData.voucherOutstanding) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies the onchain state allows a deposit authorization to be executed.
 *
 * - ✅ (on-chain) Verifies escrow can pull from the buyer's account based on their allowance (or permit)
 * - ✅ (on-chain) If there is a permit, it verifies permit nonce is valid
 * - ✅ (on-chain) Verifies deposit authorization nonce has not been used
 *
 * @param voucher - The voucher to verify
 * @param depositAuthorization - The deposit authorization to verify
 * @param onchainData - Pre-fetched onchain verification data
 * @returns Verification result
 */
export function verifyDepositAuthorizationOnchainState(
  voucher: DeferredEvmPayloadVoucher,
  depositAuthorization: DeferredEscrowDepositAuthorization,
  onchainData: OnchainVerificationData,
): VerifyResponse {
  // Verify escrow can pull from the buyer's account based on their allowance (or permit)
  const allowance = depositAuthorization.permit
    ? BigInt(depositAuthorization.permit.value)
    : onchainData.allowance;

  if (BigInt(depositAuthorization.depositAuthorization.amount) > allowance) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_insufficient_allowance",
      payer: depositAuthorization.depositAuthorization.buyer,
    };
  }

  // Verify permit nonce if permit is present
  if (depositAuthorization.permit) {
    if (onchainData.nonce !== BigInt(depositAuthorization.permit.nonce)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_permit_nonce_invalid",
        payer: voucher.buyer,
      };
    }
  }

  // Verify deposit authorization nonce hasn't been used
  if (onchainData.isDepositNonceUsed) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_nonce_invalid",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies a deposit authorization is valid. Checks the signature of the permit and the deposit authorization.
 *
 * @param voucher - The voucher that the deposit authorization is escrowing for
 * @param depositAuthorization - The deposit authorization to verify
 * @returns Verification result
 */
export async function verifyDepositAuthorizationSignatureAndContinuity(
  voucher: DeferredEvmPayloadVoucher,
  depositAuthorization: DeferredEscrowDepositAuthorization,
): Promise<VerifyResponse> {
  const { permit, depositAuthorization: depositAuthorizationInner } = depositAuthorization;

  const DATE_NOW = Math.floor(Date.now() / 1000);
  const DATE_ONE_WEEK = 604800;

  // Verify the permit signature
  if (permit) {
    const isPermitValid = await verifyPermitSignature(
      permit,
      permit.signature as Hex,
      permit.owner as Address,
      voucher.chainId,
      voucher.asset as Address, // This ensures the permit is for the voucher's asset
    );
    if (!isPermitValid) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_permit_signature",
        payer: permit.owner,
      };
    }

    // Verify permit continuity
    if (
      getAddress(permit.owner) !== getAddress(voucher.buyer) ||
      getAddress(permit.spender) !== getAddress(voucher.escrow) ||
      permit.deadline < DATE_NOW + DATE_ONE_WEEK
    ) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_permit_continuity",
        payer: permit.owner,
      };
    }
  }

  // Verify deposit authorization signature
  const isDepositAuthorizationValid = await verifyDepositAuthorizationInnerSignature(
    depositAuthorizationInner,
    depositAuthorizationInner.signature as Hex,
    depositAuthorizationInner.buyer as Address,
    voucher.chainId,
    voucher.escrow as Address,
  );
  if (!isDepositAuthorizationValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_signature",
      payer: depositAuthorizationInner.buyer,
    };
  }

  // Verify deposit authorization continuity
  if (
    getAddress(depositAuthorizationInner.buyer) !== getAddress(voucher.buyer) ||
    getAddress(depositAuthorizationInner.seller) !== getAddress(voucher.seller) ||
    getAddress(depositAuthorizationInner.asset) !== getAddress(voucher.asset) ||
    depositAuthorizationInner.expiry < DATE_NOW + DATE_ONE_WEEK
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_deposit_authorization_continuity",
      payer: depositAuthorizationInner.buyer,
    };
  }

  // Verify permit owner matches the deposit authorization buyer
  if (permit) {
    if (getAddress(depositAuthorizationInner.buyer) !== getAddress(permit.owner)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_deposit_authorization_buyer_mismatch",
        payer: depositAuthorizationInner.buyer,
      };
    }
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies a flush authorization is valid. Checks the signature of the flush authorization.
 *
 * @param flushAuthorization - The flush authorization to verify
 * @param escrow - The address of the escrow contract
 * @param chainId - The chain ID
 * @returns Verification result
 */
export async function verifyFlushAuthorization(
  flushAuthorization: DeferredEscrowFlushAuthorizationSigned,
  escrow: Address,
  chainId: number,
): Promise<VerifyResponse> {
  // Verify flush authorization signature
  const isFlushAuthorizationValid = await verifyFlushAuthorizationSignature(
    flushAuthorization,
    flushAuthorization.signature as Hex,
    flushAuthorization.buyer as Address,
    chainId,
    escrow,
  );
  if (!isFlushAuthorizationValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_flush_authorization_signature",
      payer: flushAuthorization.buyer,
    };
  }

  // Verify flush authorization continuity
  const DATE_NOW = Math.floor(Date.now() / 1000);
  if (flushAuthorization.expiry < DATE_NOW) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_flush_authorization_continuity",
      payer: flushAuthorization.buyer,
    };
  }

  return {
    isValid: true,
  };
}
