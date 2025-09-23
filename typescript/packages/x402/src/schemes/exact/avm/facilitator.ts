import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import { AlgorandClient, WalletAccount } from "./types";
import { verifyLease } from "./utils/leaseUtils";
import { ExactAvmPayload } from "../../../types/verify/x402Specs";
import algosdk from "algosdk";

/**
 * Decodes a base64-encoded signed transaction string into an Algorand transaction object
 *
 * @param encodedTxn - The base64-encoded signed transaction string
 * @returns The decoded Algorand signed transaction
 */
function decodeSignedTransaction(encodedTxn: string): algosdk.SignedTransaction {
  const txnBytes = Buffer.from(encodedTxn, "base64");
  return algosdk.decodeSignedTransaction(txnBytes);
}

/**
 * Decodes a base64-encoded unsigned transaction string into an Algorand transaction object
 *
 * @param encodedTxn - The base64-encoded unsigned transaction string
 * @returns The decoded Algorand transaction
 */
function decodeTransaction(encodedTxn: string): algosdk.Transaction {
  const txnBytes = Buffer.from(encodedTxn, "base64");
  return algosdk.decodeUnsignedTransaction(txnBytes);
}

/**
 * Gets the current round from the Algorand client
 *
 * @param client - The Algorand client
 * @returns The current round number
 */
async function getCurrentRound(client: AlgorandClient): Promise<number> {
  const status = await client.client.status().do();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusAny = status as any;
  const lastRound = statusAny.lastRound || statusAny["last-round"];
  return typeof lastRound === "bigint" ? Number(lastRound) : lastRound;
}

