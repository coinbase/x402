/**
 * XRP Facilitator Implementation - EIP-3009 equivalent
 * 
 * For XRP, this is the main payment verification and settlement logic
 * since XRP uses native Payment transactions rather than smart contracts
 */

import {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";
import {
  FacilitatorXrpSigner,
  ExactXrpPayloadV2,
  isXrpPayload,
} from "../../types";
import { dropsToXrp } from "xrpl";

export interface XrpVerifyContext {
  signer: FacilitatorXrpSigner;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  xrpPayload: ExactXrpPayloadV2;
}

export interface XrpSettleContext {
  signer: FacilitatorXrpSigner;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  xrpPayload: ExactXrpPayloadV2;
}

/**
 * Verify an XRP payment payload
 */
export async function verifyXrp(
  context: XrpVerifyContext,
): Promise<VerifyResponse> {
  const { signer, requirements, xrpPayload } = context;

  // Check payload format
  if (!isXrpPayload(xrpPayload)) {
    return {
      isValid: false,
      invalidReason: "INVALID_TRANSACTION",
      invalidMessage: "Invalid XRP transaction format",
    };
  }

  const tx = xrpPayload.transaction;

  // 1. Verify the signed transaction blob matches the transaction JSON
  // We re-verify by decoding and comparing key fields
  try {
    // Verify signature
    const signatureValid = await signer.verifySignature(tx, xrpPayload.signedTransaction);
    if (!signatureValid) {
      return {
        isValid: false,
        invalidReason: "INVALID_SIGNATURE",
        invalidMessage: "Transaction signature verification failed",
      };
    }
  } catch (error) {
    return {
      isValid: false,
      invalidReason: "INVALID_SIGNATURE",
      invalidMessage: `Signature check failed: ${(error as Error).message}`,
    };
  }

  // 2. Verify the transaction is a Payment
  if (tx.TransactionType !== "Payment") {
    return {
      isValid: false,
      invalidReason: "INVALID_TRANSACTION",
      invalidMessage: `Expected Payment, got ${tx.TransactionType}`,
    };
  }

  // 3. Verify amount matches
  if (tx.Amount !== requirements.amount) {
    return {
      isValid: false,
      invalidReason: "AMOUNT_MISMATCH",
      invalidMessage: `Expected ${requirements.amount} drops, got ${tx.Amount} drops`,
    };
  }

  // 4. Verify destination matches
  if (tx.Destination !== requirements.payTo) {
    return {
      isValid: false,
      invalidReason: "DESTINATION_MISMATCH",
      invalidMessage: `Expected destination ${requirements.payTo}, got ${tx.Destination}`,
    };
  }

  // 5. Verify destination tag if required
  if (requirements.extra?.destinationTag !== undefined) {
    const expectedTag = requirements.extra.destinationTag as number;
    if (tx.DestinationTag !== expectedTag) {
      return {
        isValid: false,
        invalidReason: "DESTINATION_TAG_MISMATCH",
        invalidMessage: `Expected destination tag ${expectedTag}, got ${tx.DestinationTag}`,
      };
    }
  }

  // 6. Verify fee is reasonable (should be 0.001 XRP or less)
  const feeXrp = dropsToXrp(tx.Fee);
  const maxFeeXrp = 0.01; // 0.01 XRP = 10,000 drops
  if (parseFloat(feeXrp) > maxFeeXrp) {
    return {
      isValid: false,
      invalidReason: "FEE_TOO_HIGH",
      invalidMessage: `Fee ${feeXrp} XRP exceeds maximum ${maxFeeXrp} XRP`,
    };
  }

  // 7. Verify sender has sufficient balance
  try {
    const accountInfo = await signer.getAccountInfo(tx.Account);
    const balanceDrops = BigInt(accountInfo.balance);
    const requiredDrops = BigInt(requirements.amount) + BigInt(tx.Fee);
    const baseReserveDrops = 1000000n; // 1 XRP minimum on testnet

    // Check if account has enough (balance considering reserve)
    const availableBalance = balanceDrops - baseReserveDrops;
    if (availableBalance < requiredDrops) {
      return {
        isValid: false,
        invalidReason: "INSUFFICIENT_BALANCE",
        invalidMessage: 
          `Account ${tx.Account} has insufficient balance. ` +
          `Available: ${availableBalance.toString()} drops, ` +
          `Required: ${requiredDrops.toString()} drops`,
      };
    }

    // 8. Verify sequence is reasonable (should be next or recent)
    const nextSeq = accountInfo.sequence;
    // Accept current sequence or up to 10 ahead (for queued txs)
    if (tx.Sequence < nextSeq || tx.Sequence > nextSeq + 10) {
      return {
        isValid: false,
        invalidReason: "SEQUENCE_INVALID",
        invalidMessage: `Sequence ${tx.Sequence} is not valid (expected ${nextSeq}-${nextSeq + 10})`,
      };
    }
  } catch (error) {
    return {
      isValid: false,
      invalidReason: "ACCOUNT_ERROR",
      invalidMessage: `Could not verify account: ${(error as Error).message}`,
    };
  }

  // 9. Verify LastLedgerSequence is in the future
  try {
    const currentLedger = await signer.getLedgerIndex();
    if (tx.LastLedgerSequence <= currentLedger) {
      return {
        isValid: false,
        invalidReason: "EXPIRED",
        invalidMessage: `Transaction expired (LastLedgerSequence ${tx.LastLedgerSequence} <= current ${currentLedger})`,
      };
    }

    // Check not too far in the future (max 100 ledgers = ~5 minutes)
    if (tx.LastLedgerSequence > currentLedger + 100) {
      return {
        isValid: false,
        invalidReason: "INVALID_LEDGER_SEQUENCE",
        invalidMessage: `LastLedgerSequence too far in the future`,
      };
    }
  } catch (error) {
    // Ledger check failed but not fatal
    // Log but don't reject
  }

  // All checks passed
  return {
    isValid: true,
    payer: tx.Account,
  };
}

/**
 * Settle an XRP payment
 */
export async function settleXrp(
  context: XrpSettleContext,
): Promise<SettleResponse> {
  const { signer, requirements, xrpPayload } = context;

  // Submit the transaction
  let hash: string;
  try {
    const submitResult = await signer.submitTransaction(xrpPayload.signedTransaction);
    hash = submitResult.hash;
  } catch (error) {
    return {
      success: false,
      errorReason: "SUBMIT_FAILED",
      errorMessage: `Failed to submit transaction: ${(error as Error).message}`,
      payer: xrpPayload.transaction.Account,
      transaction: "",
      network: requirements.network,
    };
  }

  // Wait for validation
  try {
    const validation = await signer.waitForValidation(hash);

    if (!validation.validated) {
      return {
        success: false,
        errorReason: "TIMEOUT",
        errorMessage: "Transaction did not validate within expected time",
        payer: xrpPayload.transaction.Account,
        transaction: hash,
        network: requirements.network,
      };
    }

    // Check the result code
    const successCodes = ["tesSUCCESS"];
    const failureCodes = [
      "tecUNFUNDED_PAYMENT",
      "tecNO_DST",
      "tecNO_DST_INSUF_XRP",
      "tecPATH_DRY",
    ];

    const isSuccess = successCodes.includes(validation.result);
    const isKnownFailure = failureCodes.includes(validation.result);

    if (!isSuccess) {
      if (isKnownFailure) {
        return {
          success: false,
          errorReason: validation.result,
          errorMessage: `Transaction failed with engine result: ${validation.result}`,
          payer: xrpPayload.transaction.Account,
          transaction: hash,
          network: requirements.network,
        };
      }
      // Unknown result - may be retryable
      return {
        success: false,
        errorReason: "UNKNOWN_RESULT",
        errorMessage: `Transaction returned unexpected result: ${validation.result}`,
        payer: xrpPayload.transaction.Account,
        transaction: hash,
        network: requirements.network,
      };
    }

    // Success!
    return {
      success: true,
      payer: xrpPayload.transaction.Account,
      transaction: hash,
      network: requirements.network,
    };
  } catch (error) {
    return {
      success: false,
      errorReason: "VALIDATION_ERROR",
      errorMessage: `Error checking validation: ${(error as Error).message}`,
      payer: xrpPayload.transaction.Account,
      transaction: hash,
      network: requirements.network,
    };
  }
}
