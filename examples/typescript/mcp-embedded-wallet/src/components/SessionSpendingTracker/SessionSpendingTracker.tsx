import { useMemo, useState } from "react";
import { Text, Flex, Dialog } from "@radix-ui/themes";
import { formatUSDCAmount } from "../../utils/chainConfig";
import { useBudgetStore } from "../../stores/budget";
import { BudgetModal } from "../BudgetModal";
import { Button } from "../Button";

export const SessionSpendingTracker = () => {
  const sessionSpentAtomic = useBudgetStore(state => state.sessionSpentAtomic);
  const sessionBudgetAtomic = useBudgetStore(state => state.sessionBudgetAtomic);

  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const totalSpent = useMemo(() => {
    try {
      return BigInt(sessionSpentAtomic || "0");
    } catch {
      return 0n;
    }
  }, [sessionSpentAtomic]);

  const formattedTotal = useMemo(() => {
    if (totalSpent === 0n) return "0.00";

    // Convert from atomic units (6 decimals for USDC) to display units
    const displayAmount = formatUSDCAmount(totalSpent.toString());
    return displayAmount;
  }, [totalSpent]);

  const formattedRemaining = useMemo(() => {
    if (!sessionBudgetAtomic) return null;
    try {
      const remaining = BigInt(sessionBudgetAtomic) - totalSpent;
      if (remaining <= 0n) return "0.00";
      return formatUSDCAmount(remaining.toString());
    } catch {
      return null;
    }
  }, [sessionBudgetAtomic, totalSpent]);

  return (
    <Flex align="baseline" gap="2">
      <Dialog.Root>
        <Dialog.Trigger>
          <Button size="2" variant="soft" radius="large" onClick={() => setIsBudgetOpen(true)}>
            <Text size="2">Budget remaining: ${formattedRemaining} USDC</Text>
          </Button>
        </Dialog.Trigger>
        <Dialog.Content maxWidth="450px">
          <BudgetModal isOpen={isBudgetOpen} onClose={() => setIsBudgetOpen(false)} />
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
};
