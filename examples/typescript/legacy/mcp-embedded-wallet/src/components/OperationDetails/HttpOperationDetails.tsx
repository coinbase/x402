import { Flex, Text, Link } from "@radix-ui/themes";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { HttpOperation, Operation } from "../../stores/operations";
import { OperationBadge, isInitial402Discovery } from "../OperationBadge";
import { getBlockExplorerUrl, formatUSDC } from "../../utils/chainConfig";

type HttpOperationDetailsProps = {
  operation: HttpOperation;
  allOperations: Operation[];
};

/**
 * Component that displays detailed information about an HTTP operation.
 * Shows the operation description, status, URL, payment requirements, settlement info, and any errors.
 * Handles special cases like 402 discovery responses.
 *
 * @param root0 - Component props
 * @param root0.operation - The HTTP operation to display details for
 * @param root0.allOperations - All operations in the group for context and 402 discovery checking
 * @returns {JSX.Element} The rendered operation details component
 */
export function HttpOperationDetails({ operation, allOperations }: HttpOperationDetailsProps) {
  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2">
        <Text size="3" weight="bold">
          {operation.description}
        </Text>
        <OperationBadge operation={operation} allOperations={allOperations} variant="operation" />
      </Flex>
      <Text size="2" color="gray">
        {operation.method} {operation.url}
      </Text>
      {operation.paymentRequirements && (
        <Text size="2" color="blue">
          Payment required: ${formatUSDC(operation.paymentRequirements[0].maxAmountRequired)} USDC
        </Text>
      )}
      {operation.settlementInfo && (
        <Text size="2" color="gray">
          Transaction:{" "}
          <Link
            href={getBlockExplorerUrl(
              operation.settlementInfo.network,
              operation.settlementInfo.transaction,
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Flex align="center" gap="1" style={{ display: "inline-flex" }}>
              {operation.settlementInfo.transaction.slice(0, 10)}...
              <ExternalLinkIcon width="12" height="12" />
            </Flex>
          </Link>{" "}
          on {operation.settlementInfo.network}
        </Text>
      )}
      <Text size="2" color="gray">
        {operation.timestamp.toLocaleString()}
      </Text>
      {operation.errorMessage && !isInitial402Discovery(operation, allOperations) && (
        <Text size="1" color="red">
          Error: {operation.errorMessage}
        </Text>
      )}
    </Flex>
  );
}
