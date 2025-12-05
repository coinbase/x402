import { useCurrentUser, useEvmAddress } from "@coinbase/cdp-hooks";

import { Dialog, Flex, Grid, Popover, Separator, Text, Tooltip } from "@radix-ui/themes";
import { Button } from "../Button";
import {
  CheckIcon,
  ClipboardCopyIcon,
  ReloadIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@radix-ui/react-icons";
import { useChain } from "../../ChainProvider";
import { useUSDCBalance } from "../../utils/balanceChecker";
import { useState } from "react";
import styles from "./Wallet.module.css";
import { SignOutButton } from "../SignOutButton";
import { WithdrawModal } from "../WithdrawModal";
import { ReceiveModal } from "../ReceiveModal/ReceiveModal";

/**
 * A component that displays the user's connected wallet address.
 * Uses CDP hooks to access the EVM address and displays it in a formatted layout.
 *
 * @returns {JSX.Element} Wallet popover with address, balance, and actions.
 */
export function Wallet() {
  const { evmAddress } = useEvmAddress();
  const chain = useChain();
  const { formattedBalance, refreshBalance } = useUSDCBalance(evmAddress as `0x${string}`, chain);

  const { currentUser } = useCurrentUser();
  const email = currentUser?.authenticationMethods.email?.email;
  const truncatedAddress = evmAddress ? `${evmAddress.slice(0, 10)}...${evmAddress.slice(-8)}` : "";

  const [isSpinning, setIsSpinning] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copyIcon = isCopied ? <CheckIcon /> : <ClipboardCopyIcon />;

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(evmAddress || "");
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleRefresh = () => {
    setIsSpinning(true);
    refreshBalance();
    // Reset spin state after animation completes
    setTimeout(() => setIsSpinning(false), 1000);
  };

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="soft">{email}</Button>
      </Popover.Trigger>
      <Popover.Content maxWidth="300px" onOpenAutoFocus={e => e.preventDefault()}>
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">
              Address
            </Text>
            <Flex align="center" gap="3" justify="between">
              <Tooltip content={evmAddress}>
                <Text size="2">{truncatedAddress}</Text>
              </Tooltip>
              <Tooltip content="Copy to clipboard">
                <Button variant="ghost" onClick={handleCopy}>
                  {copyIcon}
                </Button>
              </Tooltip>
            </Flex>
          </Flex>
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">
              Wallet balance
            </Text>
            <Flex align="center" gap="3" justify="between">
              <Text size="2">${formattedBalance} USDC</Text>
              <Tooltip content={isSpinning ? "Refreshing..." : "Refresh balance"}>
                <Button variant="ghost" onClick={handleRefresh}>
                  <ReloadIcon className={isSpinning ? styles.spin : ""} />
                </Button>
              </Tooltip>
            </Flex>
          </Flex>

          <Separator size="4" orientation="horizontal" />

          <Grid gap="3" columns="2">
            <Dialog.Root>
              <Dialog.Trigger>
                <Button size="3" radius="full" onClick={() => setIsWithdrawOpen(true)}>
                  <Flex direction="column" align="center" gap="0">
                    <ArrowUpIcon />
                    <Text size="1">Send</Text>
                  </Flex>
                </Button>
              </Dialog.Trigger>
              <Dialog.Content maxWidth="500px">
                <WithdrawModal isOpen={isWithdrawOpen} onClose={() => setIsWithdrawOpen(false)} />
              </Dialog.Content>
            </Dialog.Root>

            <Dialog.Root>
              <Dialog.Trigger>
                <Button size="3" radius="full" onClick={() => setIsReceiveOpen(true)}>
                  <Flex direction="column" align="center" gap="0">
                    <ArrowDownIcon />
                    <Text size="1">Receive</Text>
                  </Flex>
                </Button>
              </Dialog.Trigger>
              <Dialog.Content maxWidth="500px">
                <ReceiveModal isOpen={isReceiveOpen} onClose={() => setIsReceiveOpen(false)} />
              </Dialog.Content>
            </Dialog.Root>
          </Grid>

          <Separator size="4" orientation="horizontal" />

          <Popover.Close>
            <SignOutButton />
          </Popover.Close>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
