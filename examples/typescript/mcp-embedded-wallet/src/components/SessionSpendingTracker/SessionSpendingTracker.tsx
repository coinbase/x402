import { useMemo } from "react";
import { useStore } from "zustand/react";
import { operationStore, HttpOperation } from "../../stores/operations";
import { Text, Flex } from "@radix-ui/themes";
import { formatUSDCAmount } from "../../utils/chainConfig";

export const SessionSpendingTracker = () => {
  const operations = useStore(operationStore, state => state.operations);

  const totalSpent = useMemo(() => {
    return operations
      .filter(
        (op): op is HttpOperation =>
          op.type === "http" &&
          op.status === "success" &&
          op.selectedPayment?.maxAmountRequired !== undefined,
      )
      .reduce((total, op) => {
        const amountStr = op.selectedPayment!.maxAmountRequired;
        const amount = BigInt(amountStr);
        return total + amount;
      }, 0n);
  }, [operations]);

  const formattedTotal = useMemo(() => {
    if (totalSpent === 0n) return "0.00";

    // Convert from atomic units (6 decimals for USDC) to display units
    const displayAmount = formatUSDCAmount(totalSpent.toString());
    return displayAmount;
  }, [totalSpent]);

  const transactionCount = useMemo(() => {
    return operations.filter(
      (op): op is HttpOperation =>
        op.type === "http" &&
        op.status === "success" &&
        op.selectedPayment?.maxAmountRequired !== undefined,
    ).length;
  }, [operations]);

  return (
    <Flex align="baseline" gap="1">
      <Text>Session: ${formattedTotal} USDC</Text>
      <Text size="1" color="gray">
        ({transactionCount} txn{transactionCount !== 1 ? "s" : ""})
      </Text>
    </Flex>
  );
};
