/**
 * Starknet Client Implementation for x402 Exact Scheme
 *
 * This module implements the x402 client interface for Starknet,
 * following the same patterns as EVM and SVM implementations.
 */

import { hash, type Signature } from "starknet";
import type { PaymentPayload, PaymentRequirements } from "../../../types/verify";
import type { StarknetSigner } from "../../../shared/starknet/wallet";
import {
  type StarknetTransferAuthorization,
  signTransferAuthorization,
} from "../../../shared/starknet/x402-transfers";
import { encodePayment } from "../../utils";

/**
 * Starknet client configuration for x402 payments
 */
export interface StarknetClientConfig {
  /** The user's Starknet signer */
  userSigner: StarknetSigner;
  /** Network to operate on */
  network?: "starknet" | "starknet-sepolia";
}

/**
 * Creates an x402 payment header for Starknet using the exact scheme
 *
 * @param client - The Starknet client configuration
 * @param x402Version - The x402 protocol version (must be 1)
 * @param paymentRequirements - The payment requirements from the server
 * @returns Promise resolving to the base64-encoded payment header
 */
export async function createPaymentHeader(
  client: StarknetClientConfig,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  // Validate x402 version
  if (x402Version !== 1) {
    throw new Error(`Unsupported x402 version: ${x402Version}. Only version 1 is supported.`);
  }

  // Validate scheme
  if (paymentRequirements.scheme !== "exact") {
    throw new Error(
      `Unsupported scheme: ${paymentRequirements.scheme}. Only "exact" scheme is supported.`,
    );
  }

  // Validate network
  const network = paymentRequirements.network as "starknet" | "starknet-sepolia";
  if (network !== "starknet" && network !== "starknet-sepolia") {
    throw new Error(
      `Unsupported network: ${paymentRequirements.network}. Must be "starknet" or "starknet-sepolia".`,
    );
  }

  // Create transfer authorization
  const authorization: StarknetTransferAuthorization = {
    tokenAddress: paymentRequirements.asset,
    from: client.userSigner.address,
    to: paymentRequirements.payTo,
    amount: paymentRequirements.maxAmountRequired,
    nonce: hash.computeHashOnElements([Date.now(), Math.random() * 1000000]),
    deadline: String(Math.floor(Date.now() / 1000) + paymentRequirements.maxTimeoutSeconds),
    network,
  };

  // Sign the authorization
  const signature = await signTransferAuthorization(client.userSigner, authorization);

  // Create payment payload
  const paymentPayload: PaymentPayload = {
    x402Version,
    scheme: "exact",
    network,
    payload: {
      // For Starknet, we encode the authorization and signature in a special format
      // that looks like an EVM payload but contains Starknet data
      signature: Array.isArray(signature) ? signature.join(",") : String(signature),
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.amount,
        validAfter: "0",
        validBefore: authorization.deadline,
        nonce: authorization.nonce,
      },
    },
  };

  // Encode and return
  return encodePayment(paymentPayload);
}

/**
 * Creates and signs a payment for the given client and payment requirements.
 * This is a convenience function that combines preparation and signing.
 *
 * @param client - The Starknet signer instance
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements
 * @returns A promise that resolves to a payment payload
 */
export async function createAndSignPayment(
  client: StarknetSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const config: StarknetClientConfig = {
    userSigner: client,
    network: paymentRequirements.network as "starknet" | "starknet-sepolia",
  };

  const header = await createPaymentHeader(config, x402Version, paymentRequirements);

  // Decode the header to get the PaymentPayload
  const decoded = Buffer.from(header.split(" ")[1], "base64").toString();
  return JSON.parse(decoded) as PaymentPayload;
}

/**
 * Prepares payment data for the Starknet exact scheme
 *
 * @param userSigner - The user's Starknet signer
 * @param paymentRequirements - The payment requirements
 * @returns Promise resolving to prepared authorization data
 */
export async function prepareStarknetPayment(
  userSigner: StarknetSigner,
  paymentRequirements: PaymentRequirements,
): Promise<{
  authorization: StarknetTransferAuthorization;
  nonce: string;
}> {
  const network = paymentRequirements.network as "starknet" | "starknet-sepolia";
  if (network !== "starknet" && network !== "starknet-sepolia") {
    throw new Error(`Invalid network for Starknet payment: ${paymentRequirements.network}`);
  }

  // Generate unique nonce
  const nonce = hash.computeHashOnElements([Date.now(), Math.random() * 1000000]);

  // Create authorization
  const authorization: StarknetTransferAuthorization = {
    tokenAddress: paymentRequirements.asset,
    from: userSigner.address,
    to: paymentRequirements.payTo,
    amount: paymentRequirements.maxAmountRequired,
    nonce,
    deadline: String(Math.floor(Date.now() / 1000) + paymentRequirements.maxTimeoutSeconds),
    network,
  };

  return {
    authorization,
    nonce,
  };
}

/**
 * Signs a prepared Starknet payment
 *
 * @param userSigner - The user's Starknet signer
 * @param authorization - The prepared authorization
 * @returns Promise resolving to the signature
 */
export async function signStarknetPayment(
  userSigner: StarknetSigner,
  authorization: StarknetTransferAuthorization,
): Promise<Signature> {
  return await signTransferAuthorization(userSigner, authorization);
}

/**
 * Validates payment requirements for Starknet compatibility
 *
 * @param requirements - The payment requirements to validate
 * @returns Object with validation result and errors
 */
export function validateStarknetPaymentRequirements(requirements: PaymentRequirements): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (requirements.scheme !== "exact") {
    errors.push(`Unsupported scheme: ${requirements.scheme}`);
  }

  const network = requirements.network;
  if (network !== "starknet" && network !== "starknet-sepolia") {
    errors.push(`Unsupported network: ${requirements.network}`);
  }

  if (!requirements.asset || typeof requirements.asset !== "string") {
    errors.push("Invalid or missing asset address");
  }

  if (!requirements.payTo || typeof requirements.payTo !== "string") {
    errors.push("Invalid or missing payTo address");
  }

  if (!requirements.maxAmountRequired || typeof requirements.maxAmountRequired !== "string") {
    errors.push("Invalid or missing maxAmountRequired");
  }

  // Validate Starknet address format (basic check)
  const starknetAddressRegex = /^0x[0-9a-fA-F]+$/;
  if (requirements.asset && !starknetAddressRegex.test(requirements.asset)) {
    errors.push("Invalid Starknet asset address format");
  }

  if (requirements.payTo && !starknetAddressRegex.test(requirements.payTo)) {
    errors.push("Invalid Starknet payTo address format");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
