import { useState } from "react";
import { Card, Flex, Text, Box } from "@radix-ui/themes";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Operation } from "../../stores/operations";
import { HttpOperationDetails, WalletOperationDetails } from "../OperationDetails";
import {
  getPaymentAmount,
  getGroupStatus,
  getTargetUrl,
  getStatusText,
} from "../../utils/x402Utils";
import { OperationBadge } from "../OperationBadge";

type GroupedOperationProps = {
  operations: Operation[];
};

/**
 * Renders the appropriate operation details component based on the operation type.
 *
 * @param operation - The operation to render details for
 * @param allOperations - All operations in the current group for context
 * @returns {JSX.Element | undefined} The rendered operation details component
 */
function renderOperationDetails(operation: Operation, allOperations: Operation[]) {
  if (operation.type === "http") {
    return <HttpOperationDetails operation={operation} allOperations={allOperations} />;
  } else if (operation.type === "wallet") {
    return <WalletOperationDetails operation={operation} allOperations={allOperations} />;
  }
}

/**
 * A collapsible component that displays a group of related operations.
 * Shows a summary of the operations' status and target URL when collapsed,
 * and detailed information for each operation when expanded.
 *
 * @param root0 - Component props
 * @param root0.operations - Array of operations that belong to the same group
 * @returns {JSX.Element} The rendered grouped operations component
 */
export function GroupedOperation({ operations }: GroupedOperationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const paymentAmount = getPaymentAmount(operations);
  const groupStatus = getGroupStatus(operations);
  const targetUrl = getTargetUrl(operations);
  const statusText = getStatusText(groupStatus, paymentAmount);

  // Sort operations by timestamp within the group
  const sortedOperations = [...operations].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  return (
    <Card mb="2">
      <Flex
        align="center"
        justify="between"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: "pointer" }}
      >
        <Flex align="center" gap="2">
          <Text size="3" weight="bold">
            {statusText} {targetUrl !== "Unknown" ? `for ${new URL(targetUrl).pathname}` : ""}
          </Text>
          <Text size="2" color="gray">
            {targetUrl !== "Unknown" ? `${new URL(targetUrl).hostname}` : ""}
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          <OperationBadge operations={operations} variant="group" />
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Flex>
      </Flex>

      {isExpanded && (
        <Box mt="3" pl="4">
          {sortedOperations.map((operation, index) => (
            <Box
              key={index}
              mb="3"
              pb="2"
              style={{
                borderBottom:
                  index < sortedOperations.length - 1 ? "1px solid var(--gray-6)" : "none",
              }}
            >
              {renderOperationDetails(operation, operations)}
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}
