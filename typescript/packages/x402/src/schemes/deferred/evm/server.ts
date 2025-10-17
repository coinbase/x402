import { Address, getAddress } from "viem";
import {
  DeferredEvmPayloadSchema,
  DeferredEvmPayloadSignedVoucher,
  FacilitatorConfig,
  PaymentRequirementsExtra,
} from "../../../types";
import { generateVoucherId } from "./id";
import { decodePayment } from "./utils/paymentUtils";
import { useDeferredFacilitator } from "../../../verify/useDeferred";

/**
 * Compute the extra data for the payment requirements
 *
 * @param xPaymentHeader - The x-payment header
 * @param xBuyerHeader - The x-buyer header
 * @param seller - The seller address
 * @param escrow - The escrow address
 * @param asset - The asset address
 * @param chainId - The chain ID
 * @param facilitator - The facilitator URL to get escrow balance from
 * @param getAvailableVoucherLocal - A function to get the latest voucher for a given buyer and seller. If not provided, the facilitator will be used.
 * @returns The extra data for the payment requirements
 */
export async function getPaymentRequirementsExtra(
  xPaymentHeader: string | undefined,
  xBuyerHeader: Address | undefined,
  seller: Address,
  escrow: Address,
  asset: Address,
  chainId: number,
  facilitator: FacilitatorConfig,
  getAvailableVoucherLocal?: (
    buyer: string,
    seller: string,
  ) => Promise<DeferredEvmPayloadSignedVoucher | null>,
): Promise<PaymentRequirementsExtra> {
  const { getBuyerData } = useDeferredFacilitator(facilitator);

  let buyer: Address;
  const newVoucherExtra: PaymentRequirementsExtra = {
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

  // Retrieve buyer data from facilitator and/or local voucher store
  let balance = "";
  let assetAllowance = "";
  let assetPermitNonce = "";
  let success = false;
  let previousVoucher: DeferredEvmPayloadSignedVoucher | null = null;
  try {
    const response = await getBuyerData(buyer, seller, asset, escrow, chainId);
    if (!("error" in response)) {
      success = true;
      ({ balance, assetAllowance, assetPermitNonce } = response);

      if (getAvailableVoucherLocal == undefined) {
        previousVoucher = response.voucher ?? null;
      } else {
        previousVoucher = await getAvailableVoucherLocal(buyer, seller);
      }
    }
  } catch (error) {
    console.error(error);
  }

  const account = {
    balance,
    assetAllowance,
    assetPermitNonce,
    facilitator: facilitator.url,
  };

  if (previousVoucher) {
    return {
      type: "aggregation" as const,
      ...(success ? { account } : {}),
      signature: previousVoucher.signature,
      voucher: {
        ...previousVoucher,
      },
    };
  }

  if (success) newVoucherExtra.account = account;
  return newVoucherExtra;
}
