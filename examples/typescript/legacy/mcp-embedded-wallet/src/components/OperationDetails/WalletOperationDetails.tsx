import { Flex, Text, Box, Link } from "@radix-ui/themes";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { WalletOperation, Operation } from "../../stores/operations";
import { OperationBadge } from "../OperationBadge";

type WalletOperationDetailsProps = {
  operation: WalletOperation;
  allOperations: Operation[];
};

/**
 * Component that displays detailed information about a wallet operation.
 * Shows operation description, status, wallet address, messages, signatures,
 * authorization data, transaction details, and any errors.
 *
 * @param root0 - Component props
 * @param root0.operation - The wallet operation to display details for
 * @param root0.allOperations - All operations in the group for context
 * @returns {JSX.Element} The rendered wallet operation details component
 */
export function WalletOperationDetails({ operation, allOperations }: WalletOperationDetailsProps) {
  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2">
        <Text size="3" weight="bold">
          {operation.description}
        </Text>
        <OperationBadge operation={operation} allOperations={allOperations} variant="operation" />
      </Flex>
      <Text size="2" color="gray">
        Address: {operation.address}
      </Text>
      {operation.message && (
        <Text size="2" color="gray">
          Message: {operation.message}
        </Text>
      )}
      {operation.signature && (
        <Text size="2" color="green">
          Signature: {operation.signature.slice(0, 50)}...{operation.signature.slice(-10)}
        </Text>
      )}
      {operation.authorizationData && (
        <Box>
          <Text size="2" color="gray">
            Authorization: {operation.authorizationData.value} units to{" "}
            {operation.authorizationData.to.slice(0, 8)}...
          </Text>
        </Box>
      )}
      {operation.transactionHash && operation.blockExplorerUrl && (
        <Text size="2" color="green">
          Transaction:{" "}
          <Link href={operation.blockExplorerUrl} target="_blank" rel="noopener noreferrer">
            <Flex align="center" gap="1" style={{ display: "inline-flex" }}>
              {operation.transactionHash.slice(0, 10)}...{operation.transactionHash.slice(-10)}
              <ExternalLinkIcon width="12" height="12" />
            </Flex>
          </Link>
        </Text>
      )}
      <Text size="2" color="gray">
        {operation.timestamp.toLocaleString()}
      </Text>
      {operation.errorMessage && (
        <Text size="2" color="red">
          Error: {operation.errorMessage}
        </Text>
      )}
    </Flex>
  );
}
