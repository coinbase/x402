/**
 * Facilitator-side x402 scheme implementation for Kaspa.
 *
 * The facilitator verifies that the client's signed transaction is valid
 * (correct amount, correct recipient, valid signatures, UTXOs exist)
 * and then broadcasts it to the Kaspa network.
 */

import {
  KASPA_CAIP_FAMILY,
  DEFAULT_CONFIRMATION_TIMEOUT_MS,
  KAS_NATIVE_ASSET,
  isCovenantAsset,
  validateAsset,
} from "../../constants.js";
import { addressToScriptPublicKey } from "../../utils.js";
import type { FacilitatorKaspaSigner } from "../../signer.js";
import type { ExactKaspaPayloadV2 } from "../../types.js";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SchemeNetworkFacilitator,
} from "@x402/core/types";

/**
 * In-memory cache to prevent double settlement of the same transaction.
 */
const settlementCache = new Set<string>();

/** Facilitator-side x402 scheme for Kaspa exact payments. */
export class ExactKaspaScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = KASPA_CAIP_FAMILY;

  private signer: FacilitatorKaspaSigner;

  /**
   * Create a new ExactKaspaScheme.
   *
   * @param signer - Facilitator signer for transaction verification and broadcast
   */
  constructor(signer: FacilitatorKaspaSigner) {
    this.signer = signer;
  }

  /**
   * Return extra data to include in PaymentRequirements.
   * For Kaspa, no extra data is needed (unlike SVM which needs feePayer).
   *
   * @param _ - Network identifier (unused for Kaspa)
   * @returns Undefined, as Kaspa requires no extra fields
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Return all facilitator-managed signer addresses.
   *
   * @param _ - Network identifier (unused, all networks share addresses)
   * @returns Array of managed Kaspa addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verify a payment payload WITHOUT executing it.
   *
   * Checks:
   * 1. Payload contains a valid transaction
   * 2. Transaction has correct recipient and amount
   * 3. Transaction signatures are valid
   * 4. UTXOs referenced in the transaction exist and are unspent
   * 5. Asset is valid (native KAS or covenant token)
   *
   * @param payload - Payment payload containing the signed transaction
   * @param requirements - Payment requirements to verify against
   * @returns Verification result with validity status
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      const kaspaPayload = payload.payload as unknown as ExactKaspaPayloadV2;

      if (!kaspaPayload.transaction) {
        return {
          isValid: false,
          invalidReason: "missing_transaction",
          invalidMessage: "Payment payload must contain a signed transaction.",
        };
      }

      // Validate asset
      try {
        validateAsset(requirements.asset);
      } catch {
        return {
          isValid: false,
          invalidReason: "unsupported_asset",
          invalidMessage: `Invalid asset: "${requirements.asset}". Must be "${KAS_NATIVE_ASSET}" or a 64-character lowercase hex covenant ID.`,
        };
      }

      // Parse and validate the transaction outputs against requirements
      const txValidation = await validateTransaction(
        kaspaPayload.transaction,
        requirements,
        this.signer,
      );

      if (!txValidation.isValid) {
        return {
          isValid: false,
          invalidReason: txValidation.reason,
          invalidMessage: txValidation.message,
        };
      }

      // Verify the transaction signatures and UTXO existence
      const sigValid = await this.signer.verifyTransaction(kaspaPayload.transaction);
      if (!sigValid) {
        return {
          isValid: false,
          invalidReason: "invalid_signature",
          invalidMessage: "Transaction signature verification failed.",
        };
      }

      return {
        isValid: true,
        payer: txValidation.payer,
      };
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "verification_error",
        invalidMessage: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Settle (execute) a payment by broadcasting the transaction.
   *
   * Flow:
   * 1. Check duplicate (prevent double-settlement)
   * 2. Re-verify the transaction (security gate)
   * 3. Broadcast to Kaspa network
   * 4. Wait for confirmation
   * 5. Return transaction ID
   *
   * @param payload - Payment payload containing the signed transaction
   * @param requirements - Payment requirements for re-verification
   * @returns Settlement result with transaction ID
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const kaspaPayload = payload.payload as unknown as ExactKaspaPayloadV2;

    // Duplicate check
    const txKey = kaspaPayload.transaction;
    if (settlementCache.has(txKey)) {
      return {
        success: false,
        errorReason: "duplicate_settlement",
        errorMessage: "This transaction has already been settled.",
        transaction: "",
        network: requirements.network,
      };
    }
    settlementCache.add(txKey);

    try {
      // Re-verify before settling (security gate)
      const verifyResult = await this.verify(payload, requirements);
      if (!verifyResult.isValid) {
        settlementCache.delete(txKey);
        return {
          success: false,
          errorReason: verifyResult.invalidReason ?? "verification_failed",
          errorMessage: verifyResult.invalidMessage ?? "Re-verification failed before settlement.",
          transaction: "",
          network: requirements.network,
        };
      }

      // Broadcast the transaction
      const transactionId = await this.signer.submitTransaction(kaspaPayload.transaction);

      // Wait for DAG confirmation
      const confirmed = await this.signer.waitForConfirmation(
        transactionId,
        DEFAULT_CONFIRMATION_TIMEOUT_MS,
      );

      if (!confirmed) {
        settlementCache.delete(txKey);
        return {
          success: false,
          errorReason: "confirmation_timeout",
          errorMessage: "Transaction was submitted but not confirmed within timeout.",
          transaction: transactionId,
          network: requirements.network,
        };
      }

      return {
        success: true,
        payer: verifyResult.payer,
        transaction: transactionId,
        network: requirements.network,
      };
    } catch (error) {
      settlementCache.delete(txKey);
      return {
        success: false,
        errorReason: "settlement_error",
        errorMessage: `Settlement failed: ${error instanceof Error ? error.message : String(error)}`,
        transaction: "",
        network: requirements.network,
      };
    }
  }
}

/**
 * Validate that a transaction meets the payment requirements.
 *
 * Parses the transaction via signer.parseTransaction() and checks:
 * - At least one output pays the correct recipient (payTo)
 * - The output amount >= required amount
 * - Extracts payer address from inputs
 *
 * @param transaction - Serialized signed transaction
 * @param requirements - Payment requirements to validate against
 * @param signer - Facilitator signer for transaction parsing
 * @returns Validation result with payer address on success
 */