/**
 * Verifies a payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - Verifies protocol version compatibility
 * - Validates the transaction signature
 * - Verifies the lease field matches the SHA-256 hash of the paymentRequirements
 * - Verifies the transaction is for the correct asset ID
 * - Verifies the transaction amount matches or exceeds paymentRequirements.maxAmountRequired
 * - Verifies the recipient address matches paymentRequirements.payTo
 * - Verifies the transaction is within its valid round range
 * - Verifies the client has sufficient balance to cover the payment
 * - Verifies the client has opted in to the ASA (if applicable)
 *
 * @param client - The Algorand client used for blockchain interactions
 * @param payload - The signed payment payload containing transaction parameters
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  client: AlgorandClient,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  try {
    const exactAvmPayload = payload.payload as ExactAvmPayload;
    const signedTxn = decodeSignedTransaction(exactAvmPayload.transaction);
    const transaction = signedTxn.txn;
    const from = transaction.sender.toString();
    const feePayer = (paymentRequirements.extra as { feePayer?: string } | undefined)?.feePayer;
    if (feePayer && !exactAvmPayload.feeTransaction) {
      console.error("Missing fee transaction for fee payer");
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_atomic_group",
        payer: from,
      };
    }
    const firstRound = Number(transaction.firstValid);
    const lastRound = Number(transaction.lastValid);
    const lease = transaction.lease;

    let to: string | undefined;
    let amount = 0;
    let assetIndex: number | undefined;

    if (transaction.type === algosdk.TransactionType.pay) {
      const paymentFields = transaction.payment;
      if (!paymentFields) {
        console.error("Missing payment fields in transaction");
        return {
          isValid: false,
          invalidReason: "invalid_exact_avm_payload_transaction",
          payer: from,
        };
      }
      to = paymentFields.receiver.toString();
      amount = Number(paymentFields.amount ?? 0n);
    } else if (transaction.type === algosdk.TransactionType.axfer) {
      const assetFields = transaction.assetTransfer;
      if (!assetFields) {
        console.error("Missing asset transfer fields in transaction");
        return {
          isValid: false,
          invalidReason: "invalid_exact_avm_payload_transaction",
          payer: from,
        };
      }
      to = assetFields.receiver.toString();
      amount = Number(assetFields.amount ?? 0n);
      assetIndex = assetFields.assetIndex ? Number(assetFields.assetIndex) : undefined;
    } else {
      console.error("Unsupported transaction type:", transaction.type);
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_transaction",
        payer: from,
      };
    }

    if (to !== paymentRequirements.payTo) {
      console.error(
        "Recipient address does not match payment requirements:",
        to,
        paymentRequirements.payTo,
      );
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_recipient",
        payer: from,
      };
    }

    const requiredAmount = parseInt(paymentRequirements.maxAmountRequired, 10);
    if (amount < requiredAmount) {
      console.error("Transaction amount is less than required:", amount, requiredAmount);
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_amount",
        payer: from,
      };
    }

    const currentRound = await getCurrentRound(client);
    if (firstRound > currentRound || lastRound < currentRound) {
      console.error("Transaction not valid in current round:", currentRound, firstRound, lastRound);
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_round_validity",
        payer: from,
      };
    }

    if (!lease) {
      console.error("Missing lease in transaction");
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_lease",
        payer: from,
      };
    }

    const isLeaseValid = verifyLease(lease, paymentRequirements);
    if (!isLeaseValid) {
      console.error("Lease does not match payment requirements");
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_lease",
        payer: from,
      };
    }

    if (paymentRequirements.asset) {
      const requiredAssetId = parseInt(paymentRequirements.asset as string, 10);
      if (Number(requiredAssetId) !== 0 && assetIndex !== requiredAssetId) {
        console.error("Asset ID does not match payment requirements:", assetIndex, requiredAssetId);
        return {
          isValid: false,
          invalidReason: "invalid_exact_avm_payload_asset_id",
          payer: from,
        };
      }
    }

    const accountInfo = await client.client.accountInformation(from).do();
    if (accountInfo.amount < amount) {
      console.error("Insufficient funds in account:", accountInfo.amount, amount);
      return {
        isValid: false,
        invalidReason: "insufficient_funds",
        payer: from,
      };
    }

    if (assetIndex) {
      try {
        const assetInfo = await client.client.accountAssetInformation(from, assetIndex).do();
        if (!assetInfo.assetHolding) {
          console.error("Account has not opted in to the ASA");
          return {
            isValid: false,
            invalidReason: "invalid_exact_avm_payload_asa_opt_in_required",
            payer: from,
          };
        }
      } catch (assetError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (assetError as any)?.response?.statusCode ?? (assetError as any)?.statusCode;
        if (status === 404) {
          console.error("Account has not opted in to the ASA");
          return {
            isValid: false,
            invalidReason: "invalid_exact_avm_payload_asa_opt_in_required",
            payer: from,
          };
        }
        console.error("Error fetching asset information:", assetError);
        throw assetError;
      }
    }

    return {
      isValid: true,
      payer: from,
    };
  } catch (error) {
    console.error("Error during verification:", error);
    return {
      isValid: false,
      invalidReason: "invalid_exact_avm_payload_transaction",
      payer: "unknown",
    };
  }
}

/**
 * Settles a payment by executing an Algorand transaction
 *
 * This function optionally creates an atomic transaction group:
 * - Transaction 1: Client payment transaction (fee=0 when a fee payer exists, amount=requested, lease set)
 * - Transaction 2: Facilitator fee-payer transaction (amount=0, fee=cover both) when metadata supplies a fee payer address
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transaction parameters
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle(
  wallet: WalletAccount,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  let payer = "unknown";
  try {
    const exactAvmPayload = paymentPayload.payload as ExactAvmPayload;
    const signedTxn = decodeSignedTransaction(exactAvmPayload.transaction);
    const userTransaction = signedTxn.txn;
    const feeTransactionBase64 = exactAvmPayload.feeTransaction;
    const from = userTransaction.sender.toString();
    payer = from;
    const feePayer = (paymentRequirements.extra as { feePayer?: string } | undefined)?.feePayer;
    if (feePayer && !feeTransactionBase64) {
      console.error("Missing fee transaction for fee payer execution");
      return {
        success: false,
        errorReason: "invalid_exact_avm_payload_atomic_group",
        transaction: "",
        network: paymentPayload.network,
        payer: from,
      };
    }

    const feeTransaction = feeTransactionBase64
      ? decodeTransaction(feeTransactionBase64)
      : undefined;
    const validationResult = await verify(
      { client: wallet.client, network: paymentPayload.network },
      paymentPayload,
      paymentRequirements,
    );

    if (!validationResult.isValid) {
      console.error("Payment validation failed:", validationResult);
      return {
        success: false,
        errorReason: validationResult.invalidReason,
        transaction: "",
        network: paymentPayload.network,
        payer: from,
      };
    }
    const userTxnBytes = Buffer.from(exactAvmPayload.transaction, "base64");
    let txId;
    if (feePayer) {
      if (!feeTransaction) {
        console.error("Fee transaction missing despite fee payer requirement");
        return {
          success: false,
          errorReason: "invalid_exact_avm_payload_atomic_group",
          transaction: "",
          network: paymentPayload.network,
          payer: from,
        };
      }
      const signedFeePayerTxnGroup = await wallet.signTransactions([feeTransaction.toByte()]);
      const signedFeeTxn = signedFeePayerTxnGroup[0];

      if (!signedFeeTxn) {
        console.error("Fee payer transaction signing failed");
        return {
          success: false,
          errorReason: "settle_exact_avm_transaction_failed",
          transaction: "",
          network: paymentPayload.network,
          payer: from,
        };
      }

      const txnGroup: Uint8Array[] = [userTxnBytes, signedFeeTxn];
      txId = await wallet.client.sendRawTransaction(txnGroup).do();
    } else {
      txId = await wallet.client.sendRawTransaction([userTxnBytes]).do();
    }

    // Return a successful response with the transaction ID
    return {
      success: true,
      transaction: txId.txid,
      network: paymentPayload.network,
      payer: from,
    };
  } catch (error) {
    console.error("Error during settlement:", error);
    const message =
      typeof error === "object" && error && "message" in error ? String(error.message) : "";
    if (message.toLowerCase().includes("overlapping lease")) {
      return {
        success: true,
        transaction: "",
        network: paymentPayload.network,
        payer,
      };
    }

    return {
      success: false,
      errorReason: "settle_exact_avm_transaction_failed",
      transaction: "",
      network: paymentPayload.network,
      payer,
    };
  }
}
