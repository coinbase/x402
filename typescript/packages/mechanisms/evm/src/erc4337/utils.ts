import { PaymentRequirements } from "@x402/core/types";
import { UserOperationCapability } from "./types";

/**
 * Extracts the user operation capability from the payment requirements.
 *
 * @param requirements - The payment requirements
 * @returns The user operation capability
 */
export function extractUserOperationCapability(
  requirements: PaymentRequirements,
): UserOperationCapability | undefined {
  const userOpExtra = requirements.extra?.userOperation;
  if (
    userOpExtra &&
    typeof userOpExtra === "object" &&
    "supported" in userOpExtra &&
    userOpExtra.supported === true
  ) {
    return userOpExtra as UserOperationCapability;
  }
  return undefined;
}
