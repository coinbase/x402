import {
  Deserializer,
  SimpleTransaction,
  AccountAuthenticator,
  TransactionPayloadEntryFunction,
  TransactionPayload,
  EntryFunction,
} from "@aptos-labs/ts-sdk";

/**
 * Deserialize an Aptos transaction and authenticator from the payment payload.
 *
 * @param transactionBase64 - The base64 encoded transaction payload
 * @returns The deserialized transaction and authenticator
 */
export function deserializeAptosPayment(transactionBase64: string): {
  transaction: SimpleTransaction;
  senderAuthenticator: AccountAuthenticator;
  entryFunction?: EntryFunction;
} {
  // Decode the base64 payload
  const decoded = Buffer.from(transactionBase64, "base64").toString("utf8");
  const parsed = JSON.parse(decoded);

  // Deserialize the transaction bytes
  const transactionBytes = Uint8Array.from(parsed.transaction);
  const transaction = SimpleTransaction.deserialize(new Deserializer(transactionBytes));

  // Deserialize the authenticator bytes
  const authBytes = Uint8Array.from(parsed.senderAuthenticator);
  const senderAuthenticator = AccountAuthenticator.deserialize(new Deserializer(authBytes));

  // Only Entry Function transactions are supported, scripts and on-chain multisig are not supported.
  // TODO: Support those transaction types.
  if (!isEntryFunctionPayload(transaction.rawTransaction.payload)) {
    return { transaction, senderAuthenticator };
  }

  const entryFunction = transaction.rawTransaction.payload.entryFunction;

  return { transaction, senderAuthenticator, entryFunction };
}

/**
 * Checks if it's an entry function payload.
 *
 * @param payload - is the payload to check.
 * @returns If it's an entry function payload.
 */
export function isEntryFunctionPayload(
  payload: TransactionPayload,
): payload is TransactionPayloadEntryFunction {
  return "entryFunction" in payload;
}
