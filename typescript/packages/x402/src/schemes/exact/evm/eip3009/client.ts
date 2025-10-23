import { Address, Chain, LocalAccount, Transport } from "viem";
import { isSignerWallet, SignerWallet } from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  UnsignedEip3009PaymentPayload,
  Eip3009PaymentPayload,
} from "../../../../types/verify";
import { createNonce, signAuthorization } from "./sign";
import { encodePayment } from "../utils/paymentUtils";

/**
 * Prepares an unsigned EIP-3009 payment header with the given sender address and payment requirements.
 *
 * @param from - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned EIP-3009 payment payload containing authorization details
 */
export function preparePaymentHeader(
  from: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): UnsignedEip3009PaymentPayload {
  const nonce = createNonce();

  const validAfter = BigInt(
    Math.floor(Date.now() / 1000) - 600, // 10 minutes before
  ).toString();
  const validBefore = BigInt(
    Math.floor(Date.now() / 1000 + paymentRequirements.maxTimeoutSeconds),
  ).toString();

  return {
    x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      authorizationType: "eip3009" as const,
      signature: undefined,
      authorization: {
        from,
        to: paymentRequirements.payTo as Address,
        value: paymentRequirements.maxAmountRequired,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
}

/**
 * Signs an EIP-3009 payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the payment header
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param unsignedPaymentHeader - The unsigned EIP-3009 payment payload to be signed
 * @returns A promise that resolves to the signed EIP-3009 payment payload
 */
export async function signPaymentHeader<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: UnsignedEip3009PaymentPayload,
): Promise<Eip3009PaymentPayload> {
  const { authorization } = unsignedPaymentHeader.payload;

  const { signature } = await signAuthorization(client, authorization, paymentRequirements);

  return {
    ...unsignedPaymentHeader,
    payload: {
      authorizationType: "eip3009",
      signature,
      authorization,
    },
  };
}

/**
 * Creates a complete EIP-3009 payment payload by preparing and signing a payment header.
 *
 * @param client - The signer wallet instance used to create and sign the payment
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the complete signed EIP-3009 payment payload
 */
export async function createPayment<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<Eip3009PaymentPayload> {
  const from = isSignerWallet(client) ? client.account!.address : client.address;
  const unsignedPaymentHeader = preparePaymentHeader(from, x402Version, paymentRequirements);
  return signPaymentHeader(client, paymentRequirements, unsignedPaymentHeader);
}

/**
 * Creates and encodes an EIP-3009 payment header for the given client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the encoded EIP-3009 payment header string
 */
export async function createPaymentHeader(
  client: SignerWallet | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const payment = await createPayment(client, x402Version, paymentRequirements);
  return encodePayment(payment);
}
