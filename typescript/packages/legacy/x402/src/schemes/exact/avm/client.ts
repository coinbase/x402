import { PaymentPayload, PaymentRequirements } from "../../../types/verify";
import { ExactAvmPayload, WalletAccount, AlgorandClient } from "./types";
import { encodePayment } from "./utils/paymentUtils";
import { AlgodClient } from "@algorandfoundation/algokit-utils/algod-client";
import { Address } from "@algorandfoundation/algokit-utils/common";
import {
  Transaction,
  TransactionType,
  groupTransactions,
  encodeTransactionRaw,
} from "@algorandfoundation/algokit-utils/transact";

/**
 * Interface representing a payment payload
 */
interface AtomicTransactionGroup {
  paymentIndex: number;
  paymentGroup: string[];
}

/**
 * Gets the current round from the Algorand client
 *
 * @param client - The Algorand client
 * @returns The current round number
 */
async function getCurrentRound(client: AlgorandClient): Promise<number> {
  const status = await client.client.status();
  // Algod may return either camelCase or hyphenated keys depending on the transport.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusAny = status as any;
  const lastRound = statusAny.lastRound ?? statusAny["last-round"];
  if (typeof lastRound === "undefined") {
    throw new Error("Unable to determine current round from algod status response");
  }

  const round = typeof lastRound === "bigint" ? Number(lastRound) : Number(lastRound);
  if (Number.isNaN(round)) {
    throw new Error("Algod status did not contain a numeric round value");
  }

  return round;
}

/**
 * Suggested params type for transaction construction
 */
interface SuggestedParams {
  fee: bigint;
  firstValid: bigint;
  lastValid: bigint;
  genesisHash: Uint8Array;
  genesisId: string;
  flatFee?: boolean;
}

/**
 * X402 transaction group builder for Algorand
 * Simplifies creation of complex transaction groups for x402 payments
 */
export class X402TransactionGroupBuilder {
  private transactions: Transaction[] = [];
  private txnIndices: number[] = [];

  /**
   * Adds a x402 payment transaction to the group
   *
   * @param from - Sender address
   * @param to - Recipient address
   * @param amount - Amount to send
   * @param params - Transaction parameters
   * @param asset - Optional asset ID for ASA transfers
   * @returns Index of the added transaction in the group
   */
  addX402Payment(
    from: string,
    to: string,
    amount: number,
    params: SuggestedParams,
    asset?: number,
  ): number {
    let txn: Transaction;
    if (asset) {
      txn = new Transaction({
        type: TransactionType.AssetTransfer,
        sender: Address.fromString(from),
        fee: params.fee,
        firstValid: params.firstValid,
        lastValid: params.lastValid,
        genesisHash: params.genesisHash,
        genesisId: params.genesisId,
        assetTransfer: {
          receiver: Address.fromString(to),
          amount: BigInt(amount),
          assetId: BigInt(asset),
        },
      });
    } else {
      txn = new Transaction({
        type: TransactionType.Payment,
        sender: Address.fromString(from),
        fee: params.fee,
        firstValid: params.firstValid,
        lastValid: params.lastValid,
        genesisHash: params.genesisHash,
        genesisId: params.genesisId,
        payment: {
          receiver: Address.fromString(to),
          amount: BigInt(amount),
        },
      });
    }

    const currentIndex = this.transactions.length;
    this.transactions.push(txn);
    this.txnIndices.push(currentIndex);

    return currentIndex;
  }

  /**
   * Adds a fee payer transaction to cover transaction fees
   *
   * @param feePayer - Address of the fee payer
   * @param fee - Fee amount to cover
   * @param params - Transaction parameters
   * @returns Index of the fee transaction in the group
   */
  addX402FeePayment(feePayer: string, fee: number, params: SuggestedParams): number {
    const txn = new Transaction({
      type: TransactionType.Payment,
      sender: Address.fromString(feePayer),
      fee: BigInt(fee),
      firstValid: params.firstValid,
      lastValid: params.lastValid,
      genesisHash: params.genesisHash,
      genesisId: params.genesisId,
      payment: {
        receiver: Address.fromString(feePayer),
        amount: BigInt(0),
      },
    });

    const currentIndex = this.transactions.length;
    this.transactions.push(txn);
    this.txnIndices.push(currentIndex);

    return currentIndex;
  }

  /**
   * Builds the transaction group and returns it as a base64-encoded array
   * with the specified paymentIndex
   *
   * @param paymentIndex - Index of the payment transaction in the group
   * @returns AtomicTransactionGroup with base64-encoded transactions
   */
  buildGroup(paymentIndex: number): AtomicTransactionGroup {
    if (paymentIndex >= this.transactions.length) {
      throw new Error("Payment index out of bounds");
    }

    // Assign group ID to all transactions
    groupTransactions(this.transactions);

    const encodedGroup = this.transactions.map(txn =>
      Buffer.from(encodeTransactionRaw(txn)).toString("base64"),
    );

    return {
      paymentIndex,
      paymentGroup: encodedGroup,
    };
  }
}

