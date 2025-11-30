import { Chain, Transport, Account } from "viem";
import { TransactionSigner } from "@solana/kit";

import { verify as verifyExactEvm, settle as settleExactEvm } from "../schemes/exact/evm";
import { verify as verifyExactSvm, settle as settleExactSvm } from "../schemes/exact/svm";
import {
  verify as verifyExactBtcLightning,
  settle as settleExactBtcLightning,
} from "../schemes/exact/btc_lightning";

import { SupportedEVMNetworks, SupportedSVMNetworks } from "../types/shared";
import { X402Config } from "../types/config";
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
} from "../types/verify";

/**
 * Verifies a payment payload against the required payment details, regardless of the
 * underlying network family (EVM, SVM, or BTC Lightning) for the `exact` scheme.
 *
 * This function dispatches to the appropriate scheme implementation based on
 * `paymentRequirements.network`:
 *
 * - EVM networks → `schemes/exact/evm.verify`
 * - SVM (Solana) networks → `schemes/exact/svm.verify`
 * - BTC Lightning networks → `schemes/exact/btc_lightning.verify`
 *
 * @param client - The blockchain client or signer used for verification.
 *   - For EVM networks: an `EvmConnectedClient`
 *   - For SVM networks: a `TransactionSigner`
 *   - For BTC Lightning networks: currently unused, but accepted for API symmetry
 * @param payload - The signed payment payload containing transfer parameters and scheme-specific data
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @param config - Optional configuration for x402 operations (e.g. custom RPC URLs for SVM)
 *
 * @returns A `VerifyResponse` indicating whether the payment is valid and, if not, why
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient | Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<VerifyResponse> {
  // Only the `exact` scheme is currently routed here
  if (paymentRequirements.scheme === "exact") {
    // === EVM networks ===
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return verifyExactEvm(
        client as EvmConnectedClient<transport, chain, account>,
        payload,
        paymentRequirements,
      );
    }

    // === SVM (Solana) networks ===
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return verifyExactSvm(client as TransactionSigner, payload, paymentRequirements, config);
    }

    // === BTC Lightning networks ===
    if (
      paymentRequirements.network === "btc-lightning-signet" ||
      paymentRequirements.network === "btc-lightning-mainnet"
    ) {
      // Current Lightning verify() does not depend on a chain client and
      // validates purely at the x402 / invoice level.
      return verifyExactBtcLightning(client, payload, paymentRequirements);
    }
  }

  // Unsupported scheme or network
  return {
    isValid: false,
    invalidReason: "invalid_scheme",
    payer: SupportedEVMNetworks.includes(paymentRequirements.network)
      ? (payload.payload as ExactEvmPayload).authorization.from
      : "",
  };
}

/**
 * Settles a payment payload against the required payment details, regardless of the
 * underlying network family (EVM, SVM, or BTC Lightning) for the `exact` scheme.
 *
 * This function dispatches to the appropriate scheme implementation based on
 * `paymentRequirements.network`:
 *
 * - EVM networks → `schemes/exact/evm.settle`
 * - SVM (Solana) networks → `schemes/exact/svm.settle`
 * - BTC Lightning networks → `schemes/exact/btc_lightning.settle`
 *
 * @param client - The signer used to settle the payment.
 *   - For EVM networks: an `EvmSignerWallet`
 *   - For SVM networks: a `TransactionSigner`
 *   - For BTC Lightning networks: currently unused, but accepted for API symmetry
 * @param payload - The signed payment payload containing transfer parameters and scheme-specific data
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @param config - Optional configuration for x402 operations (e.g. custom RPC URLs for SVM)
 *
 * @returns A `SettleResponse` indicating whether the payment was settled and the resulting transaction / receipt info
 */
export async function settle<transport extends Transport, chain extends Chain>(
  client: Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<SettleResponse> {
  if (paymentRequirements.scheme === "exact") {
    // === EVM networks ===
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return settleExactEvm(
        client as EvmSignerWallet<chain, transport>,
        payload,
        paymentRequirements,
      );
    }

    // === SVM (Solana) networks ===
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return settleExactSvm(client as TransactionSigner, payload, paymentRequirements, config);
    }

    // === BTC Lightning networks ===
    if (
      paymentRequirements.network === "btc-lightning-signet" ||
      paymentRequirements.network === "btc-lightning-mainnet"
    ) {
      // For Lightning, settlement is currently modeled as a state transition
      // (invoice paid) rather than an on-chain transaction broadcast by this facilitator.
      return settleExactBtcLightning(client, payload, paymentRequirements);
    }
  }

  return {
    success: false,
    errorReason: "invalid_scheme",
    transaction: "",
    network: paymentRequirements.network,
    payer: SupportedEVMNetworks.includes(paymentRequirements.network)
      ? (payload.payload as ExactEvmPayload).authorization.from
      : "",
  };
}

/**
 * Describes the schemes and networks supported by this facilitator.
 *
 * This is typically used by a `/supported` endpoint to let clients discover
 * valid `(scheme, network)` pairs in the current deployment.
 */
export type Supported = {
  x402Version: number;
  kind: {
    scheme: string;
    networkId: string;
    extra: object;
  }[];
};
