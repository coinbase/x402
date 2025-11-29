import { createPaymentHeader as createPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { createPaymentHeader as createPaymentHeaderExactSVM } from "../schemes/exact/svm/client";
import { createPaymentHeader as createPaymentHeaderExactBtcLightning } from "../schemes/exact/btc_lightning/client";

import {
  isEvmSignerWallet,
  isMultiNetworkSigner,
  isSvmSignerWallet,
  MultiNetworkSigner,
  Signer,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "../types/shared";
import { PaymentRequirements } from "../types/verify";
import { X402Config } from "../types/config";

/**
 * Creates an X-PAYMENT header value for a given client and payment requirements.
 *
 * This function is the high-level router used by x402 clients. It:
 * - dispatches to the EVM implementation for EVM networks
 * - dispatches to the SVM implementation for Solana/SVM networks
 * - dispatches to the BTC Lightning implementation for Lightning networks
 *
 * The returned string is intended to be set directly as the `X-PAYMENT` header,
 * and should base64-decode to a `PaymentPayload` JSON object as defined in the
 * core x402 specification.
 *
 * @param client - The signer instance used to create/sign the payment:
 *   - a single-network `Signer`, or
 *   - a `MultiNetworkSigner` with `.evm` and/or `.svm` fields
 * @param x402Version - The x402 protocol version (typically `1`)
 * @param paymentRequirements - The payment requirements describing:
 *   scheme, network, amount, payTo, etc.
 * @param config - Optional x402 configuration (e.g. custom RPC URLs for SVM)
 *
 * @throws If the scheme is unsupported, or the network is not recognized
 *         for the `exact` scheme, or if required Lightning metadata is missing.
 *
 * @returns A promise resolving to a base64-encoded `PaymentPayload` string
 *          suitable for use as the `X-PAYMENT` HTTP header.
 */
export async function createPaymentHeader(
  client: Signer | MultiNetworkSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<string> {
  // We only support the "exact" scheme in this router for now
  if (paymentRequirements.scheme !== "exact") {
    throw new Error("Unsupported scheme");
  }

  //
  // 1. BTC Lightning networks
  //
  if (
    paymentRequirements.network === "btc-lightning-signet" ||
    paymentRequirements.network === "btc-lightning-mainnet"
  ) {
    // For Lightning, the actual invoice (bolt11) must be provided.
    // To keep the core library backend-agnostic, we expect the caller
    // to have already obtained a BOLT11 invoice and to pass it via
    // the `extra` field in PaymentRequirements.
    const bolt11 = paymentRequirements.extra?.bolt11 as string | undefined;
    const invoiceId = paymentRequirements.extra?.invoiceId as string | undefined;

    if (!bolt11) {
      throw new Error(
        'Lightning "exact" scheme requires `paymentRequirements.extra.bolt11` to be set for btc-lightning networks',
      );
    }

    // NOTE:
    // - we pass `client` through unchanged; the Lightning implementation
    //   is backend-agnostic and currently doesn't use `client` directly.
    // - if in the future you want to derive the invoice from the client
    //   (e.g. LND / LNbits integration), you can extend this call.
    return await createPaymentHeaderExactBtcLightning(
      client,
      x402Version,
      paymentRequirements,
      bolt11,
      invoiceId,
    );
  }

  //
  // 2. EVM networks
  //
  if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
    const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

    if (!isEvmSignerWallet(evmClient)) {
      throw new Error("Invalid evm wallet client provided");
    }

    return await createPaymentHeaderExactEVM(evmClient, x402Version, paymentRequirements);
  }

  //
  // 3. SVM (Solana) networks
  //
  if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
    const svmClient = isMultiNetworkSigner(client) ? client.svm : client;

    if (!isSvmSignerWallet(svmClient)) {
      throw new Error("Invalid svm wallet client provided");
    }

    // SVM implementation optionally takes config for custom RPC, etc.
    return await createPaymentHeaderExactSVM(svmClient, x402Version, paymentRequirements, config);
  }

  //
  // 4. Anything else is unsupported for the `exact` scheme
  //
  throw new Error("Unsupported network");
}