async function validateTransaction(
  transaction: string,
  requirements: PaymentRequirements,
  signer: FacilitatorKaspaSigner,
): Promise<{
  isValid: boolean;
  reason?: string;
  message?: string;
  payer?: string;
}> {
  const parsed = await signer.parseTransaction(transaction);

  // Find an output that pays the required recipient.
  // The signer may return output addresses as script hex (UTXO model)
  // or as bech32 Kaspa addresses — support both comparison modes.
  const requiredAmount = BigInt(requirements.amount);
  const payToScript = addressToScriptPublicKey(requirements.payTo).script;
  const isCovenant = isCovenantAsset(requirements.asset);

  const matchingOutput = parsed.outputs.find(o => {
    // Address + amount match
    const addressMatch = o.address === payToScript || o.address === requirements.payTo;
    if (!addressMatch || o.amount < requiredAmount) return false;

    // Covenant check: token outputs must carry the correct covenantId;
    // native outputs must NOT carry a covenantId.
    if (isCovenant) {
      return o.covenantId === requirements.asset;
    } else {
      return !o.covenantId;
    }
  });

  if (!matchingOutput) {
    return {
      isValid: false,
      reason: "output_mismatch",
      message:
        `No output pays ${requirements.payTo} at least ${requiredAmount} sompi` +
        (isCovenant ? ` with covenant ${requirements.asset}.` : `.`),
    };
  }

  // Payer = first input address (the sender)
  const payer = parsed.inputAddresses[0];

  return { isValid: true, payer };
}
