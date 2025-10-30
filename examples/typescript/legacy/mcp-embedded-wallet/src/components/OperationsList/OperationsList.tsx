import { useOperationStore, Operation } from "../../stores/operations";
import { Card, Heading } from "@radix-ui/themes";
import { GroupedOperation } from "../GroupedOperation";
import { HttpOperationDetails, WalletOperationDetails } from "../OperationDetails";

/**
 * Renders the appropriate operation details component based on operation type.
 * Delegates rendering to either HttpOperationDetails or WalletOperationDetails.
 *
 * @param operation - The operation to render details for
 * @param allOperations - All operations in the system for context
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
 * Component that displays a chronological list of operations, both grouped and individual.
 * Groups related operations by correlationId and sorts them by timestamp.
 * Handles both HTTP and wallet operations, displaying them with appropriate details.
 *
 * @returns {JSX.Element} The rendered list of operations
 */
export function OperationsList() {
  const operations = useOperationStore(state => state.operations);

  // Group operations by correlationId
  const groupedOperations = new Map<string, Operation[]>();
  const ungroupedOperations: Operation[] = [];

  operations.forEach(operation => {
    if (operation.correlationId) {
      if (!groupedOperations.has(operation.correlationId)) {
        groupedOperations.set(operation.correlationId, []);
      }
      groupedOperations.get(operation.correlationId)!.push(operation);
    } else {
      ungroupedOperations.push(operation);
    }
  });

  // Create a combined list of all operations (grouped and ungrouped) with timestamps
  const allOperationItems: Array<{
    type: "group" | "single";
    timestamp: Date;
    correlationId?: string;
    operations?: Operation[];
    operation?: Operation;
  }> = [
    // Add grouped operations
    ...Array.from(groupedOperations.entries()).map(([correlationId, ops]) => ({
      type: "group" as const,
      timestamp: ops.reduce((earliest, op) => (op.timestamp < earliest.timestamp ? op : earliest))
        .timestamp,
      correlationId,
      operations: ops,
    })),
    // Add ungrouped operations
    ...ungroupedOperations.map(operation => ({
      type: "single" as const,
      timestamp: operation.timestamp,
      operation,
    })),
  ];

  // Sort all items by timestamp (most recent first)
  const sortedAllOperations = allOperationItems.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );

  return (
    <div>
      <Heading as="h2" mb="2">
        Recent Operations
      </Heading>

      {/* Combined list of grouped and ungrouped operations */}
      {sortedAllOperations.map((item, index) => {
        if (item.type === "group") {
          return <GroupedOperation key={item.correlationId} operations={item.operations!} />;
        } else {
          return (
            <Card key={`single-${index}`} mb="2">
              {renderOperationDetails(item.operation!, operations)}
            </Card>
          );
        }
      })}
    </div>
  );
}
