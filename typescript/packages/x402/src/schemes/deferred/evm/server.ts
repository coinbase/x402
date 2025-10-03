import { Address, getAddress } from "viem";
import {
  DeferredEvmPayloadSchema,
  DeferredEvmPayloadSignedVoucher,
  PaymentRequirementsExtra,
} from "../../../types";
import { generateVoucherId } from "./id";
import { decodePayment } from "./utils/paymentUtils";

/**
 * Compute the extra data for the payment requirements
 *
 * @param xPaymentHeader - The x-payment header
 * @param xBuyerHeader - The x-buyer header
 * @param seller - The seller address
 * @param escrow - The escrow address
 * @param getAvailableVoucher - A function to get the latest voucher for a given buyer and seller.
 * @returns The extra data for the payment requirements
 */
export async function getPaymentRequirementsExtra(
  xPaymentHeader: string | undefined,
  xBuyerHeader: Address | undefined,
  seller: Address,
  escrow: Address,
  getAvailableVoucher: (
    buyer: string,
    seller: string,
  ) => Promise<DeferredEvmPayloadSignedVoucher | null>,
): Promise<PaymentRequirementsExtra> {
  let buyer: Address;
  const newVoucherExtra = {
    type: "new" as const,
    voucher: {
      id: generateVoucherId(),
      escrow,
    },
  };

  // No headers -> new voucher
  if (!xPaymentHeader && !xBuyerHeader) {
    return newVoucherExtra;
  }

  // Extract buyer from X-PAYMENT or X-BUYER header
  if (xPaymentHeader) {
    const paymentHeader = decodePayment(xPaymentHeader);
    const parsedPaymentPayload = DeferredEvmPayloadSchema.safeParse(paymentHeader.payload);
    if (!parsedPaymentPayload.success) {
      return newVoucherExtra;
    }
    buyer = getAddress(parsedPaymentPayload.data.voucher.buyer);
  } else {
    buyer = xBuyerHeader!; // This is safe due to the previous early return
  }

  const previousVoucher = await getAvailableVoucher(buyer, seller);
  if (previousVoucher) {
    return {
      type: "aggregation" as const,
      signature: previousVoucher.signature,
      voucher: {
        ...previousVoucher,
      },
    };
  }
  return newVoucherExtra;
}
