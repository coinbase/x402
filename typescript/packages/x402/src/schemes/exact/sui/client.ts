import { encodePayment } from "../../utils";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { ExactSuiPayload, PaymentPayload, PaymentRequirements } from "../../../types/verify";
import { SuiWallet } from "../../../types/shared/sui";
import { makePayment } from "./codegen/x402_payments/payments";
import { getPackageId } from "./contract-config";

/**
 * Creates and encodes a payment header for the given client and payment requirements.
 *
 * @param signer - The Signer instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to a base64 encoded payment header string
 */
export async function createPaymentHeader(
  signer: SuiWallet,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const paymentPayload = await createAndSignPayment(signer, x402Version, paymentRequirements);
  return encodePayment(paymentPayload);
}

/**
 * Creates and signs a payment for the given client and payment requirements.
 *
 * @param signer - The Signer instance used to sign the payment transaction
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to a payment payload containing a base64 encoded Sui transaction
 */
export async function createAndSignPayment(
  signer: SuiWallet,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const { signature, bytes } = await signer.signTransaction(
    await createTransferTransaction(signer.address, paymentRequirements),
  );

  return {
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    x402Version: x402Version,
    payload: {
      transaction: bytes,
      signature,
    } satisfies ExactSuiPayload,
  } as PaymentPayload;
}

/**
 * Creates a transfer transaction for the given payment requirements.
 *
 * @param sender - The address of the sender
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to the transaction
 */
async function createTransferTransaction(
  sender: string,
  paymentRequirements: PaymentRequirements,
): Promise<Transaction> {
  const tx = new Transaction();
  tx.setSender(sender);

  const paymentCoin = coinWithBalance({
    type: paymentRequirements.asset,
    balance: BigInt(paymentRequirements.maxAmountRequired),
  });

  const nonce: string = paymentRequirements.extra?.nonce ?? "";
  const invoiceIdBytes = new TextEncoder().encode(nonce);

  const packageId = getPackageId(paymentRequirements.network);

  tx.add(
    makePayment({
      package: packageId,
      arguments: {
        paymentCoin,
        expectedAmount: BigInt(paymentRequirements.maxAmountRequired),
        recipient: paymentRequirements.payTo,
        invoiceId: invoiceIdBytes as unknown as Array<number>,
      },
      typeArguments: [paymentRequirements.asset],
    }),
  );

  return tx;
}
