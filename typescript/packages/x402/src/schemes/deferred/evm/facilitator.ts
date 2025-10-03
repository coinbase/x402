import { Account, Address, Chain, Transport, Hex, parseEventLogs } from "viem";
import { ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SchemeContext,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import {
  DeferredEscrowDepositAuthorization,
  DeferredEvmPayloadVoucher,
  DeferredPaymentPayloadSchema,
  DeferredPaymentRequirementsSchema,
  DeferredSchemeContextSchema,
} from "../../../types/verify/schemes/deferred";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";
import {
  verifyPaymentRequirements,
  verifyVoucherSignature,
  verifyOnchainState,
  verifyVoucherContinuity,
  verifyVoucherAvailability,
} from "./verify";
import { VoucherStore } from "./store";

/**
 * Verifies a payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - ✅ Validates the payment payload satisfies the payment requirements
 * - ✅ Validates the voucher structure is valid and continuity is maintained
 * - ✅ Validates the voucher signature is valid
 * - ✅ Validates the previous voucher is available for aggregation vouchers
 * - ✅ Validates the onchain state allows the payment to be settled
 *
 * @param client - The public client used for blockchain interactions
 * @param paymentPayload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @param schemeContext - Scheme specific context for verification
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  schemeContext: SchemeContext,
): Promise<VerifyResponse> {
  paymentPayload = DeferredPaymentPayloadSchema.parse(paymentPayload);
  paymentRequirements = DeferredPaymentRequirementsSchema.parse(paymentRequirements);
  const { voucherStore } = DeferredSchemeContextSchema.parse(schemeContext.deferred);

  // Verify the payment payload matches the payment requirements
  const requirementsResult = verifyPaymentRequirements(paymentPayload, paymentRequirements);
  if (!requirementsResult.isValid) {
    return requirementsResult;
  }

  // Verify voucher structure and continuity
  const continuityResult = verifyVoucherContinuity(paymentPayload, paymentRequirements);
  if (!continuityResult.isValid) {
    return continuityResult;
  }

  // Verify voucher signature is valid
  const signatureResult = await verifyVoucherSignature(
    paymentPayload.payload.voucher,
    paymentPayload.payload.signature,
  );
  if (!signatureResult.isValid) {
    return signatureResult;
  }

  // Verify previous voucher availability
  if (paymentRequirements.extra.type === "aggregation") {
    const previousVoucherResult = await verifyVoucherAvailability(
      paymentRequirements.extra.voucher,
      paymentRequirements.extra.signature,
      paymentRequirements.extra.voucher.id,
      paymentRequirements.extra.voucher.nonce,
      voucherStore,
    );
    if (!previousVoucherResult.isValid) {
      return previousVoucherResult;
    }
  }

  // Verify the onchain state allows the payment to be settled
  const onchainResult = await verifyOnchainState(
    client,
    paymentPayload.payload.voucher,
    paymentPayload.payload.depositAuthorization,
  );
  if (!onchainResult.isValid) {
    return onchainResult;
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer: paymentPayload.payload.voucher.buyer,
  };
}

/**
 * Settles a payment by executing a collect transaction on the deferred escrow contract
 *
 * This function executes the collect transaction using a signed voucher.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transfer parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @param schemeContext - Scheme specific context for verification
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  schemeContext: SchemeContext,
): Promise<SettleResponse> {
  // Verify payload is a deferred payment payload - plus type assert to DeferredPaymentPayload
  paymentPayload = DeferredPaymentPayloadSchema.parse(paymentPayload);
  const { voucherStore } = DeferredSchemeContextSchema.parse(schemeContext.deferred);

  // re-verify to ensure the payment is still valid
  // TODO: there is some verification duplication as some of the verification steps are repeated later when calling settleVoucher
  const valid = await verify(wallet, paymentPayload, paymentRequirements, schemeContext);
  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  const { voucher, signature, depositAuthorization } = paymentPayload.payload;
  const response = await settleVoucher(
    wallet,
    voucher,
    signature,
    voucherStore,
    depositAuthorization,
  );

  return {
    ...response,
    network: paymentPayload.network,
  };
}

/**
 * Executes the voucher settlement transaction. The facilitator can invoke this function directly to settle a
 * voucher in a deferred manner, outside of the x402 handshake.
 *
 * NOTE: Because of its deferred nature, payment requirements are not available when settling in deferred manner
 * which means some of the verification steps cannot be repeated before settlement. However, as long as the voucher
 * has a matching signature and the on chain verification is successful the voucher should be safe to settle.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param voucher - The voucher to settle
 * @param signature - The signature of the voucher
 * @param voucherStore - The voucher store to use for verification
 * @param depositAuthorization - A deposit authorization to use for verification purposes
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settleVoucher<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  voucher: DeferredEvmPayloadVoucher,
  signature: string,
  voucherStore: VoucherStore,
  depositAuthorization?: DeferredEscrowDepositAuthorization,
): Promise<SettleResponse> {
  // Verify the voucher signature
  const signatureResult = await verifyVoucherSignature(voucher, signature);
  if (!signatureResult.isValid) {
    return {
      success: false,
      errorReason: signatureResult.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
      transaction: "",
      payer: voucher.buyer,
    };
  }

  // Verify the voucher exists in the store
  const storeResult = await verifyVoucherAvailability(
    voucher,
    signature,
    voucher.id,
    voucher.nonce,
    voucherStore,
  );
  if (!storeResult.isValid) {
    return {
      success: false,
      errorReason: storeResult.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
      transaction: "",
      payer: voucher.buyer,
    };
  }

  // Verify the onchain state allows the payment to be settled
  const valid = await verifyOnchainState(wallet, voucher, depositAuthorization);
  if (!valid.isValid) {
    return {
      success: false,
      errorReason: valid.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
      transaction: "",
      payer: voucher.buyer,
    };
  }

  let tx = "";
  try {
    tx = await wallet.writeContract({
      address: voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "collect" as const,
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
        signature as Hex,
      ],
      chain: wallet.chain as Chain,
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: voucher.buyer,
    };
  }

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: tx,
      payer: voucher.buyer,
    };
  }

  const logs = parseEventLogs({
    abi: deferredEscrowABI,
    eventName: "VoucherCollected",
    logs: receipt.logs,
  });
  const collectedAmount = logs.length > 0 ? BigInt(logs[0].args.amount) : BigInt(0);

  try {
    const actionResult = await voucherStore.settleVoucher(voucher, tx, collectedAmount);
    if (!actionResult.success) {
      return {
        success: false,
        errorReason: "invalid_deferred_evm_payload_voucher_could_not_settle_store",
        transaction: tx,
        payer: voucher.buyer,
      };
    }
  } catch {
    return {
      success: false,
      errorReason: "invalid_deferred_evm_payload_voucher_error_settling_store",
      transaction: tx,
      payer: voucher.buyer,
    };
  }

  return {
    success: true,
    transaction: tx,
    payer: voucher.buyer,
  };
}
