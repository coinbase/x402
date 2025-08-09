import { useEvmAddress, useIsSignedIn } from "@coinbase/cdp-hooks";
import { useState } from "react";
import { DiscoveryModal } from "../DiscoveryModal";
import { WithdrawModal } from "../WithdrawModal";
import { Dialog, Flex, Text, Tooltip } from "@radix-ui/themes";
import { SignOutButton } from "../SignOutButton";

import { Button } from "../Button";
import { useUSDCBalance } from "../../utils/balanceChecker";
import { ClipboardCopyIcon, ReloadIcon } from "@radix-ui/react-icons";
import { SessionSpendingTracker } from "../SessionSpendingTracker";
import styles from "./Header.module.css";
import { useChain } from "../../ChainProvider";

export const Header = () => {
  const signedIn = useIsSignedIn();
  const { evmAddress: address } = useEvmAddress();
  const chain = useChain();
  const { formattedBalance, refreshBalance } = useUSDCBalance(address as `0x${string}`, chain);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  const handleRefresh = () => {
    setIsSpinning(true);
    refreshBalance();
    // Reset spin state after animation completes
    setTimeout(() => setIsSpinning(false), 1000);
  };

  return (
    signedIn &&
    address && (
      <Flex align="center" gap="2" justify="between">
        <Flex align="center" gap="3" justify="center">
          <Flex align="center" gap="1">
            <Tooltip content={address}>
              <Text>{truncatedAddress}</Text>
            </Tooltip>
            <Tooltip content="Copy address to clipboard">
              <Button variant="ghost" onClick={() => navigator.clipboard.writeText(address)}>
                <ClipboardCopyIcon />
              </Button>
            </Tooltip>
          </Flex>

          <Flex align="center" gap="1">
            <Text>${formattedBalance} USDC</Text>
            <Button variant="ghost" onClick={handleRefresh}>
              <ReloadIcon className={isSpinning ? styles.spin : ""} />
            </Button>
          </Flex>
          <SessionSpendingTracker />
        </Flex>
        <Flex align="center" gap="2" justify="center">
          <Dialog.Root>
            <Dialog.Trigger>
              <Button size="2" radius="large" onClick={() => setIsDiscoveryOpen(true)}>
                Discovery
              </Button>
            </Dialog.Trigger>
            <Dialog.Content maxWidth="800px" height="80vh">
              <DiscoveryModal isOpen={isDiscoveryOpen} onClose={() => setIsDiscoveryOpen(false)} />
            </Dialog.Content>
          </Dialog.Root>
          <Dialog.Root>
            <Dialog.Trigger>
              <Button size="2" radius="large" onClick={() => setIsWithdrawOpen(true)}>
                Withdraw
              </Button>
            </Dialog.Trigger>
            <Dialog.Content maxWidth="500px">
              <WithdrawModal isOpen={isWithdrawOpen} onClose={() => setIsWithdrawOpen(false)} />
            </Dialog.Content>
          </Dialog.Root>
          <SignOutButton />
        </Flex>
      </Flex>
    )
  );
};
