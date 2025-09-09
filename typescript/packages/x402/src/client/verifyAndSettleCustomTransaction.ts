import { FacilitatorConfig, Money, moneySchema, Network, PaymentRequirements, settleResponseHeader } from "../types";
import { useFacilitator } from "../verify";
import { processPriceToAtomicAmount } from "../shared";
import { exact } from "../schemes";

/**
 * Sends a payment transaction to a specified destination address.
 *
 * @param {number} amount - The amount to send
 * @param {string} address - The recipient's wallet address
 * @param {FacilitatorConfig} facilitator - The facilitator configuration
 * @param {PaymentRequirements} paymentDetails - The payment details
 * @param {string} paymentHeader - The payment header
 * @param {string} resource - The resource to send
 * @param {Network} network - The network to use
 * @returns {Promise<{success: boolean, message: string, responseHeader: string, error?: string}>} An object containing:
 *   - success: A boolean indicating if the payment was successful
 *   - message: A string describing the transaction result or error
 *   - responseHeader: The response header if successful, empty string if failed
 *   - error: The error message if failed
*/
export async function verifyAndSettleCustomTransaction(
  amount: Money,
  address: string,
  facilitator: FacilitatorConfig,
  {
    paymentHeader,
    resource,
    network
  }: {
    paymentHeader: string;
    resource: `${string}://${string}`;
    network: Network;
  }
): Promise<{ success: boolean; message: string; responseHeader: string; error?: string }> {
  try {
    const { verify, settle } = useFacilitator(facilitator);
    const parsedAmount = moneySchema.safeParse(amount);
    if (!parsedAmount.success) {
      throw new Error(
        `Invalid amount (amount: ${amount}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`
      );
    }

    if (!paymentHeader) {
      throw new Error("No payment header found");
    }

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
      payTo: address,
      maxTimeoutSeconds: 300,
      asset: asset.address,
      outputSchema: undefined,
      extra: asset?.eip712,
    };

    const decodedPayment = exact.evm.decodePayment(paymentHeader);

    try {
      const response = await verify(decodedPayment, paymentDetails);
      if (!response.isValid) {
        console.error("Invalid payment:", response.invalidReason);
        return {
          success: false,
          message: response.invalidReason || "Invalid payment",
          responseHeader: "",
        };
      }
    } catch (error: any) {
      console.error("Error during payment verification:", error);
      return {
        success: false,
        message: "Error during payment verification",
        responseHeader: "",
        error: error.message,
      };
    }

    try {
      const settlement = await settle(decodedPayment, paymentDetails);
      const responseHeader = settleResponseHeader(settlement);
      return {
        success: true,
        message: "Payment settled successfully",
        responseHeader,
      };
    } catch (error: any) {
      console.error("Settlement failed:", error.response.data);
      return {
        success: false,
        message: "Settlement failed",
        error: error.response.data,
        responseHeader: "",
      };
    }
  } catch (error: any) {
    return {
      message: "Error during payment verification: " + error.message,
      success: false,
      error: error.message,
      responseHeader: "",
    };
  }
}