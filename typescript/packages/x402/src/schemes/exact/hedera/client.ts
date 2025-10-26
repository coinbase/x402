import { encodePayment } from "../evm/utils/paymentUtils";
import {
  AccountId,
  TokenId,
  Transaction,
  TransferTransaction,
  Hbar,
  TransactionId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId
} from "@hashgraph/sdk";
import { PaymentPayload, PaymentRequirements } from "../../../types/verify";
import { HederaSigner, serializeTransaction } from "../../../shared/hedera";

/**
 * Creates and encodes a payment header for the given client and payment requirements.
 * 
 * This function orchestrates the complete payment creation process:
 * 1. Creates and signs a payment transaction
 * 2. Encodes the payment payload into a base64 string
 * 3. Returns the encoded payment header for transmission
 *
 * @param client - The Hedera signer instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to a base64 encoded payment header string
 * 
 * @throws Error if payment creation or encoding fails
 * 
 * @example
 * ```typescript
 * const paymentHeader = await createPaymentHeader(
 *   hederaSigner,
 *   1,
 *   {
 *     scheme: "exact",
 *     network: "hedera-testnet",
 *     maxAmountRequired: "100000000", // 1 HBAR in tinybars
 *     payTo: "0.0.123456",
 *     asset: "0.0.0", // HBAR
 *     extra: { feePayer: "0.0.789012" }
 *   }
 * );
 * ```
 */
export async function createPaymentHeader(
  client: HederaSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const paymentPayload = await createAndSignPayment(client, x402Version, paymentRequirements);
  return encodePayment(paymentPayload);
}

/**
 * Creates and signs a payment for the given client and payment requirements.
 * 
 * This function handles the core payment creation workflow:
 * 1. Creates the appropriate transfer transaction (HBAR or token)
 * 2. Signs the transaction with the client's private key
 * 3. Serializes the signed transaction to base64
 * 4. Returns a complete payment payload
 *
 * @param client - The Hedera signer instance used to create and sign the payment tx
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing transfer details
 * @returns A promise that resolves to a payment payload containing a base64 encoded Hedera transaction
 * 
 * @throws Error if transaction creation, signing, or serialization fails
 * 
 * @example
 * ```typescript
 * const paymentPayload = await createAndSignPayment(
 *   hederaSigner,
 *   1,
 *   {
 *     scheme: "exact",
 *     network: "hedera-testnet",
 *     maxAmountRequired: "1000000", // Token amount
 *     payTo: "0.0.123456",
 *     asset: "0.0.429274", // Token ID
 *     extra: { feePayer: "0.0.789012" }
 *   }
 * );
 * ```
 */
export async function createAndSignPayment(
  client: HederaSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const transaction = await createTransferTransaction(client, paymentRequirements);
  const signedTransaction = await transaction.sign(client.privateKey);
  const base64EncodedTransaction = serializeTransaction(signedTransaction);

  // return payment payload
  return {
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    x402Version: x402Version,
    payload: {
      transaction: base64EncodedTransaction,
    },
  } as PaymentPayload;
}

/**
 * Creates a transfer transaction for the given client and payment requirements.
 * 
 * This function determines whether to create a HBAR (native currency) transfer
 * or a token transfer based on the asset type, then delegates to the appropriate
 * transaction creation function.
 *
 * @param client - The Hedera signer instance used to create the transfer transaction
 * @param paymentRequirements - The payment requirements containing asset and amount info
 * @returns A promise that resolves to the transaction with the transfer instruction
 * @throws Error if feePayer is not provided in paymentRequirements.extra
 */
async function createTransferTransaction(
  client: HederaSigner,
  paymentRequirements: PaymentRequirements,
): Promise<Transaction> {
  // Extract facilitator's account ID from payment requirements
  // The facilitator acts as the fee payer for the transaction
  const facilitatorAccountIdStr = paymentRequirements.extra?.feePayer as string;
  if (!facilitatorAccountIdStr) {
    throw new Error("feePayer is required in paymentRequirements.extra");
  }
  const facilitatorAccountId = AccountId.fromString(facilitatorAccountIdStr);

  // Determine transfer type based on asset identifier
  // HBAR transfers use native currency, token transfers use specific token IDs
  if (isHbarAddress(paymentRequirements.asset)) {
    return createHbarTransferTransaction(client, facilitatorAccountId, paymentRequirements);
  } else {
    return createTokenTransferTransaction(client, facilitatorAccountId, paymentRequirements);
  }
}

