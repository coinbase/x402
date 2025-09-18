import { verify as verifyExactEvm, settle as settleExactEvm } from "../schemes/exact/evm";
import { verify as verifyExactSvm, settle as settleExactSvm } from "../schemes/exact/svm";
import { verify as verifyCashu, settle as settleCashu } from "../schemes/cashu";
import { SupportedCashuNetworks, SupportedEVMNetworks, SupportedSVMNetworks } from "../types/shared";
import {
  ConnectedClient as EvmConnectedClient,
  SignerWallet as EvmSignerWallet,
} from "../types/shared/evm";
import { ConnectedClient, Signer } from "../types/shared/wallet";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ExactEvmPayload,
  CashuPayload,
} from "../types/verify";
import { Chain, Transport, Account } from "viem";
import { KeyPairSigner } from "@solana/kit";

/**
 * Verifies a payment payload against the required payment details regardless of the scheme
 * this function wraps all verify functions for each specific scheme
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient | Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return verifyExactEvm(
        client as EvmConnectedClient<transport, chain, account>,
        payload,
        paymentRequirements,
      );
    }

    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await verifyExactSvm(client as KeyPairSigner, payload, paymentRequirements);
    }
  }

  if (paymentRequirements.scheme === "cashu-token") {
    if (SupportedCashuNetworks.includes(paymentRequirements.network)) {
      return verifyCashu(client, payload, paymentRequirements);
    }
  }

  // unsupported scheme
  return {
    isValid: false,
    invalidReason: "invalid_scheme",
    payer: (() => {
      if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
        return (payload.payload as ExactEvmPayload).authorization.from;
      }
      if (paymentRequirements.scheme === "cashu-token") {
        return (payload.payload as CashuPayload).payer ?? "";
      }
      return "";
    })(),
  };
}

/**
 * Settles a payment payload against the required payment details regardless of the scheme
 * this function wraps all settle functions for each specific scheme
 *
 * @param client - The signer wallet used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A SettleResponse indicating if the payment is settled and any settlement reason
 */
export async function settle<transport extends Transport, chain extends Chain>(
  client: Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return await settleExactEvm(
        client as EvmSignerWallet<chain, transport>,
        payload,
        paymentRequirements,
      );
    }

    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await settleExactSvm(client as KeyPairSigner, payload, paymentRequirements);
    }
  }

  if (paymentRequirements.scheme === "cashu-token") {
    if (SupportedCashuNetworks.includes(paymentRequirements.network)) {
      return settleCashu(client, payload, paymentRequirements);
    }
  }

  return {
    success: false,
    errorReason: "invalid_scheme",
    transaction: "",
    network: paymentRequirements.network,
    payer: (() => {
      if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
        return (payload.payload as ExactEvmPayload).authorization.from;
      }
      if (paymentRequirements.scheme === "cashu-token") {
        return (payload.payload as CashuPayload).payer ?? "";
      }
      return "";
    })(),
  };
}

export type Supported = {
  x402Version: number;
  kind: {
    scheme: string;
    networkId: string;
    extra: object;
  }[];
};
