/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * X402 Payments Contract A simple contract for processing x402 payments with exact
 * amount verification
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
const $moduleName = "@x402/payments::payments";
export const PaymentMade = new MoveStruct({
  name: `${$moduleName}::PaymentMade`,
  fields: {
    amount: bcs.u64(),
    recipient: bcs.Address,
    invoice_id: bcs.vector(bcs.u8()),
  },
});
export interface MakePaymentArguments {
  paymentCoin: RawTransactionArgument<string>;
  expectedAmount: RawTransactionArgument<number | bigint>;
  recipient: RawTransactionArgument<string>;
  invoiceId: RawTransactionArgument<number[]>;
}
export interface MakePaymentOptions {
  package?: string;
  arguments:
    | MakePaymentArguments
    | [
        paymentCoin: RawTransactionArgument<string>,
        expectedAmount: RawTransactionArgument<number | bigint>,
        recipient: RawTransactionArgument<string>,
        invoiceId: RawTransactionArgument<number[]>,
      ];
  typeArguments: [string];
}
/**
 * Make a payment with exact amount verification @param payment_coin The coin to
 * use for payment @param expected_amount The exact amount expected (must match
 * coin value) @param recipient The address to send the payment to @param
 * invoice_id An opaque identifier for the payment/invoice
 */
export function makePayment(options: MakePaymentOptions) {
  const packageAddress = options.package ?? "@x402/payments";
  const argumentsTypes = [
    `0x0000000000000000000000000000000000000000000000000000000000000002::coin::Coin<${options.typeArguments[0]}>`,
    "u64",
    "address",
    "vector<u8>",
  ] satisfies string[];
  const parameterNames = ["paymentCoin", "expectedAmount", "recipient", "invoiceId"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "payments",
      function: "make_payment",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
      typeArguments: options.typeArguments,
    });
}
export interface VersionOptions {
  package?: string;
  arguments?: [];
}
/** Get the module version (for debugging/verification) */
export function version(options: VersionOptions = {}) {
  const packageAddress = options.package ?? "@x402/payments";
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "payments",
      function: "version",
    });
}
