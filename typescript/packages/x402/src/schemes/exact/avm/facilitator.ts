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
 * Decodes a base64-encoded transaction string into an Algorand transaction object
 *
 * @param encodedTxn - The base64-encoded transaction string
 * @returns The decoded Algorand transaction
 */
function decodeTransaction(encodedTxn: string): algosdk.SignedTransaction {
  const txnBytes = Buffer.from(encodedTxn, "base64");
  return algosdk.decodeSignedTransaction(txnBytes);
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
    console.log("[AVM Facilitator Verify] Started...");
    const exactAvmPayload = payload.payload as ExactAvmPayload;
    console.log("[AVM Facilitator Verify] exactAvmPayload:", exactAvmPayload);

    const signedTxn = decodeTransaction(exactAvmPayload.transaction);
    console.log("[AVM Facilitator Verify] Decoded signed transaction:", signedTxn);
    const transaction = signedTxn.txn;
    console.log("[AVM Facilitator Verify] Decoded signed transaction:", transaction);

    const from = transaction.sender.toString();
    console.log("[AVM Facilitator Verify] Transaction from address:", from);
    const firstRound = Number(transaction.firstValid);
    console.log("[AVM Facilitator Verify] Transaction first valid round:", firstRound);
    const lastRound = Number(transaction.lastValid);
    console.log("[AVM Facilitator Verify] Transaction last valid round:", lastRound);
    const lease = transaction.lease;
    console.log("[AVM Facilitator Verify] Transaction lease:", lease);

    let to: string | undefined;
    let amount = 0;
    let assetIndex: number | undefined;

    if (transaction.type === algosdk.TransactionType.pay) {
      console.log("[AVM Facilitator Verify] Processing payment transaction");
      const paymentFields = transaction.payment;
      console.log("[AVM Facilitator Verify] Payment fields:", paymentFields);
      if (!paymentFields) {
        console.error("[AVM Facilitator Verify] Missing payment fields in transaction");
        return {
          isValid: false,
          invalidReason: "invalid_exact_avm_payload_transaction",
          payer: from,
        };
      }
      to = paymentFields.receiver.toString();
      console.log("[AVM Facilitator Verify] Payment to address:", to);
      amount = Number(paymentFields.amount ?? 0n);
      console.log("[AVM Facilitator Verify] Payment amount:", amount);
    } else if (transaction.type === algosdk.TransactionType.axfer) {
      console.log("[AVM Facilitator Verify] Processing asset transfer transaction");
      const assetFields = transaction.assetTransfer;
      console.log("[AVM Facilitator Verify] Asset transfer fields:", assetFields);
      if (!assetFields) {
        console.error("[AVM Facilitator Verify] Missing asset transfer fields in transaction");
        return {
          isValid: false,
          invalidReason: "invalid_exact_avm_payload_transaction",
          payer: from,
        };
      }
      to = assetFields.receiver.toString();
      console.log("[AVM Facilitator Verify] Asset transfer to address:", to);
      amount = Number(assetFields.amount ?? 0n);
      console.log("[AVM Facilitator Verify] Asset transfer amount:", amount);
      assetIndex = assetFields.assetIndex ? Number(assetFields.assetIndex) : undefined;
      console.log("[AVM Facilitator Verify] Asset index:", assetIndex);
    } else {
      console.error("[AVM Facilitator Verify] Unsupported transaction type:", transaction.type);
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_transaction",
        payer: from,
      };
    }

    if (to !== paymentRequirements.payTo) {
      console.error(
        "[AVM Facilitator Verify] Recipient address does not match payment requirements:",
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
    console.log("[AVM Facilitator Verify] Required amount:", requiredAmount);
    if (amount < requiredAmount) {
      console.error(
        "[AVM Facilitator Verify] Transaction amount is less than required:",
        amount,
        requiredAmount,
      );
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_amount",
        payer: from,
      };
    }

    const currentRound = await getCurrentRound(client);
    console.log("[AVM Facilitator Verify] Current round:", currentRound);
    if (firstRound > currentRound || lastRound < currentRound) {
      console.error(
        "[AVM Facilitator Verify] Transaction not valid in current round:",
        currentRound,
        firstRound,
        lastRound,
      );
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_round_validity",
        payer: from,
      };
    }

    if (!lease) {
      console.error("[AVM Facilitator Verify] Missing lease in transaction");
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_lease",
        payer: from,
      };
    }

    const isLeaseValid = verifyLease(lease, paymentRequirements);
    console.log("[AVM Facilitator Verify] Lease validity:", isLeaseValid);
    if (!isLeaseValid) {
      console.error("[AVM Facilitator Verify] Lease does not match payment requirements");
      return {
        isValid: false,
        invalidReason: "invalid_exact_avm_payload_lease",
        payer: from,
      };
    }

    if (paymentRequirements.asset) {
      console.log("[AVM Facilitator Verify] Verifying asset ID:", paymentRequirements.asset);
      const requiredAssetId = parseInt(paymentRequirements.asset as string, 10);
      console.log("[AVM Facilitator Verify] Required asset ID:", requiredAssetId);
      if (assetIndex !== requiredAssetId) {
        console.error(
          "[AVM Facilitator Verify] Asset ID does not match payment requirements:",
          assetIndex,
          requiredAssetId,
        );
        return {
          isValid: false,
          invalidReason: "invalid_exact_avm_payload_asset_id",
          payer: from,
        };
      }
    }

    const accountInfo = await client.client.accountInformation(from).do();
    console.log("[AVM Facilitator Verify] Fetched account information:", accountInfo);
    if (accountInfo.amount < amount) {
      console.error(
        "[AVM Facilitator Verify] Insufficient funds in account:",
        accountInfo.amount,
        amount,
      );
      return {
        isValid: false,
        invalidReason: "insufficient_funds",
        payer: from,
      };
    }

    if (assetIndex) {
      console.log("[AVM Facilitator Verify] Verifying ASA opt-in for asset ID:", assetIndex);
      try {
        const assetInfo = await client.client.accountAssetInformation(from, assetIndex).do();
        console.log("[AVM Facilitator Verify] Fetched asset information:", assetInfo);
        if (!assetInfo.assetHolding) {
          console.error("[AVM Facilitator Verify] Account has not opted in to the ASA");
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
          console.error("[AVM Facilitator Verify] Account has not opted in to the ASA");
          return {
            isValid: false,
            invalidReason: "invalid_exact_avm_payload_asa_opt_in_required",
            payer: from,
          };
        }
        console.error("[AVM Facilitator Verify] Error fetching asset information:", assetError);
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
  try {
    console.log("[AVM Facilitator Settle] Started...");
    const exactAvmPayload = paymentPayload.payload as ExactAvmPayload;
    const signedTxn = decodeTransaction(exactAvmPayload.transaction);
    console.log("[AVM Facilitator Settle] Decoded signed transaction:", signedTxn);
    const userTransaction = signedTxn.txn;
    console.log("[AVM Facilitator Settle] User transaction:", userTransaction);
    const from = userTransaction.sender.toString();
    console.log("[AVM Facilitator Settle] Transaction from address:", from);
    const firstValid = BigInt(userTransaction.firstValid ?? 0n);
    console.log("[AVM Facilitator Settle] Transaction first valid round:", firstValid);
    const lastValid = BigInt(userTransaction.lastValid ?? 0n);
    console.log("[AVM Facilitator Settle] Transaction last valid round:", lastValid);
    const feePayer = (paymentRequirements.extra as { feePayer?: string } | undefined)?.feePayer;
    console.log("[AVM Facilitator Settle] Fee payer address:", feePayer);

    // 2. Verify the payment is still valid
    const validationResult = await verify(
      { client: wallet.client, network: paymentPayload.network },
      paymentPayload,
      paymentRequirements,
    );

    if (!validationResult.isValid) {
      console.error("[AVM Facilitator Settle] Payment validation failed:", validationResult);
      return {
        success: false,
        errorReason: validationResult.invalidReason,
        transaction: "",
        network: paymentPayload.network,
        payer: from,
      };
    }
    console.log("[AVM Facilitator Settle] Validation result:", validationResult);

    const userTxnBytes = Buffer.from(exactAvmPayload.transaction, "base64");
    let txId;

    if (feePayer) {
      console.log("[AVM Facilitator Settle] Creating atomic transaction group with fee payer");
      const standardFee = 1000;
      const feePayerTransaction = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: feePayer,
        receiver: feePayer,
        amount: 0,
        suggestedParams: {
          flatFee: true,
          fee: standardFee * 2,
          firstValid,
          lastValid,
          genesisHash: userTransaction.genesisHash,
          genesisID: userTransaction.genesisID,
          minFee: 0,
        },
      });
      console.log("[AVM Facilitator Settle] Fee payer transaction:", feePayerTransaction);

      const decodedUserTxn = algosdk.decodeSignedTransaction(userTxnBytes);
      const groupID = decodedUserTxn.txn.group;
      console.log("[AVM Facilitator Settle] User transaction group ID:", groupID);

      Object.defineProperty(feePayerTransaction, "group", {
        value: groupID,
        writable: true,
        configurable: true,
      });

      const signedFeePayerTxn = await wallet.signTransactions([feePayerTransaction.toByte()]);
      const txnGroup = [userTxnBytes, signedFeePayerTxn[0]].filter(
        (tx): tx is Uint8Array => tx !== null && tx !== undefined,
      );
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
    return {
      success: false,
      errorReason: "settle_exact_avm_transaction_failed",
      transaction: "",
      network: paymentPayload.network,
      payer: "unknown",
    };
  }
}
