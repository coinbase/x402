"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { Dialog, Flex, IconButton, Text, Button, Card, TextField } from "@radix-ui/themes";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useEvmAddress } from "@coinbase/cdp-hooks";
import { useBudgetStore } from "../../stores/budget";
import { formatUSDCAmount } from "../../utils/chainConfig";

interface BudgetModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function BudgetModal({ isOpen, onClose }: BudgetModalProps) {
  const { evmAddress: fromAddress } = useEvmAddress();
  const sessionBudgetAtomic = useBudgetStore(state => state.sessionBudgetAtomic);
  const setSessionBudgetAtomic = useBudgetStore(state => state.setSessionBudgetAtomic);
  const perRequestMaxAtomic = useBudgetStore(state => state.perRequestMaxAtomic);
  const setPerRequestMaxAtomic = useBudgetStore(state => state.setPerRequestMaxAtomic);

  // Local display values in USDC (human units)
  const [sessionBudgetDisplay, setSessionBudgetDisplay] = useState<string>("");
  const [perRequestMaxDisplay, setPerRequestMaxDisplay] = useState<string>("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert a USDC display string to atomic string (6 decimals)
  const parseUSDCToAtomic = (input: string): string | null => {
    const sanitized = input.replace(/,/g, "").trim();
    if (sanitized === "") return null;
    if (!/^\d*(\.\d{0,6})?$/.test(sanitized)) return null;
    const [whole, fracRaw] = sanitized.split(".");
    const frac = (fracRaw || "").padEnd(6, "0").slice(0, 6);
    try {
      const wholePart = BigInt(whole || "0") * 1000000n;
      const fracPart = BigInt(frac || "0");
      return (wholePart + fracPart).toString();
    } catch {
      return null;
    }
  };

  const resetForm = () => {
    setSessionBudgetDisplay(sessionBudgetAtomic ? formatUSDCAmount(sessionBudgetAtomic) : "");
    setPerRequestMaxDisplay(perRequestMaxAtomic ? formatUSDCAmount(perRequestMaxAtomic) : "");
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const validateForm = (): boolean => {
    // Validate session budget
    const sessionAtomic = parseUSDCToAtomic(sessionBudgetDisplay);
    if (!sessionAtomic) {
      setError("Enter a valid session budget (up to 6 decimals)");
      return false;
    }
    if (BigInt(sessionAtomic) <= 0n) {
      setError("Session budget must be greater than 0");
      return false;
    }

    // Validate per-request max
    const perReqAtomic = parseUSDCToAtomic(perRequestMaxDisplay);
    if (!perReqAtomic) {
      setError("Enter a valid max amount per operation (up to 6 decimals)");
      return false;
    }
    if (BigInt(perReqAtomic) <= 0n) {
      setError("Max amount per operation must be greater than 0");
      return false;
    }

    // Optional: per-request must not exceed session budget
    if (BigInt(perReqAtomic) > BigInt(sessionAtomic)) {
      setError("Max per operation cannot exceed the session budget");
      return false;
    }

    setError(null);
    return true;
  };

  const handleSaveBudget = async () => {
    if (!validateForm() || !fromAddress) return;

    setIsSavingBudget(true);
    setError(null);

    try {
      const sessionAtomic = parseUSDCToAtomic(sessionBudgetDisplay);
      const perReqAtomic = parseUSDCToAtomic(perRequestMaxDisplay);
      if (!sessionAtomic || !perReqAtomic) return;

      setSessionBudgetAtomic(sessionAtomic);
      setPerRequestMaxAtomic(perReqAtomic);
    } catch (err) {
      console.error("Error saving budget:", err);
    } finally {
      setIsSavingBudget(false);
    }
  };

  // Initialize display values when modal opens or store values change
  useEffect(() => {
    if (!isOpen) return;
    setSessionBudgetDisplay(sessionBudgetAtomic ? formatUSDCAmount(sessionBudgetAtomic) : "");
    setPerRequestMaxDisplay(perRequestMaxAtomic ? formatUSDCAmount(perRequestMaxAtomic) : "");
  }, [isOpen, sessionBudgetAtomic, perRequestMaxAtomic]);

  if (!isOpen) return null;

  return (
    <Flex direction="column" gap="4">
      <Flex justify="between" align="center">
        <Dialog.Title mb="0">Set spending rules</Dialog.Title>
        <Dialog.Close onClick={handleClose}>
          <IconButton size="2">
            <Cross2Icon />
          </IconButton>
        </Dialog.Close>
      </Flex>

      <Card>
        <Flex direction="column" gap="4">
          <Flex direction="column" gap="2">
            <Flex direction="column" gap="2">
              <Text as="label" size="2" weight="bold">
                Session budget
              </Text>
              <Text size="1" color="gray">
                The amount of USDC you are willing to spend in this session.
              </Text>
            </Flex>
            <Flex gap="2">
              <TextField.Root
                value={sessionBudgetDisplay}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSessionBudgetDisplay(e.target.value)
                }
                placeholder="Enter session budget (in USDC)"
              >
                <TextField.Slot>
                  <Text size="2">$</Text>
                </TextField.Slot>
                <TextField.Slot>
                  <Text size="2">USDC</Text>
                </TextField.Slot>
              </TextField.Root>
              <Button size="2" onClick={handleSaveBudget}>
                Save
              </Button>
            </Flex>
          </Flex>

          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Flex direction="column" gap="2">
            <Flex direction="column" gap="2">
              <Text as="label" size="2" weight="bold">
                Max amount per operation
              </Text>
              <Text size="1" color="gray">
                The maximum amount of USDC you are willing to spend per operation.
              </Text>
            </Flex>
            <Flex gap="2">
              <TextField.Root
                value={perRequestMaxDisplay}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setPerRequestMaxDisplay(e.target.value)
                }
                placeholder="Enter max amount per operation"
              >
                <TextField.Slot>
                  <Text size="2">$</Text>
                </TextField.Slot>
                <TextField.Slot>
                  <Text size="2">USDC</Text>
                </TextField.Slot>
              </TextField.Root>
              <Button size="2" onClick={handleSaveBudget}>
                Save
              </Button>
            </Flex>
          </Flex>

          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
