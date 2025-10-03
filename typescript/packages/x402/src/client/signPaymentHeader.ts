import { signPaymentHeader as signPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { isEvmSignerWallet, isMultiNetworkSigner, MultiNetworkSigner, Signer, SupportedEVMNetworks } from "../types/shared";
import { signPaymentHeader as signPaymentHeaderDeferredEVM } from "../schemes/deferred/evm/client";
import { encodePayment as encodePaymentExactEVM } from "../schemes/exact/evm/utils/paymentUtils";
import { encodePayment as encodePaymentDeferredEVM } from "../schemes/deferred/evm/utils/paymentUtils";
import { PaymentRequirements, UnsignedPaymentPayload } from "../types/verify";
import { UnsignedDeferredPaymentPayloadSchema } from "../types/verify/schemes/deferred";
import { UnsignedExactPaymentPayloadSchema } from "../types/verify/schemes/exact";
import { DEFERRRED_SCHEME } from "../types/verify/schemes/deferred";
import { EXACT_SCHEME } from "../types/verify/schemes/exact";

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
    paymentRequirements.scheme === EXACT_SCHEME &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

    if (!isEvmSignerWallet(evmClient)) {
      throw new Error("Invalid evm wallet client provided");
    }
    unsignedPaymentHeader = UnsignedExactPaymentPayloadSchema.parse(unsignedPaymentHeader);
    const signedPaymentHeader = await signPaymentHeaderExactEVM(evmClient, paymentRequirements, unsignedPaymentHeader);
    return encodePaymentExactEVM(signedPaymentHeader);
  }

  if (
    paymentRequirements.scheme === DEFERRRED_SCHEME &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

    if (!isEvmSignerWallet(evmClient)) {
      throw new Error("Invalid evm wallet client provided");
    }

    unsignedPaymentHeader = UnsignedDeferredPaymentPayloadSchema.parse(unsignedPaymentHeader);
    const signedPaymentHeader = await signPaymentHeaderDeferredEVM(evmClient, unsignedPaymentHeader);
    return encodePaymentDeferredEVM(signedPaymentHeader);
  }

  throw new Error("Unsupported scheme");
}