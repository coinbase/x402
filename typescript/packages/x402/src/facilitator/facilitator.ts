import { verify as verifyExactEvm, settle as settleExactEvm } from "../schemes/exact/evm";
import {
  verify as verifyExactSvm,
  settle as settleExactSvm,
  getFeePayer as getFeePayerExactSvm,
  GetFeePayerResponse,
} from "../schemes/exact/svm";
import { NetworkEnum, SupportedEVMNetworks, SupportedSVMNetworks } from "../types/shared";
import { ConnectedClient, SignerWallet } from "../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ExactEvmPayload,
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
  client: ConnectedClient<transport, chain, account> | KeyPairSigner,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return verifyExactEvm(
        client as ConnectedClient<transport, chain, account>,
        payload,
        paymentRequirements,
      );
    }

    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await verifyExactSvm(client as KeyPairSigner, payload, paymentRequirements);
    }
  }

  // unsupported scheme
  return {
    isValid: false,
    invalidReason: "invalid_scheme",
    payer:
      "authorization" in payload.payload
        ? (payload.payload as ExactEvmPayload).authorization.from
        : "",
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
  client: SignerWallet<chain, transport>,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return settleExactEvm(client, payload, paymentRequirements);
    }

    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await settleExactSvm(payload, paymentRequirements);
    }
  }

  return {
    success: false,
    errorReason: "invalid_scheme",
    transaction: "",
    network: paymentRequirements.network,
    payer:
      paymentRequirements.network === NetworkEnum.SOLANA_MAINNET ||
      paymentRequirements.network === NetworkEnum.SOLANA_DEVNET
        ? ""
        : (payload.payload as ExactEvmPayload).authorization.from,
  };
}

/**
 * Get the fee payer for the given payment requirements and signer.
 *
 * @param client - The signer wallet or keypair signer to get the fee payer for
 * @param paymentRequirements - The payment requirements to get the fee payer for
 * @returns The fee payer address
 */
export async function getFeePayer<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | KeyPairSigner,
  paymentRequirements: PaymentRequirements,
): Promise<GetFeePayerResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return getFeePayerExactSvm(client as KeyPairSigner);
    }
  }

  return {
    feePayer: "",
  };
}

export type Supported = {
  x402Version: number;
  kind: {
    scheme: string;
    networkId: string;
  }[];
};
