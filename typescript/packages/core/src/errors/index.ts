/**
 * @fileoverview Error codes and messages for x402 protocol
 * @module @x402/core/errors
 */

/**
 * Error codes for payment verification failures.
 */
export const VERIFY_ERROR_CODES = {
    /** Invalid payment signature */
    INVALID_SIGNATURE: "INVALID_SIGNATURE",
    /** Payment amount is insufficient */
    INSUFFICIENT_AMOUNT: "INSUFFICIENT_AMOUNT",
    /** Payment has expired */
    PAYMENT_EXPIRED: "PAYMENT_EXPIRED",
    /** Invalid network specified */
    INVALID_NETWORK: "INVALID_NETWORK",
    /** Unsupported payment scheme */
    UNSUPPORTED_SCHEME: "UNSUPPORTED_SCHEME",
    /** Invalid asset address */
    INVALID_ASSET: "INVALID_ASSET",
    /** Payer address is invalid or blocked */
    INVALID_PAYER: "INVALID_PAYER",
    /** Nonce has already been used */
    NONCE_ALREADY_USED: "NONCE_ALREADY_USED",
    /** General validation error */
    VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

/**
 * Error codes for payment settlement failures.
 */
export const SETTLE_ERROR_CODES = {
    /** Transaction failed on-chain */
    TRANSACTION_FAILED: "TRANSACTION_FAILED",
    /** Insufficient balance to complete payment */
    INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
    /** Gas estimation failed */
    GAS_ESTIMATION_FAILED: "GAS_ESTIMATION_FAILED",
    /** Transaction reverted */
    TRANSACTION_REVERTED: "TRANSACTION_REVERTED",
    /** Network connection error */
    NETWORK_ERROR: "NETWORK_ERROR",
    /** Transaction timed out */
    TIMEOUT: "TIMEOUT",
    /** Facilitator service unavailable */
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

/**
 * Human-readable error messages for verify error codes.
 */
export const VERIFY_ERROR_MESSAGES: Record<string, string> = {
    [VERIFY_ERROR_CODES.INVALID_SIGNATURE]:
        "The payment signature is invalid or could not be verified.",
    [VERIFY_ERROR_CODES.INSUFFICIENT_AMOUNT]:
        "The payment amount is less than the required amount.",
    [VERIFY_ERROR_CODES.PAYMENT_EXPIRED]:
        "The payment has expired and is no longer valid.",
    [VERIFY_ERROR_CODES.INVALID_NETWORK]:
        "The specified network is not supported.",
    [VERIFY_ERROR_CODES.UNSUPPORTED_SCHEME]:
        "The payment scheme is not supported for this network.",
    [VERIFY_ERROR_CODES.INVALID_ASSET]:
        "The asset address is invalid or not supported.",
    [VERIFY_ERROR_CODES.INVALID_PAYER]:
        "The payer address is invalid or has been blocked.",
    [VERIFY_ERROR_CODES.NONCE_ALREADY_USED]:
        "This payment has already been processed.",
    [VERIFY_ERROR_CODES.VALIDATION_ERROR]:
        "The payment payload failed validation.",
};

/**
 * Human-readable error messages for settle error codes.
 */
export const SETTLE_ERROR_MESSAGES: Record<string, string> = {
    [SETTLE_ERROR_CODES.TRANSACTION_FAILED]:
        "The on-chain transaction failed to execute.",
    [SETTLE_ERROR_CODES.INSUFFICIENT_BALANCE]:
        "The payer has insufficient balance to complete the payment.",
    [SETTLE_ERROR_CODES.GAS_ESTIMATION_FAILED]:
        "Failed to estimate gas for the transaction.",
    [SETTLE_ERROR_CODES.TRANSACTION_REVERTED]:
        "The transaction was reverted by the network.",
    [SETTLE_ERROR_CODES.NETWORK_ERROR]:
        "Could not connect to the network.",
    [SETTLE_ERROR_CODES.TIMEOUT]:
        "The transaction confirmation timed out.",
    [SETTLE_ERROR_CODES.SERVICE_UNAVAILABLE]:
        "The facilitator service is temporarily unavailable.",
};

/**
 * Type for verify error code values.
 */
export type VerifyErrorCode = (typeof VERIFY_ERROR_CODES)[keyof typeof VERIFY_ERROR_CODES];

/**
 * Type for settle error code values.
 */
export type SettleErrorCode = (typeof SETTLE_ERROR_CODES)[keyof typeof SETTLE_ERROR_CODES];

/**
 * Gets a human-readable error message for a verify error code.
 *
 * @param code - The verify error code
 * @returns Human-readable error message
 */
export function getVerifyErrorMessage(code: string): string {
    return VERIFY_ERROR_MESSAGES[code] || "An unknown verification error occurred.";
}

/**
 * Gets a human-readable error message for a settle error code.
 *
 * @param code - The settle error code
 * @returns Human-readable error message
 */
export function getSettleErrorMessage(code: string): string {
    return SETTLE_ERROR_MESSAGES[code] || "An unknown settlement error occurred.";
}
