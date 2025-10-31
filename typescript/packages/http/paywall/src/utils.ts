import type { PaymentRequirements, PaymentRequirementsV1 } from "@x402/core/types";

/**
 * Safely clones an object without prototype pollution
 *
 * @param obj - The object to clone
 * @returns A safe clone of the object
 */
function safeClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => safeClone(item)) as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    // Skip __proto__ and other dangerous properties
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = safeClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

/**
 * Ensures a valid amount is set in payment requirements (v2)
 *
 * @param paymentRequirements - The payment requirements to validate and update
 * @returns Updated payment requirements with valid amount
 */
function ensureValidAmountV2(paymentRequirements: PaymentRequirements): PaymentRequirements {
  const updatedRequirements = safeClone(paymentRequirements);

  if (window.x402?.amount) {
    try {
      const amountInBaseUnits = Math.round(window.x402.amount * 1_000_000);
      updatedRequirements.amount = amountInBaseUnits.toString();
    } catch (error) {
      console.error("Failed to parse amount:", error);
    }
  }

  const hasValidAmount =
    updatedRequirements.amount &&
    typeof updatedRequirements.amount === "string" &&
    /^\d+$/.test(updatedRequirements.amount);

  if (!hasValidAmount) {
    throw new Error("Invalid or missing amount in payment requirements");
  }

  return updatedRequirements;
}

/**
 * Ensures a valid amount is set in payment requirements (v1)
 *
 * @param paymentRequirements - The payment requirements to validate and update
 * @returns Updated payment requirements with valid amount
 */
function ensureValidAmountV1(paymentRequirements: PaymentRequirementsV1): PaymentRequirementsV1 {
  const updatedRequirements = safeClone(paymentRequirements);

  if (window.x402?.amount) {
    try {
      const amountInBaseUnits = Math.round(window.x402.amount * 1_000_000);
      updatedRequirements.maxAmountRequired = amountInBaseUnits.toString();
    } catch (error) {
      console.error("Failed to parse amount:", error);
    }
  }

  const hasValidAmount =
    updatedRequirements.maxAmountRequired &&
    typeof updatedRequirements.maxAmountRequired === "string" &&
    /^\d+$/.test(updatedRequirements.maxAmountRequired);

  if (!hasValidAmount) {
    throw new Error("Invalid or missing maxAmountRequired in payment requirements");
  }

  return updatedRequirements;
}

/**
 * Ensures a valid amount is set in payment requirements
 *
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - The payment requirements to validate and update
 * @returns Updated payment requirements with valid amount
 */
export function ensureValidAmount(
  x402Version: number,
  paymentRequirements: PaymentRequirements | PaymentRequirementsV1,
): PaymentRequirements | PaymentRequirementsV1 {
  switch (x402Version) {
    case 1:
      return ensureValidAmountV1(paymentRequirements as PaymentRequirementsV1);
    case 2:
    default:
      return ensureValidAmountV2(paymentRequirements as PaymentRequirements);
  }
}

/**
 * Generates a session token for the user
 *
 * @param address - The user's connected wallet address
 * @returns The session token
 */
export const generateOnrampSessionToken = async (address: string): Promise<string | undefined> => {
  const endpoint = window.x402?.sessionTokenEndpoint;
  if (!endpoint) {
    return undefined;
  }

  try {
    // Call the session token API with user's address
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [
          {
            address,
            blockchains: ["base"], // Onramp only supports mainnet
          },
        ],
        assets: ["USDC"],
      }),
    });

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Failed to generate onramp session token:", error);
    return undefined;
  }
};
