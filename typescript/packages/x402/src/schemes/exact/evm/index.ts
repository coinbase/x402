import { Account, Chain, Transport } from "viem";
import { ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ExactEvmPayload,
} from "../../../types/verify";
import * as eip3009Facilitator from "./eip3009/facilitator";
import * as permitFacilitator from "./permit/facilitator";
import * as permit2Facilitator from "./permit2/facilitator";

// Export all three authorization types
export * as eip3009 from "./eip3009";
export * as permit from "./permit";
export * as permit2 from "./permit2";

// Export utilities
export * from "./utils/paymentUtils";

/**
 * Unified verify function that routes to the appropriate authorization type handler
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the payment is valid
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const exactEvmPayload = payload.payload as ExactEvmPayload;

  // Route to appropriate verification based on authorization type
  switch (exactEvmPayload.authorizationType) {
    case "eip3009":
      return eip3009Facilitator.verify(client, payload, paymentRequirements);

    case "permit":
      return permitFacilitator.verify(client, payload, paymentRequirements);

    case "permit2":
      return permit2Facilitator.verify(client, payload, paymentRequirements);

    default:
      return {
        isValid: false,
        invalidReason: "unsupported_authorization_type",
        payer: "",
      };
  }
}

/**
 * Unified settle function that routes to the appropriate authorization type handler
 *
 * @param wallet - The facilitator wallet that will execute the transaction
 * @param paymentPayload - The signed payment payload
 * @param paymentRequirements - The payment requirements
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  const payload = paymentPayload.payload as ExactEvmPayload;

  // Route to appropriate settlement based on authorization type
  switch (payload.authorizationType) {
    case "eip3009":
      return eip3009Facilitator.settle(wallet, paymentPayload, paymentRequirements);

    case "permit":
      return permitFacilitator.settle(wallet, paymentPayload, paymentRequirements);

    case "permit2":
      return permit2Facilitator.settle(wallet, paymentPayload, paymentRequirements);

    default:
      return {
        success: false,
        errorReason: "unsupported_authorization_type",
        transaction: "",
        network: paymentPayload.network,
        payer: "",
      };
  }
}
