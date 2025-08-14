import { LocalAccount } from "viem";
import { createPaymentHeader as createPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { createPaymentHeader as createPaymentHeaderExactSVM } from "../schemes/exact/svm/client";
import { createPaymentHeader as createPaymentHeaderExactSui } from "../schemes/exact/sui/client";
import { SupportedEVMNetworks, SupportedSVMNetworks, SupportedSuiNetworks } from "../types/shared";
import { SignerWallet } from "../types/shared/evm";
import { PaymentRequirements } from "../types/verify";
import { KeyPairSigner } from "@solana/kit";
import { SuiWallet } from "../types/shared/sui";

/**
 * Creates a payment header based on the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the created payment header string
 */
export async function createPaymentHeader(
  client: SignerWallet | LocalAccount | KeyPairSigner | SuiWallet,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return await createPaymentHeaderExactEVM(
        client as SignerWallet | LocalAccount,
        x402Version,
        paymentRequirements,
      );
    }
    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await createPaymentHeaderExactSVM(
        client as KeyPairSigner,
        x402Version,
        paymentRequirements,
      );
    }
    // sui
    if (SupportedSuiNetworks.includes(paymentRequirements.network)) {
      return await createPaymentHeaderExactSui(
        client as SuiWallet,
        x402Version,
        paymentRequirements,
      );
    }
    throw new Error("Unsupported network");
  }
  throw new Error("Unsupported scheme");
}
