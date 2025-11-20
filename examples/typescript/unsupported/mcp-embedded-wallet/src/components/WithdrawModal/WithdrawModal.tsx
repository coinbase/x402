"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { Dialog, Flex, IconButton, Text, Select, Button, Card, Link } from "@radix-ui/themes";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useEvmAddress } from "@coinbase/cdp-hooks";
import { getBalance, sendWithdrawal, Asset } from "../../services/withdrawalService";
import styles from "./WithdrawModal.module.css";
import { Address } from "viem";
import { useChain } from "../../ChainProvider";
import { getBlockExplorerUrl } from "../../utils/chainConfig";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

/**
 * Modal component for withdrawing assets (ETH/USDC) to another address.
 * Handles balance checking, input validation, transaction submission, and transaction tracking.
 * Supports both ETH and USDC withdrawals with real-time balance updates.
 *
 * @param root0 - Component props
 * @param root0.isOpen - Whether the withdrawal modal is currently visible
 * @param root0.onClose - Optional callback function to handle modal close events
 * @returns {JSX.Element | null} The rendered modal component when open, null when closed
 */
export function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const { evmAddress: fromAddress } = useEvmAddress();
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset>("ETH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [currentBalance, setCurrentBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const resetForm = () => {
    setToAddress("");
    setAmount("");
    setSelectedAsset("ETH");
    setError(null);
    setTxHash(null);
    setCurrentBalance(null);
  };

  const chain = useChain();

  const fetchBalance = async () => {
    if (!fromAddress || !chain) return;

    setLoadingBalance(true);
    try {
      const balance = await getBalance(fromAddress, selectedAsset, chain);
      setCurrentBalance(balance);
    } catch (err) {
      console.error("Error fetching balance:", err);
      setCurrentBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  // Fetch balance when asset changes or modal opens
  useEffect(() => {
    if (isOpen && fromAddress) {
      fetchBalance();
      // Reset amount when asset changes
      setAmount("");
    }
  }, [isOpen, selectedAsset, fromAddress]);

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const validateForm = (): boolean => {
    if (!toAddress) {
      setError("To address is required");
      return false;
    }

    if (!toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("Invalid address format");
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      return false;
    }

    return true;
  };

  const handleWithdraw = async () => {
    if (!validateForm() || !fromAddress || !chain) return;

    setLoading(true);
    setError(null);

    try {
      // Check balance before withdrawal
      const balance = await getBalance(fromAddress, selectedAsset, chain);
      const amountNum = parseFloat(amount);
      const balanceNum = parseFloat(balance);

      if (amountNum > balanceNum) {
        throw new Error(`Insufficient ${selectedAsset} balance. Available: ${balance}`);
      }

      // Send withdrawal transaction
      const hash = await sendWithdrawal({
        toAddress: toAddress as Address,
        amount,
        asset: selectedAsset,
        chain,
      });

      setTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process withdrawal");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Flex justify="between" align="center" mb="4">
        <Dialog.Title mb="0">Send Assets</Dialog.Title>
        <Dialog.Close onClick={handleClose}>
          <IconButton size="2">
            <Cross2Icon />
          </IconButton>
        </Dialog.Close>
      </Flex>

      <Card>
        <Flex direction="column" gap="4" style={{ width: "100%" }}>
          <Flex direction="column" gap="2" style={{ width: "100%" }}>
            <Text as="label" size="2" weight="bold">
              From
            </Text>
            <Text size="2" color="gray">
              {fromAddress}
            </Text>
          </Flex>

          <Flex direction="column" gap="2" style={{ width: "100%" }}>
            <Text as="label" size="2" weight="bold">
              To
            </Text>
            <input
              className={styles.input}
              placeholder="0x..."
              value={toAddress}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setToAddress(e.target.value)}
            />
          </Flex>

          <Flex direction="column" gap="2" style={{ width: "100%" }}>
            <Text as="label" size="2" weight="bold">
              Asset
            </Text>
            <Select.Root
              value={selectedAsset}
              onValueChange={(value: Asset) => setSelectedAsset(value)}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="ETH">ETH</Select.Item>
                <Select.Item value="USDC">USDC</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          <Flex direction="column" gap="2" style={{ width: "100%" }}>
            <Text as="label" size="2" weight="bold">
              Amount
            </Text>
            <input
              className={styles.input}
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
            />
            <Flex align="center" justify="between" mt="1">
              <Text size="1" color="gray">
                {loadingBalance
                  ? "Loading balance..."
                  : currentBalance
                    ? `Available: ${currentBalance} ${selectedAsset}`
                    : "Unable to fetch balance"}
              </Text>
              {currentBalance && (
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setAmount(currentBalance)}
                  disabled={loadingBalance}
                >
                  Max
                </Button>
              )}
            </Flex>
          </Flex>

          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}

          {txHash && (
            <Flex direction="column" gap="2">
              <Text size="2" weight="bold">
                Transaction submitted
              </Text>
              <Link
                href={chain ? getBlockExplorerUrl(chain.id.toString(), txHash) : "#"}
                target="_blank"
                rel="noopener noreferrer"
                size="2"
              >
                View on Block Explorer
              </Link>
            </Flex>
          )}

          <Button size="3" onClick={handleWithdraw} disabled={loading}>
            {loading ? "Processing..." : "Send"}
          </Button>
        </Flex>
      </Card>
    </>
  );
}