/**
 * Creates a HBAR (native currency) transfer transaction.
 * 
 * This function creates a transfer transaction for native HBAR currency.
 * The transaction is generated with the facilitator as the fee payer and
 * includes the transfer from the client's account to the recipient.
 *
 * @param client - The Hedera signer instance (sender)
 * @param facilitatorAccountId - The facilitator's account ID (fee payer)
 * @param paymentRequirements - Payment details including recipient and amount
 * @returns A frozen TransferTransaction ready for signing
 */
function createHbarTransferTransaction(
  client: HederaSigner,
  facilitatorAccountId: AccountId,
  paymentRequirements: PaymentRequirements,
): TransferTransaction {
  // Generate transaction ID with facilitator as the fee payer
  const transactionId = TransactionId.generate(facilitatorAccountId);
  const fromAccount = client.accountId;
  const toAccount = AccountId.fromString(paymentRequirements.payTo);
  const amount = paymentRequirements.maxAmountRequired;

  // Create HBAR transfer transaction
  // Negative amount for sender (debit), positive amount for recipient (credit)
  const transaction = new TransferTransaction()
    .setTransactionId(transactionId)
    .addHbarTransfer(fromAccount, Hbar.fromTinybars(-amount))
    .addHbarTransfer(toAccount, Hbar.fromTinybars(amount));

  // Freeze the transaction with the client's network connection
  return transaction.freezeWith(client.client);
}

/**
 * Creates a token transfer transaction.
 * 
 * This function creates a transfer transaction for Hedera tokens (HTS tokens).
 * The transaction transfers the specified token amount from the client's account
 * to the recipient account, with the facilitator acting as the fee payer.
 *
 * @param client - The Hedera signer instance (sender)
 * @param facilitatorAccountId - The facilitator's account ID (fee payer)
 * @param paymentRequirements - Payment details including recipient, amount, and token ID
 * @returns A frozen TransferTransaction ready for signing
 */
function createTokenTransferTransaction(
  client: HederaSigner,
  facilitatorAccountId: AccountId,
  paymentRequirements: PaymentRequirements,
): TransferTransaction {
  // Generate transaction ID with facilitator as the fee payer
  const transactionId = TransactionId.generate(facilitatorAccountId);
  const fromAccount = client.accountId;
  const toAccount = AccountId.fromString(paymentRequirements.payTo);
  const amount = paymentRequirements.maxAmountRequired;
  const toTokenId = TokenId.fromString(paymentRequirements.asset);

  // Create token transfer transaction
  // Negative amount for sender (debit), positive amount for recipient (credit)
  const transaction = new TransferTransaction()
    .setTransactionId(transactionId)
    .addTokenTransfer(toTokenId, fromAccount, -parseInt(amount))
    .addTokenTransfer(toTokenId, toAccount, parseInt(amount));

  // Freeze the transaction with the client's network connection
  return transaction.freezeWith(client.client);
}


/**
 * Checks if the asset identifier represents HBAR (native currency).
 * 
 * HBAR is Hedera's native cryptocurrency and can be identified by:
 * - "0.0.0" - The standard HBAR token ID
 * - "HBAR" (case-insensitive) - The string representation
 * 
 * This function is used to determine whether to create a native HBAR transfer
 * or a token transfer transaction.
 * 
 * @param asset - The asset identifier string
 * @returns True if the asset represents HBAR native currency
 * 
 * @example
 * ```typescript
 * isHbarAddress("0.0.0")     // true
 * isHbarAddress("HBAR")      // true
 * isHbarAddress("hbar")      // true
 * isHbarAddress("0.0.123")   // false
 * ```
 */
function isHbarAddress(asset: string): boolean {
  return asset === "0.0.0" || asset.toLowerCase() === "hbar";
}