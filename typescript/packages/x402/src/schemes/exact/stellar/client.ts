import { nativeToScVal } from "@stellar/stellar-sdk";
import { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import {
  Ed25519Signer,
  getNetworkPassphrase,
  getRpcUrl,
  isStellarSigner,
} from "../../../shared/stellar";
import { X402Config } from "../../../types/config";
import { SupportedStellarNetworks } from "../../../types/shared/network";
import { PaymentPayload, PaymentRequirements } from "../../../types/verify";
import { encodePayment } from "../../utils";
import { handleSimulationResult } from "./shared";
import {
  StellarAssetAddressRegex,
  StellarDestinationAddressRegex,
} from "../../../types/shared/stellar";

/**
 * Creates and encodes a payment header for Stellar payment requirements.
 *
 * This function builds a Stellar payment transaction, signs it on behalf of the senders address,
 * and returns a base64-encoded payment payload suitable for the X-PAYMENT header.
 *
 * @param signer - Stellar signer for signing the contract invocation's auth entry
 * @param x402Version - x402 protocol version (currently must be 1)
 * @param paymentRequirements - Payment requirements from 402 response
 * @param config - Optional configuration for custom RPC URL
 * @returns Base64-encoded payment header string
 */
export async function createPaymentHeader(
  signer: Ed25519Signer,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<string> {
  const paymentPayload = await createAndSignPayment(
    signer,
    x402Version,
    paymentRequirements,
    config,
  );
  return encodePayment(paymentPayload);
}

/**
 * Validates the input parameters for the createAndSignPayment function.
 *
 * @param signer - Stellar signer for the sender
 * @param paymentRequirements - Payment requirements
 * @returns void
 * @throws Error if validation fails
 */
export function validateCreateAndSignPaymentInput(
  signer: Ed25519Signer,
  paymentRequirements: PaymentRequirements,
): void {
  if (!isStellarSigner(signer)) {
    throw new Error(`Invalid Stellar signer provided`);
  }

  const { scheme, network, payTo, asset } = paymentRequirements;
  if (scheme !== "exact") {
    throw new Error(`Unsupported scheme: ${scheme}`);
  }

  if (!SupportedStellarNetworks.includes(network)) {
    throw new Error(`Unsupported Stellar network: ${network}`);
  }

  if (!StellarDestinationAddressRegex.test(payTo)) {
    throw new Error(`Invalid Stellar destination address: ${payTo}`);
  }

  if (!StellarAssetAddressRegex.test(asset)) {
    throw new Error(`Invalid Stellar asset address: ${asset}`);
  }
}

/**
 * Creates and signs a Stellar payment transaction.
 *
 * @param signer - Stellar signer belonging to the sender
 * @param x402Version - x402 protocol version
 * @param paymentRequirements - x402 Payment requirements
 * @param config - Optional configuration used to override the default RPC URL, required for mainnet
 * @returns PaymentPayload with base64 encoded XDR signed transaction
 * @throws Error if the input parameters are invalid or the transaction simulation fails
 */
export async function createAndSignPayment(
  signer: Ed25519Signer,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<PaymentPayload> {
  try {
    validateCreateAndSignPaymentInput(signer, paymentRequirements);
  } catch (error) {
    throw new Error(`Invalid input parameters for creating Stellar payment`, { cause: error });
  }

  const sourcePublicKey = signer.address;
  const { scheme, network, payTo, asset, maxAmountRequired } = paymentRequirements;
  const networkPassphrase = getNetworkPassphrase(network);
  const rpcUrl = getRpcUrl(network, config);

  const tx = await AssembledTransaction.build({
    contractId: asset,
    method: "transfer",
    args: [
      // SEP-41 spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md#interface
      nativeToScVal(sourcePublicKey, { type: "address" }), // from
      nativeToScVal(payTo, { type: "address" }), // to
      nativeToScVal(maxAmountRequired, { type: "i128" }), // amount
    ],
    networkPassphrase,
    rpcUrl,
    parseResultXdr: result => result,
  });
  handleSimulationResult(tx.simulation);

  let missingSigners = tx.needsNonInvokerSigningBy();
  if (!missingSigners.includes(sourcePublicKey) || missingSigners.length > 1) {
    throw new Error(
      `Expected to sign with [${sourcePublicKey}], but got [${missingSigners.join(", ")}]`,
    );
  }
  await tx.signAuthEntries({
    address: sourcePublicKey,
    signAuthEntry: signer.signAuthEntry,
  });

  await tx.simulate();
  handleSimulationResult(tx.simulation);

  missingSigners = tx.needsNonInvokerSigningBy();
  if (missingSigners.length > 0) {
    throw new Error(`unexpected signer(s) required: [${missingSigners.join(", ")}]`);
  }

  return {
    x402Version,
    scheme,
    network,
    payload: {
      transaction: tx.built!.toXDR(),
    },
  };
}