/**
 * Creates an atomic transaction group for a payment
 *
 * @param client - The Algorand client
 * @param from - The sender's address
 * @param to - The recipient's address
 * @param amount - The payment amount in microAlgos
 * @param firstRound - The first valid round
 * @param lastRound - The last valid round
 * @param asset - Optional asset ID for ASA transfers
 * @param feePayer - Optional fee payer address for pooled-fee execution
 * @returns An object containing the user transaction and, when applicable, the fee payer transaction
 */
async function createAtomicTransactionGroup(
  client: AlgorandClient,
  from: string,
  to: string,
  amount: number,
  firstRound: number,
  lastRound: number,
  asset?: number,
  feePayer?: string,
): Promise<AtomicTransactionGroup> {
  const standardFee = 1000;

  const params = await client.client.suggestedParams();

  params.firstValid = BigInt(firstRound);
  params.lastValid = BigInt(lastRound);

  const composer = new X402TransactionGroupBuilder();
  let paymentIndex: number;

  if (feePayer) {
    // Add fee payer transaction
    composer.addX402FeePayment(feePayer, standardFee * 2, {
      ...params,
      fee: BigInt(standardFee * 2),
    });

    // Add payment transaction with zero fee (covered by fee payer)
    params.fee = BigInt(0);
    paymentIndex = composer.addX402Payment(from, to, amount, params, asset);
  } else {
    // Add payment transaction with standard fee
    params.fee = BigInt(standardFee);
    paymentIndex = composer.addX402Payment(from, to, amount, params, asset);
  }

  return composer.buildGroup(paymentIndex);
}

/**
 * Prepares an unsigned payment header with the given sender address and payment requirements.
 *
 * @param client - The Algorand client used for blockchain interactions
 * @param from - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload containing transaction details
 */
export async function preparePaymentHeader(
  client: AlgorandClient,
  from: string,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<ExactAvmPayload> {
  const currentRound = await getCurrentRound(client);
  const validityWindow = 1000;
  const firstRound = currentRound;
  const lastRound = currentRound + validityWindow;

  const amount = parseInt(paymentRequirements.maxAmountRequired, 10);
  const feePayer =
    (paymentRequirements.extra as { feePayer?: string } | undefined)?.feePayer || undefined;
  const atomicGroup = await createAtomicTransactionGroup(
    client,
    from,
    paymentRequirements.payTo,
    amount,
    firstRound,
    lastRound,
    paymentRequirements.asset ? parseInt(paymentRequirements.asset as string, 10) : undefined,
    feePayer,
  );

  return atomicGroup;
}

/**
 * Signs a payment header using the provided wallet and payment requirements.
 *
 * @param wallet - The wallet instance used to sign the payment header
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param unsignedPaymentHeader - The unsigned payment payload to be signed
 * @returns A promise that resolves to the signed payment payload
 */
export async function signPaymentHeader(
  wallet: WalletAccount,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: ExactAvmPayload,
): Promise<PaymentPayload> {
  const { paymentIndex, paymentGroup } = unsignedPaymentHeader;
  if (!paymentGroup) {
    throw new Error("Transaction group is missing from unsigned payment header");
  }

  const txnGroupBytes: Uint8Array[] = paymentGroup.map(pg => Buffer.from(pg, "base64"));
  const indexesToSign = [paymentIndex]; // Sign only the user transaction

  const signedTxnGroup = await wallet.signTransactions(txnGroupBytes, indexesToSign);

  // Create a new paymentGroup with the signed transaction
  const resultPaymentGroup = [...paymentGroup];
  if (signedTxnGroup[paymentIndex]) {
    resultPaymentGroup[paymentIndex] = Buffer.from(
      signedTxnGroup[paymentIndex] as Uint8Array,
    ).toString("base64");
  } else {
    throw new Error("Wallet did not return a signed user transaction");
  }

  const payload: ExactAvmPayload = {
    paymentIndex,
    paymentGroup: resultPaymentGroup,
  };

  return {
    x402Version: 1,
    scheme: "exact",
    network: paymentRequirements.network,
    payload,
  };
}

/**
 * Creates a complete payment payload by preparing and signing a payment header.
 *
 * @param client - The Algorand client used for blockchain interactions
 * @param wallet - The wallet instance used to create and sign the payment
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the complete signed payment payload
 */
export async function createPayment(
  client: AlgorandClient,
  wallet: WalletAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const from = wallet.address;
  const unsignedPaymentHeader = await preparePaymentHeader(
    client,
    from,
    x402Version,
    paymentRequirements,
  );
  return signPaymentHeader(wallet, paymentRequirements, unsignedPaymentHeader);
}

/**
 * Creates and encodes a payment header for the given wallet and payment requirements.
 *
 * @param client - The Algorand client used for blockchain interactions
 * @param wallet - The wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the encoded payment header string
 */
export async function createPaymentHeader(
  client: AlgorandClient,
  wallet: WalletAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const payment = await createPayment(client, wallet, x402Version, paymentRequirements);
  return encodePayment(payment);
}
