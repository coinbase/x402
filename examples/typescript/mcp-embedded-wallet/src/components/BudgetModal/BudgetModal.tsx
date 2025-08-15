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

/**
 *
 * @param root0
 * @param root0.isOpen
 * @param root0.onClose
 */
export function BudgetModal({ isOpen, onClose }: BudgetModalProps) {
  const { evmAddress: fromAddress } = useEvmAddress();
  const sessionBudgetAtomic = useBudgetStore(state => state.sessionBudgetAtomic);
  const setSessionBudgetAtomic = useBudgetStore(state => state.setSessionBudgetAtomic);
  const perRequestMaxAtomic = useBudgetStore(state => state.perRequestMaxAtomic);
  const setPerRequestMaxAtomic = useBudgetStore(state => state.setPerRequestMaxAtomic);

  // Local display values in USDC (human units)
  const [sessionBudgetDisplay, setSessionBudgetDisplay] = useState<string>("");
  const [perRequestMaxDisplay, setPerRequestMaxDisplay] = useState<string>("");
  const [sessionBudgetError, setSessionBudgetError] = useState<string | null>(null);
  const [perRequestMaxError, setPerRequestMaxError] = useState<string | null>(null);
  const [sessionBudgetSuccess, setSessionBudgetSuccess] = useState(false);
  const [perRequestMaxSuccess, setPerRequestMaxSuccess] = useState(false);

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

  const handleSessionBudgetChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSessionBudgetDisplay(e.target.value);
    setSessionBudgetError(null);
  };

  const handlePerRequestMaxChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPerRequestMaxDisplay(e.target.value);
    setPerRequestMaxError(null);
  };

  const resetForm = () => {
    setSessionBudgetDisplay(sessionBudgetAtomic ? formatUSDCAmount(sessionBudgetAtomic) : "");
    setPerRequestMaxDisplay(perRequestMaxAtomic ? formatUSDCAmount(perRequestMaxAtomic) : "");
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const validateSessionBudget = (): boolean => {
    // Validate session budget
    const sessionAtomic = parseUSDCToAtomic(sessionBudgetDisplay);
    if (!sessionAtomic) {
      setSessionBudgetError("Enter a valid session budget");
      return false;
    }
    if (BigInt(sessionAtomic) <= 0n) {
      setSessionBudgetError("Session budget must be greater than 0");
      return false;
    }
    setSessionBudgetError(null);
    return true;
  };

  const validatePerRequestMax = (): boolean => {
    // Validate per-request max
    const perReqAtomic = parseUSDCToAtomic(perRequestMaxDisplay);
    if (!perReqAtomic) {
      setPerRequestMaxError("Enter a valid max amount per operation");
      return false;
    }
    if (BigInt(perReqAtomic) <= 0n) {
      setPerRequestMaxError("Max amount per operation must be greater than 0");
      return false;
    }
    if (BigInt(perReqAtomic) > BigInt(sessionBudgetAtomic ?? 0n)) {
      setPerRequestMaxError("Max per operation cannot exceed the session budget");
      return false;
    }

    setPerRequestMaxError(null);
    return true;
  };

  const handleSaveSessionBudget = async () => {
    if (!validateSessionBudget() || !fromAddress) return;

    setSessionBudgetError(null);

    try {
      const sessionAtomic = parseUSDCToAtomic(sessionBudgetDisplay);
      if (!sessionAtomic) return;

      setSessionBudgetAtomic(sessionAtomic);
    } catch (err) {
      console.error("Error saving session budget:", err);
    } finally {
      setSessionBudgetSuccess(true);
    }
  };

  const handleSavePerRequestMax = async () => {
    if (!validatePerRequestMax() || !fromAddress) return;

    setPerRequestMaxError(null);

    try {
      const perReqAtomic = parseUSDCToAtomic(perRequestMaxDisplay);
      if (!perReqAtomic) return;

      setPerRequestMaxAtomic(perReqAtomic);
    } catch (err) {
      console.error("Error saving per-request max:", err);
    } finally {
      setPerRequestMaxSuccess(true);
    }
  };

  // Auto-reset success states after 1s so button text returns to "Save"
  useEffect(() => {
    if (!sessionBudgetSuccess) return;
    const timeoutId = setTimeout(() => setSessionBudgetSuccess(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [sessionBudgetSuccess]);

  useEffect(() => {
    if (!perRequestMaxSuccess) return;
    const timeoutId = setTimeout(() => setPerRequestMaxSuccess(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [perRequestMaxSuccess]);

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
                onChange={handleSessionBudgetChange}
                placeholder="Enter session budget (in USDC)"
              >
                <TextField.Slot>
                  <Text size="2">$</Text>
                </TextField.Slot>
                <TextField.Slot>
                  <Text size="2">USDC</Text>
                </TextField.Slot>
              </TextField.Root>
              <Button size="2" onClick={handleSaveSessionBudget}>
                {sessionBudgetSuccess ? "Saved!" : "Save"}
              </Button>
            </Flex>
            {sessionBudgetError && (
              <Text color="red" size="1">
                {sessionBudgetError}
              </Text>
            )}
          </Flex>
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
                onChange={handlePerRequestMaxChange}
                placeholder="Enter max amount per operation"
              >
                <TextField.Slot>
                  <Text size="2">$</Text>
                </TextField.Slot>
                <TextField.Slot>
                  <Text size="2">USDC</Text>
                </TextField.Slot>
              </TextField.Root>
              <Button size="2" onClick={handleSavePerRequestMax}>
                {perRequestMaxSuccess ? "Saved!" : "Save"}
              </Button>
            </Flex>
            {perRequestMaxError && (
              <Text color="red" size="1">
                {perRequestMaxError}
              </Text>
            )}
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}
