import { createPaymentHeader } from "./createPaymentHeader";
import { processPriceToAtomicAmount } from "../shared";
import { Network, PaymentRequirements } from "../types";
import { SignerWallet } from "../types/shared/evm";

/**
   * Signs a custom transaction for a specified asset.
   *
   * @param {number} amount - The amount to send
   * @param {string} sellerWalletAddress - The seller's wallet address
   * @param {string} resource - The resource to send
   * @param {SignerWallet} buyerWallet - The buyer's wallet
   * @param {Network} network - The network to use
   * @returns {Promise<{paymentHeader: string}>} An string containing the payment header
   */

export async function signCustomTransaction(
  amount: number,
  sellerWalletAddress: string,
  resource: `${string}://${string}`,
  buyerWallet: SignerWallet,
  network: Network
): Promise<string> {
  try {
    const atomicAmountForAsset = processPriceToAtomicAmount(
      amount,
      network
    );
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const paymentDetails: PaymentRequirements = {
      scheme: "exact",
      network,
      maxAmountRequired,
      resource,
      description: "Payment for order",
      mimeType: "application/json",
      payTo: sellerWalletAddress,
      maxTimeoutSeconds: 300,
      asset: asset.address,
      outputSchema: undefined,
      extra: asset?.eip712,
    };
    
    const paymentHeader = await createPaymentHeader(
      buyerWallet,
      1,
      paymentDetails
    );

    return paymentHeader;
  } catch (error: any) {
    return error.message;
  }
}