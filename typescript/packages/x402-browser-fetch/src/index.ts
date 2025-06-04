// typescript/packages/x402-browser-fetch/src/index.ts
import { safeBase64Encode } from "x402/shared";
import type { PaymentRequirements, PaymentPayload } from "x402/types";
import { createNonce } from "../../x402/src/schemes/exact/evm/sign";
import { authorizationTypes } from "../../x402/src/types/shared/evm";
import { getNetworkId } from "../../x402/src/shared/network";
import { config } from "../../x402/src/types/shared/evm/config";
import type { TypedData, TypedDataDomain } from "viem";

/**
 * EIP-712 typed data structure for signing.
 */
export interface EIP712SignableData {
  types: TypedData;
  primaryType: string;
  domain?: TypedDataDomain;
  message: Record<string, unknown>;
}
/**
 *
 * Function type for signing EIP-712 typed data.
 *
 * @param typedData - The EIP-712 typed data to sign
 * @returns Promise that resolves to the signature as a hex string
 */
export type SignTypedDataFunction<T extends EIP712SignableData = EIP712SignableData> = (
  typedData: T,
) => Promise<`0x${string}`>;

/**
 * Response structure for HTTP 402 Payment Required responses.
 */
interface X402Response {
  error?: string;
  accepts: PaymentRequirements[];
  x402Version: number;
}

/**
 * Signs a payment authorization using EIP-712 typed data signing.
 *
 * @param account - The Ethereum account address making the payment
 * @param signTypedData - Function to sign the EIP-712 typed data
 * @param paymentRequirements - The payment requirements from the server
 * @returns Promise that resolves to a signed payment payload
 * @throws Error if the network is unsupported
 */
async function signPaymentAuthorization(
  account: `0x${string}`,
  signTypedData: SignTypedDataFunction,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const chainId = getNetworkId(paymentRequirements.network);
  const chainConfig = config[chainId.toString()];

  if (!chainConfig) {
    throw new Error(`Unsupported network: ${paymentRequirements.network}`);
  }

  const nonce = createNonce();
  const currentTime = Math.floor(Date.now() / 1000);
  const validAfter = (currentTime - 600).toString(); // 10 minutes before
  const validBefore = (currentTime + paymentRequirements.maxTimeoutSeconds).toString();

  const authorization = {
    from: account,
    to: paymentRequirements.payTo,
    value: paymentRequirements.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  const typedData = {
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization" as const,
    domain: {
      name: paymentRequirements.extra?.name || chainConfig.usdcName,
      version: paymentRequirements.extra?.version || "2",
      chainId,
      verifyingContract: paymentRequirements.asset as `0x${string}`,
    },
    message: authorization,
  };

  const signature = await signTypedData(typedData);

  return {
    x402Version: 1,
    scheme: "exact",
    network: paymentRequirements.network,
    payload: {
      signature,
      authorization,
    },
  };
}

/**
 * Wraps the browser's fetch function to automatically handle HTTP 402 Payment Required responses.
 * When a 402 response is received, it will attempt to make a payment and retry the request.
 *
 * @param account - The Ethereum account address to use for payments
 * @param signTypedData - Function to sign EIP-712 typed data for payment authorization
 * @param maxPaymentAmount - Maximum amount willing to pay (default: 100000 = 0.1 USDC in base units)
 * @returns A fetch function that handles payments automatically
 * @throws Error if payment fails, amount exceeds maximum, or insufficient balance
 */
export function wrapBrowserFetchWithPayment(
  account: `0x${string}`,
  signTypedData: SignTypedDataFunction,
  maxPaymentAmount: bigint = BigInt(100000), // 0.1 USDC in base units
) {
  return async function fetchWithPayment(url: string, init?: RequestInit): Promise<Response> {
    // Make initial request
    const response = await fetch(url, init);

    // If not 402, return original response
    if (response.status !== 402) {
      return response;
    }

    // Parse 402 response
    const x402Response = (await response.json()) as X402Response;

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      throw new Error("No payment options available");
    }

    // Select first available payment requirement
    const paymentRequirements = x402Response.accepts[0];

    if (!paymentRequirements) {
      throw new Error("Payment requirements undefined");
    }

    // Check if payment amount is within allowed limit
    if (BigInt(paymentRequirements.maxAmountRequired) > maxPaymentAmount) {
      throw new Error(
        `Payment amount (${paymentRequirements.maxAmountRequired}) exceeds maximum allowed (${maxPaymentAmount})`,
      );
    }

    try {
      // Create signed payment
      const signedPayment = await signPaymentAuthorization(
        account,
        signTypedData,
        paymentRequirements,
      );

      // Encode payment header using existing utility
      const paymentHeader = safeBase64Encode(JSON.stringify(signedPayment));

      // Retry request with payment header
      const retryInit = {
        ...init,
        headers: {
          ...(init?.headers || {}),
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
      };

      const retryResponse = await fetch(url, retryInit);

      if (retryResponse.status === 402) {
        // Payment failed, try to get error details
        const errorResponse = (await retryResponse.json()) as {
          error?: string;
        };
        throw new Error(`Payment failed: ${errorResponse.error || "Unknown error"}`);
      }

      return retryResponse;
    } catch (error) {
      if (error instanceof Error) {
        // Handle common payment errors
        if (error.message.includes("insufficient")) {
          throw new Error("Insufficient USDC balance to make payment");
        }
        throw error;
      }
      throw new Error("Failed to process payment");
    }
  };
}

// Export commonly needed utilities for browser environments
export { safeBase64Encode } from "x402/shared";
export type { PaymentRequirements, PaymentPayload } from "x402/types";
