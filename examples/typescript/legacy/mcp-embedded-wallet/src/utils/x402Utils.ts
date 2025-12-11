import { Operation, HttpOperation } from "../stores/operations";
import { formatUSDC } from "./chainConfig";

/**
 * Extracts and formats the payment amount from a group of operations.
 * Looks for HTTP operations with payment requirements and formats the amount.
 *
 * @param operations - Array of operations to search through
 * @returns {string} The formatted payment amount or "Unknown" if not found
 */
export function getPaymentAmount(operations: Operation[]): string {
  // Find the operation with payment requirements (402 response)
  const paymentOp = operations.find(
    op => op.type === "http" && op.paymentRequirements?.length,
  ) as HttpOperation;

  if (!paymentOp?.selectedPayment) {
    return "Unknown";
  }

  return formatUSDC(paymentOp.selectedPayment.maxAmountRequired);
}

/**
 * Determines the overall status of a group of operations.
 * Analyzes operation sequence to determine if the group is successful, pending, or has errors.
 * Special handling for initial 402 discovery which is considered part of success flow.
 *
 * @param operations - Array of operations to analyze
 * @returns {"success" | "error" | "pending"} The overall status of the operation group
 */
export function getGroupStatus(operations: Operation[]): "success" | "error" | "pending" {
  // Sort operations by timestamp to identify the flow sequence
  const sortedOps = [...operations].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (sortedOps.some(op => op.status === "pending")) {
    return "pending";
  }

  // If we can't determine payment amount, that's an error condition
  const paymentAmount = getPaymentAmount(operations);
  if (paymentAmount === "Unknown") {
    return "error";
  }

  // Check if any operation is a real error (excluding initial 402 discovery)
  const hasRealError = sortedOps.some((op, index) => {
    if (op.status === "error") {
      // Special case: Initial HTTP request with 402 error is discovery phase (success)
      if (
        op.type === "http" &&
        op.errorMessage?.includes("402") &&
        index === 0 && // First operation in the group
        (op as HttpOperation).paymentRequirements?.length
      ) {
        return false; // This is expected discovery, not a failure
      }

      // Any other error is a real failure
      return true;
    }
    return false;
  });

  return hasRealError ? "error" : "success";
}

/**
 * Gets the target URL from a group of operations.
 * Finds the first HTTP operation and extracts its URL.
 *
 * @param operations - Array of operations to search through
 * @returns {string} The target URL or "Unknown" if not found
 */
export function getTargetUrl(operations: Operation[]): string {
  // Find the first HTTP operation
  const httpOp = operations.find(op => op.type === "http") as HttpOperation;
  return httpOp?.url || "Unknown";
}

/**
 * Generates a human-readable status message based on operation status and payment amount.
 * Formats the message differently for success, error, and pending states.
 *
 * @param status - The current status of the operation group
 * @param paymentAmount - The formatted payment amount
 * @returns {string} A human-readable status message
 */
export function getStatusText(
  status: "success" | "error" | "pending",
  paymentAmount: string,
): string {
  switch (status) {
    case "success":
      return `Sent $${paymentAmount} USDC`;
    case "error":
      return paymentAmount !== "Unknown"
        ? `Failed to send ${paymentAmount}`
        : "Failed to send payment";
    case "pending":
      return `Sending $${paymentAmount} USDC`;
  }
}
