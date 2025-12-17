import { IntentTrace, Remediation } from "../types";

/**
 * Standard reason codes for verification/settlement failures.
 * These codes provide machine-readable categorization of failures.
 */
export const FailureReasonCodes = {
  // Balance/Funds
  INSUFFICIENT_FUNDS: "insufficient_funds",

  // Signature issues
  SIGNATURE_INVALID: "signature_invalid",
  SIGNATURE_EXPIRED: "signature_expired",
  SIGNATURE_NOT_YET_VALID: "signature_not_yet_valid",

  // Amount/Value issues
  AMOUNT_MISMATCH: "amount_mismatch",
  RECIPIENT_MISMATCH: "recipient_mismatch",

  // Network/Asset issues
  NETWORK_MISMATCH: "network_mismatch",
  ASSET_MISMATCH: "asset_mismatch",

  // Transaction issues
  NONCE_ALREADY_USED: "nonce_already_used",
  TRANSACTION_REVERTED: "transaction_reverted",
  TRANSACTION_TIMEOUT: "transaction_timeout",

  // Wallet issues
  SMART_WALLET_ERROR: "smart_wallet_error",
  UNDEPLOYED_WALLET: "undeployed_wallet",

  // System errors
  FACILITATOR_ERROR: "facilitator_error",
  OTHER: "other",
} as const;

export type FailureReasonCode = (typeof FailureReasonCodes)[keyof typeof FailureReasonCodes];

/**
 * Create an intent trace for insufficient funds failure.
 */
export function createInsufficientFundsTrace(
  requiredAmount: string,
  availableBalance: string,
  asset: string,
  network: string,
): IntentTrace {
  const shortfall = (BigInt(requiredAmount) - BigInt(availableBalance)).toString();

  return {
    reason_code: FailureReasonCodes.INSUFFICIENT_FUNDS,
    trace_summary: "Wallet balance is below required amount.",
    metadata: {
      required_amount: requiredAmount,
      available_balance: availableBalance,
      shortfall,
    },
    remediation: {
      action: "top_up",
      reason: "Add more funds to complete this payment",
      min_amount: shortfall,
      asset,
      network,
    },
  };
}

/**
 * Create an intent trace for expired signature/authorization.
 */
export function createSignatureExpiredTrace(
  validBefore: string,
  currentTime: number,
): IntentTrace {
  const expiredBySeconds = currentTime - parseInt(validBefore);

  return {
    reason_code: FailureReasonCodes.SIGNATURE_EXPIRED,
    trace_summary: "Payment authorization has expired.",
    metadata: {
      valid_before: validBefore,
      current_time: currentTime,
      expired_by_seconds: expiredBySeconds,
    },
    remediation: {
      action: "retry_with_fresh_authorization",
      reason: "Create a new authorization with a later validBefore timestamp",
      suggested_valid_before_offset: 300, // 5 minutes
    },
  };
}

/**
 * Create an intent trace for signature not yet valid.
 */
export function createSignatureNotYetValidTrace(
  validAfter: string,
  currentTime: number,
): IntentTrace {
  const waitSeconds = parseInt(validAfter) - currentTime;

  return {
    reason_code: FailureReasonCodes.SIGNATURE_NOT_YET_VALID,
    trace_summary: "Payment authorization is not yet valid.",
    metadata: {
      valid_after: validAfter,
      current_time: currentTime,
      wait_seconds: waitSeconds,
    },
    remediation: {
      action: "wait_and_retry",
      reason: `Wait ${waitSeconds} seconds before retrying`,
      wait_seconds: waitSeconds,
    },
  };
}

/**
 * Create an intent trace for invalid signature.
 */
export function createInvalidSignatureTrace(payer: string): IntentTrace {
  return {
    reason_code: FailureReasonCodes.SIGNATURE_INVALID,
    trace_summary: "Payment authorization signature failed verification.",
    metadata: {
      payer,
    },
    remediation: {
      action: "retry_with_correct_signature",
      reason: "Ensure the authorization is signed with the correct private key",
    },
  };
}

/**
 * Create an intent trace for recipient mismatch.
 */
export function createRecipientMismatchTrace(
  expectedRecipient: string,
  providedRecipient: string,
): IntentTrace {
  return {
    reason_code: FailureReasonCodes.RECIPIENT_MISMATCH,
    trace_summary: "Authorization recipient does not match payment requirements.",
    metadata: {
      expected_recipient: expectedRecipient,
      provided_recipient: providedRecipient,
    },
    remediation: {
      action: "retry_with_correct_recipient",
      reason: "Create authorization with the correct payTo address",
      correct_recipient: expectedRecipient,
    },
  };
}

/**
 * Create an intent trace for amount mismatch.
 */
export function createAmountMismatchTrace(
  requiredAmount: string,
  providedAmount: string,
): IntentTrace {
  return {
    reason_code: FailureReasonCodes.AMOUNT_MISMATCH,
    trace_summary: "Authorized amount is less than required.",
    metadata: {
      required_amount: requiredAmount,
      provided_amount: providedAmount,
      shortfall: (BigInt(requiredAmount) - BigInt(providedAmount)).toString(),
    },
    remediation: {
      action: "retry_with_correct_amount",
      reason: "Create authorization with at least the required amount",
      min_amount: requiredAmount,
    },
  };
}

/**
 * Create an intent trace for transaction revert.
 */
export function createTransactionRevertedTrace(
  revertReason?: string,
  txHash?: string,
): IntentTrace {
  return {
    reason_code: FailureReasonCodes.TRANSACTION_REVERTED,
    trace_summary: "On-chain transaction reverted during execution.",
    metadata: {
      revert_reason: revertReason || "Unknown",
      ...(txHash && { transaction_hash: txHash }),
    },
    remediation: {
      action: "retry_with_fresh_authorization",
      reason: "Balance or approval state may have changed since verification",
    },
  };
}

/**
 * Create an intent trace for undeployed smart wallet.
 */
export function createUndeployedWalletTrace(walletAddress: string): IntentTrace {
  return {
    reason_code: FailureReasonCodes.UNDEPLOYED_WALLET,
    trace_summary: "Smart wallet is not deployed and signature lacks deployment info.",
    metadata: {
      wallet_address: walletAddress,
    },
    remediation: {
      action: "deploy_wallet_first",
      reason: "Deploy the smart wallet before attempting payment, or use EIP-6492 signature with deployment info",
    },
  };
}

/**
 * Create a generic intent trace for other failures.
 */
export function createGenericFailureTrace(
  errorCode: string,
  summary: string,
  metadata?: Record<string, string | number | boolean>,
): IntentTrace {
  return {
    reason_code: errorCode,
    trace_summary: summary,
    metadata,
  };
}
