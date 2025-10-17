import {
  Account,
  parseSignature,
  Address,
  Chain,
  Transport,
  Hex,
  parseEventLogs,
  getAddress,
} from "viem";
import { ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SchemeContext,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import { ErrorReasons } from "../../../types/verify/x402Specs";
import {
  DeferredBuyerDataResponse,
  DeferredDepositWithAuthorizationResponse,
  DeferredErrorResponse,
  DeferredEscrowDepositAuthorization,
  DeferredEscrowFlushAuthorizationSigned,
  DeferredEvmPayloadVoucher,
  DeferredFlushWithAuthorizationResponse,
  DeferredPaymentPayloadSchema,
  DeferredPaymentRequirementsSchema,
  DeferredSchemeContextSchema,
} from "../../../types/verify/schemes/deferred";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";
import { usdcABI } from "../../../types/shared/evm/erc20PermitABI";
import {
  verifyPaymentRequirements,
  verifyVoucherSignatureWrapper,
  verifyVoucherOnchainState,
  verifyVoucherContinuity,
  verifyVoucherAvailability,
  verifyDepositAuthorizationSignatureAndContinuity,
  verifyFlushAuthorization,
  verifyDepositAuthorizationOnchainState,
  getOnchainVerificationData,
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
  const signatureResult = await verifyVoucherSignatureWrapper(
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

  // Verify deposit authorization signature and continuity
  if (paymentPayload.payload.depositAuthorization) {
    const depositAuthorizationResult = await verifyDepositAuthorizationSignatureAndContinuity(
      paymentPayload.payload.voucher,
      paymentPayload.payload.depositAuthorization,
    );
    if (!depositAuthorizationResult.isValid) {
      return depositAuthorizationResult;
    }
  }

  // Fetch all on-chain data in a single contract call
  const onchainDataResult = await getOnchainVerificationData(
    client,
    paymentPayload.payload.voucher,
    paymentPayload.payload.depositAuthorization?.depositAuthorization.nonce,
  );

  if (!onchainDataResult.isValid) {
    return {
      isValid: false,
      invalidReason:
        onchainDataResult.invalidReason ??
        "invalid_deferred_evm_contract_call_failed_verification_data",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  const onchainData = onchainDataResult.data!;

  // Verify the onchain state allows the deposit authorization to be executed
  if (paymentPayload.payload.depositAuthorization) {
    const depositAuthorizationOnchainResult = verifyDepositAuthorizationOnchainState(
      paymentPayload.payload.voucher,
      paymentPayload.payload.depositAuthorization,
      onchainData,
    );
    if (!depositAuthorizationOnchainResult.isValid) {
      return depositAuthorizationOnchainResult;
    }
  }

  // Verify the onchain state allows the payment to be settled
  const onchainResult = verifyVoucherOnchainState(
    paymentPayload.payload.voucher,
    paymentPayload.payload.depositAuthorization,
    onchainData,
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

  if (paymentPayload.payload.depositAuthorization) {
    const depositAuthorizationResponse = await depositWithAuthorization(
      wallet,
      paymentPayload.payload.voucher,
      paymentPayload.payload.depositAuthorization,
      false, // Skip reverification - already verified in verify() call above
    );
    if (!depositAuthorizationResponse.success) {
      return {
        success: false,
        network: paymentPayload.network,
        transaction: "",
        errorReason:
          (depositAuthorizationResponse.errorReason as (typeof ErrorReasons)[number]) ??
          "invalid_deferred_evm_payload_deposit_authorization_failed",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  const { voucher, signature } = paymentPayload.payload;
  const response = await settleVoucher(
    wallet,
    voucher,
    signature,
    voucherStore,
    false, // Skip reverification - already verified in verify() call above
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
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param voucher - The voucher to settle
 * @param signature - The signature of the voucher
 * @param voucherStore - The voucher store to use for verification
 * @param reverify - Rerun the verification steps for the voucher
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settleVoucher<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  voucher: DeferredEvmPayloadVoucher,
  signature: string,
  voucherStore: VoucherStore,
  reverify: boolean = true,
): Promise<SettleResponse> {
  if (reverify) {
    // Verify the voucher signature
    const signatureResult = await verifyVoucherSignatureWrapper(voucher, signature);
    if (!signatureResult.isValid) {
      return {
        success: false,
        errorReason:
          signatureResult.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
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
    const onchainDataResult = await getOnchainVerificationData(wallet, voucher);

    // Check if contract call failed
    if (!onchainDataResult.isValid) {
      return {
        success: false,
        errorReason:
          onchainDataResult.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
        transaction: "",
        payer: voucher.buyer,
      };
    }

    const onchainData = onchainDataResult.data!;
    const voucherOnchainResult = verifyVoucherOnchainState(voucher, undefined, onchainData, true);
    if (!voucherOnchainResult.isValid) {
      return {
        success: false,
        errorReason:
          voucherOnchainResult.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
        transaction: "",
        payer: voucher.buyer,
      };
    }
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

/**
 * Deposits funds to the escrow using a deposit authorization
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param voucher - The voucher that the deposit authorization is escrowing for
 * @param depositAuthorization - The deposit authorization
 * @param reverify - Rerun the verification steps for the deposit authorization
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function depositWithAuthorization<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  voucher: DeferredEvmPayloadVoucher,
  depositAuthorization: DeferredEscrowDepositAuthorization,
  reverify: boolean = true,
): Promise<DeferredDepositWithAuthorizationResponse> {
  if (reverify) {
    // Verify the deposit authorization
    const valid = await verifyDepositAuthorizationSignatureAndContinuity(
      voucher,
      depositAuthorization,
    );
    if (!valid.isValid) {
      return {
        success: false,
        errorReason: valid.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
        transaction: "",
        payer: depositAuthorization.depositAuthorization.buyer,
      };
    }

    // Verify the onchain state allows the deposit authorization to be executed
    const onchainDataResult = await getOnchainVerificationData(
      wallet,
      voucher,
      depositAuthorization.depositAuthorization.nonce,
    );

    // Check if contract call failed
    if (!onchainDataResult.isValid) {
      return {
        success: false,
        errorReason:
          onchainDataResult.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
        transaction: "",
        payer: depositAuthorization.depositAuthorization.buyer,
      };
    }

    const onchainData = onchainDataResult.data!;
    const depositAuthorizationOnchainResult = verifyDepositAuthorizationOnchainState(
      voucher,
      depositAuthorization,
      onchainData,
    );
    if (!depositAuthorizationOnchainResult.isValid) {
      return {
        success: false,
        errorReason:
          depositAuthorizationOnchainResult.invalidReason ??
          "invalid_deferred_evm_payload_no_longer_valid",
        transaction: "",
        payer: depositAuthorization.depositAuthorization.buyer,
      };
    }
  }

  const { permit, depositAuthorization: depositAuthorizationInnerWithSignature } =
    depositAuthorization;

  // Send permit() transaction
  if (permit) {
    const { v, r, s, yParity } = parseSignature(permit.signature as `0x${string}`);
    let permitTx = "";
    try {
      permitTx = await wallet.writeContract({
        address: voucher.asset as Address,
        abi: usdcABI,
        functionName: "permit" as const,
        args: [
          getAddress(permit.owner),
          getAddress(permit.spender),
          BigInt(permit.value),
          BigInt(permit.deadline),
          Number(v ?? (yParity === 0 ? 27n : 28n)),
          r,
          s,
        ],
        chain: wallet.chain as Chain,
      });
    } catch (error) {
      console.error(error);
      return {
        success: false,
        errorReason: "invalid_transaction_reverted",
        transaction: "",
        payer: permit.owner,
      };
    }

    const permitReceipt = await wallet.waitForTransactionReceipt({
      hash: permitTx as `0x${string}`,
    });
    if (permitReceipt.status !== "success") {
      return {
        success: false,
        errorReason: "invalid_transaction_state",
        transaction: permitTx,
        payer: permit.owner,
      };
    }
  }

  // Send depositWithAuthorization() transaction
  const { signature: depositAuthorizationSignature, ...depositAuthorizationInner } =
    depositAuthorizationInnerWithSignature;
  let tx = "";
  try {
    tx = await wallet.writeContract({
      address: voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "depositWithAuthorization" as const,
      args: [
        {
          buyer: getAddress(depositAuthorizationInner.buyer),
          seller: getAddress(depositAuthorizationInner.seller),
          asset: getAddress(depositAuthorizationInner.asset),
          amount: BigInt(depositAuthorizationInner.amount),
          nonce: depositAuthorizationInner.nonce as `0x${string}`,
          expiry: BigInt(depositAuthorizationInner.expiry),
        },
        depositAuthorizationSignature as `0x${string}`,
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
      payer: depositAuthorizationInner.buyer,
    };
  }

  return {
    success: true,
    transaction: tx,
    payer: depositAuthorization.depositAuthorization.buyer,
  };
}

/**
 * Gets the details of an escrow account defined by a buyer, seller, and asset on a target escrow contract
 * Note that it will consider offchain outstanding vouchers when calculating the balance
 *
 * @param client - The client to use for retrieving the onchain balance
 * @param buyer - The buyer address
 * @param seller - The seller address
 * @param asset - The asset address
 * @param escrow - The escrow address
 * @param chainId - The chain ID
 * @param voucherStore - The voucher store to use to get outstanding vouchers
 * @returns The balance of the buyer for the given asset
 */
export async function getAccountData<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  buyer: Address,
  seller: Address,
  asset: Address,
  escrow: Address,
  chainId: number,
  voucherStore: VoucherStore,
): Promise<DeferredBuyerDataResponse | DeferredErrorResponse> {
  const outstandingVouchers = await voucherStore.getVouchers(
    {
      buyer,
      seller,
      asset,
      escrow,
      chainId,
      latest: true,
    },
    {
      limit: 1_000, // TODO: pagination?
    },
  );

  let balance: bigint;
  let allowance: bigint;
  let nonce: bigint;
  try {
    [balance, allowance, nonce] = await client.readContract({
      address: escrow as Address,
      abi: deferredEscrowABI,
      functionName: "getAccountData",
      args: [
        buyer as Address,
        seller as Address,
        asset as Address,
        outstandingVouchers.map(voucher => voucher.id as `0x${string}`),
        outstandingVouchers.map(voucher => BigInt(voucher.valueAggregate)),
      ],
    });
  } catch (error) {
    console.log(error);
    return {
      error: "invalid_deferred_evm_contract_call_failed_account_details",
    };
  }

  return {
    balance: balance.toString(),
    assetAllowance: allowance.toString(),
    assetPermitNonce: nonce.toString(),
  };
}

/**
 * Flushes an escrow account using a signed flush authorization
 *
 * This function performs a flush operation which:
 * 1. Withdraws any funds that have completed their thawing period (ready to withdraw)
 * 2. Initiates thawing for any remaining balance that isn't already thawing
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param flushAuthorization - The signed flush authorization from the buyer
 * @param escrow - The address of the escrow contract
 * @returns A response containing the transaction status and hash
 */
export async function flushWithAuthorization<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  flushAuthorization: DeferredEscrowFlushAuthorizationSigned,
  escrow: Address,
): Promise<DeferredFlushWithAuthorizationResponse> {
  // Verify the flush authorization
  const valid = await verifyFlushAuthorization(flushAuthorization, escrow, wallet.chain.id);
  if (!valid.isValid) {
    return {
      success: false,
      errorReason: valid.invalidReason ?? "invalid_deferred_evm_payload_flush_authorization_failed",
      transaction: "",
      payer: flushAuthorization.buyer,
    };
  }

  const { seller, asset } = flushAuthorization;
  const flushAll = seller == undefined || asset == undefined;

  let tx = "";
  try {
    tx = await wallet.writeContract({
      address: escrow as Address,
      abi: deferredEscrowABI,
      functionName: flushAll
        ? ("flushAllWithAuthorization" as const)
        : ("flushWithAuthorization" as const),
      args: [
        {
          buyer: getAddress(flushAuthorization.buyer),
          ...(flushAll
            ? {}
            : {
                seller: getAddress(seller),
                asset: getAddress(asset),
              }),
          nonce: flushAuthorization.nonce as `0x${string}`,
          expiry: BigInt(flushAuthorization.expiry),
        },
        flushAuthorization.signature as `0x${string}`,
      ],
      chain: wallet.chain as Chain,
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      errorReason: "invalid_transaction_reverted",
      transaction: "",
      payer: flushAuthorization.buyer,
    };
  }

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: tx,
      payer: flushAuthorization.buyer,
    };
  }

  return {
    success: true,
    transaction: tx,
    payer: flushAuthorization.buyer,
  };
}
