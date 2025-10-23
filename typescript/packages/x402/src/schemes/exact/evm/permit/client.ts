import { Address, Chain, LocalAccount, Transport } from "viem";
import { isSignerWallet, SignerWallet } from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  UnsignedPermitPaymentPayload,
  PermitPaymentPayload,
} from "../../../../types/verify";
import { signPermit } from "./sign";
import { encodePayment } from "../utils/paymentUtils";

/**
 * Prepares an unsigned EIP-2612 Permit payment header
 *
 * @param from - The token owner's address
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned Permit payment payload containing permit authorization details
 */
export function preparePaymentHeader(
  from: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): UnsignedPermitPaymentPayload {
  const deadline = BigInt(
    Math.floor(Date.now() / 1000 + paymentRequirements.maxTimeoutSeconds),
  ).toString();

  return {
    x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      authorizationType: "permit" as const,
      signature: undefined,
      authorization: {
        owner: from,
        spender: paymentRequirements.payTo as Address,
        value: paymentRequirements.maxAmountRequired,
        deadline,
      },
    },
  };
}

/**
 * Signs a Permit payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the permit
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param unsignedPaymentHeader - The unsigned Permit payment payload to be signed
 * @returns A promise that resolves to the signed Permit payment payload
 */
export async function signPaymentHeader<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: UnsignedPermitPaymentPayload,
): Promise<PermitPaymentPayload> {
  const { owner, spender, value, deadline } = unsignedPaymentHeader.payload.authorization;

  const { signature, nonce } = await signPermit(
    client,
    { owner, spender, value, deadline },
    paymentRequirements,
  );

  return {
    ...unsignedPaymentHeader,
    payload: {
      authorizationType: "permit",
      signature,
      authorization: {
        owner,
        spender,
        value,
        deadline,
        nonce,
      },
    },
  };
}

/**
 * Creates a complete Permit payment payload by preparing and signing a payment header.
 *
 * @param client - The signer wallet instance used to create and sign the payment
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the complete signed Permit payment payload
 */
export async function createPayment<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PermitPaymentPayload> {
  const from = isSignerWallet(client) ? client.account!.address : client.address;
  const unsignedPaymentHeader = preparePaymentHeader(from, x402Version, paymentRequirements);
  return signPaymentHeader(client, paymentRequirements, unsignedPaymentHeader);
}

/**
 * Creates and encodes a Permit payment header for the given client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the encoded payment header string
 */
export async function createPaymentHeader(
  client: SignerWallet | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const payment = await createPayment(client, x402Version, paymentRequirements);
  return encodePayment(payment);
}
