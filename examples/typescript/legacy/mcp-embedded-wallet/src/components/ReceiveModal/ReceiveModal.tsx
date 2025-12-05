"use client";

import { Dialog, Flex, IconButton, Text, Card, Tooltip, Button } from "@radix-ui/themes";
import { Cross2Icon, ClipboardCopyIcon, CheckIcon } from "@radix-ui/react-icons";
import QRCode from "react-qr-code";
import { useEvmAddress } from "@coinbase/cdp-hooks";
import { useMemo, useState } from "react";
import { useChain } from "../../ChainProvider";

interface ReceiveModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

/**
 * Modal that displays a QR code and address for receiving assets.
 *
 * @param {object} root0 - Props object.
 * @param {boolean} root0.isOpen - Whether the modal is open.
 * @param {() => void} [root0.onClose] - Optional close handler.
 * @returns {JSX.Element | null} Modal content when open, otherwise null.
 */
export function ReceiveModal({ isOpen, onClose }: ReceiveModalProps) {
  const { evmAddress } = useEvmAddress();
  const [copied, setCopied] = useState(false);
  const chain = useChain();
  const qrCodeValue = useMemo(() => {
    if (!evmAddress) return "";
    return `ethereum:${evmAddress}@${chain.id}`;
  }, [evmAddress, chain]);

  const handleCopy = () => {
    if (!evmAddress) return;
    navigator.clipboard.writeText(evmAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  if (!isOpen) return null;

  return (
    <>
      <Flex justify="between" align="center" mb="4">
        <Dialog.Title mb="0">Receive Assets</Dialog.Title>
        <Dialog.Close onClick={onClose}>
          <IconButton size="2">
            <Cross2Icon />
          </IconButton>
        </Dialog.Close>
      </Flex>

      <Card>
        <Flex direction="column" align="center" gap="4" p="4">
          <Text size="2" color="gray">
            Scan to receive
          </Text>
          <div style={{ background: "white", padding: 8, borderRadius: 8 }}>
            <QRCode value={qrCodeValue} size={200} />
          </div>
          <Flex align="center" gap="3">
            <Text size="2">{evmAddress}</Text>
            <Tooltip content={copied ? "Copied" : "Copy address"}>
              <Button variant="soft" onClick={handleCopy}>
                {copied ? <CheckIcon /> : <ClipboardCopyIcon />}
              </Button>
            </Tooltip>
          </Flex>
        </Flex>
      </Card>
    </>
  );
}
