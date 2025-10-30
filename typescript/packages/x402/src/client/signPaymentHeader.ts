import { signPaymentHeader as signPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { signPermitPaymentHeader } from "../schemes/exact/evm/permit-client";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils";
import {
  isEvmSignerWallet,
  isMultiNetworkSigner,
  MultiNetworkSigner,
  Signer,
  SupportedEVMNetworks,
} from "../types/shared";
import {
  PaymentRequirements,
  UnsignedPaymentPayload,
  ExactEvmPayload,
  ExactEvmPermitPayload,
} from "../types/verify";

/**
 * Type guard to check if unsigned payload is authorization
 *
 * @param payload - The unsigned payment payload to check
 * @returns True if the payload contains an authorization object
 */
function isUnsignedAuthorizationPayload(
  payload: UnsignedPaymentPayload["payload"],
): payload is Omit<ExactEvmPayload, "signature"> & { signature: undefined } {
  return "authorization" in payload && typeof payload.authorization === "object";
}

/**
 * Type guard to check if unsigned payload is permit
 *
 * @param payload - The unsigned payment payload to check
 * @returns True if the payload contains a permit object
 */
function isUnsignedPermitPayload(
  payload: UnsignedPaymentPayload["payload"],
): payload is Omit<ExactEvmPermitPayload, "signature"> & { signature: undefined } {
  return "permit" in payload && typeof payload.permit === "object";
}

/**
 * Signs a payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the payment header
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param unsignedPaymentHeader - The unsigned payment payload to be signed
 * @returns A promise that resolves to the encoded signed payment header string
 */
export async function signPaymentHeader(
  client: Signer | MultiNetworkSigner,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: UnsignedPaymentPayload,
): Promise<string> {
  if (
    paymentRequirements.scheme === "exact" &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

    if (!isEvmSignerWallet(evmClient)) {
      throw new Error("Invalid evm wallet client provided");
    }

    // Route to appropriate signing function based on payload type
    if (isUnsignedAuthorizationPayload(unsignedPaymentHeader.payload)) {
      const signedPaymentHeader = await signPaymentHeaderExactEVM(
        evmClient,
        paymentRequirements,
        unsignedPaymentHeader as Parameters<typeof signPaymentHeaderExactEVM>[2],
      );
      return encodePayment(signedPaymentHeader);
    } else if (isUnsignedPermitPayload(unsignedPaymentHeader.payload)) {
      const signedPaymentHeader = await signPermitPaymentHeader(
        evmClient,
        paymentRequirements,
        unsignedPaymentHeader as Parameters<typeof signPermitPaymentHeader>[2],
      );
      return encodePayment(signedPaymentHeader);
    } else {
      throw new Error("Invalid unsigned payment payload type");
    }
  }

  throw new Error("Unsupported scheme");
}