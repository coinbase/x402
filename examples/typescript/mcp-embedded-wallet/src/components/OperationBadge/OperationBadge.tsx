import { Badge } from "@radix-ui/themes";
import { Operation, HttpOperation } from "../../stores/operations";
import styles from "./OperationBadge.module.css";

/**
 * Determines if an HTTP operation represents the initial 402 discovery request.
 * Checks for 402 error status, payment requirements, and if it's the first operation in its correlation group.
 *
 * @param operation - The HTTP operation to check
 * @param allOperations - All operations in the group for correlation checking
 * @returns {boolean} True if this is the initial 402 discovery request
 */
export function isInitial402Discovery(
  operation: HttpOperation,
  allOperations: Operation[],
): boolean {
  if (operation.status !== "error" || !operation.errorMessage?.includes("402")) {
    return false;
  }

  // Check if this operation has payment requirements (indicates 402 discovery)
  if (!operation.paymentRequirements?.length) {
    return false;
  }

  // Check if this is the first operation in the correlation group
  const correlatedOps = allOperations
    .filter(op => op.correlationId === operation.correlationId)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return correlatedOps[0] === operation;
}

/**
 * Determines the overall status of a group of operations.
 * Ignores expected 402 discovery operations and prioritizes errors over pending states.
 *
 * @param operations - Array of operations to check status for
 * @returns {"success" | "error" | "pending"} The aggregated status of all operations
 */
function getGroupStatus(operations: Operation[]): "success" | "error" | "pending" {
  // Filter out expected 402 discovery operations when determining group status
  const significantOperations = operations.filter(op => {
    // If it's an HTTP operation that's an initial 402 discovery, don't count it as an error
    if (op.type === "http" && op.status === "error") {
      return !isInitial402Discovery(op as HttpOperation, operations);
    }
    return true;
  });

  // Check for any actual errors (not including 402 discovery)
  if (significantOperations.some(op => op.status === "error")) {
    return "error";
  }

  // Check for pending operations
  if (significantOperations.some(op => op.status === "pending")) {
    return "pending";
  }

  return "success";
}

/**
 * Gets the badge color and text for a single operation.
 * Handles special case for 402 discovery operations and maps status to appropriate colors.
 *
 * @param operation - The operation to get badge info for
 * @param allOperations - All operations in the group for 402 discovery checking
 * @returns {{ color: "blue" | "green" | "red" | "orange"; text: string }} Badge display information
 */
function getOperationBadgeInfo(
  operation: Operation,
  allOperations: Operation[],
): {
  color: "blue" | "green" | "red" | "orange";
  text: string;
} {
  if (
    operation.type === "http" &&
    isInitial402Discovery(operation as HttpOperation, allOperations)
  ) {
    return { color: "blue", text: "payment required" };
  }

  const color = (() => {
    switch (operation.status) {
      case "success":
        return "green";
      case "error":
        return "red";
      default:
        return "orange";
    }
  })();
  return { color, text: operation.status };
}

/**
 * Gets the badge color and text for a group of operations.
 * Aggregates status of all operations and provides user-friendly status text.
 *
 * @param operations - Array of operations to get group badge info for
 * @returns {{ color: "blue" | "green" | "red" | "orange"; text: string }} Badge display information
 */
function getGroupBadgeInfo(operations: Operation[]): {
  color: "blue" | "green" | "red" | "orange";
  text: string;
} {
  const groupStatus = getGroupStatus(operations);

  const color = (() => {
    switch (groupStatus) {
      case "success":
        return "green";
      case "error":
        return "red";
      default:
        return "orange";
    }
  })();

  // More descriptive text for groups
  const text = (() => {
    switch (groupStatus) {
      case "success":
        return "completed";
      case "error":
        return "failed";
      default:
        return "in progress";
    }
  })();

  return { color, text };
}

type OperationBadgeProps = {
  operation?: Operation;
  operations?: Operation[];
  allOperations?: Operation[];
  variant?: "operation" | "group";
};

/**
 * A badge component that displays the status of either a single operation or a group of operations.
 * Changes color and text based on operation status and handles special cases like 402 discovery.
 *
 * @param root0 - Component props
 * @param root0.operation - Single operation to display status for (when variant is "operation")
 * @param root0.operations - Array of operations to show group status for (when variant is "group")
 * @param root0.allOperations - All operations in context for correlation checking
 * @param root0.variant - Whether to show status for a single operation or group ("operation" | "group")
 * @returns {JSX.Element} The rendered badge component
 */
export function OperationBadge({
  operation,
  operations,
  allOperations = [],
  variant = "operation",
}: OperationBadgeProps) {
  let badgeInfo: { color: "blue" | "green" | "red" | "orange"; text: string };

  if (variant === "group" && operations) {
    badgeInfo = getGroupBadgeInfo(operations);
  } else if (variant === "operation" && operation) {
    badgeInfo = getOperationBadgeInfo(operation, allOperations);
  } else {
    // Fallback
    badgeInfo = { color: "orange", text: "unknown" };
  }

  return (
    <Badge color={badgeInfo.color} className={styles.badge}>
      {badgeInfo.text}
    </Badge>
  );
}
