"use client";

import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  CheckIcon,
  ClipboardCopyIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import {
  Badge,
  Card,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Table,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { getDiscoveryList } from "../../services/discovery";
import { Button } from "../Button";

interface DiscoveryItem {
  type: string;
  resource: string;
  x402Version: number;
  accepts: Array<{
    scheme: "exact";
    description: string;
    network: "base-sepolia" | "base";
    maxAmountRequired: string;
    resource: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    outputSchema?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  }>;
  lastUpdated: string;
  metadata?: Record<string, unknown>;
}

interface DiscoveryResponse {
  x402Version: number;
  items: DiscoveryItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

interface DiscoveryModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

/**
 * Modal component that displays a list of discovered x402 resources and their payment requirements.
 * Allows users to view detailed information about each resource, copy asset addresses, and generate prompts.
 *
 * @param root0 - Component props
 * @param root0.isOpen - Whether the modal is currently visible
 * @param root0.onClose - Optional callback function to handle modal close events
 * @returns {JSX.Element | null} The modal component when open, null when closed
 */
export function DiscoveryModal({ isOpen, onClose }: DiscoveryModalProps) {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [copiedAssets, setCopiedAssets] = useState<Record<string, boolean>>({});
  const [copiedPrompt, setCopiedPrompt] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadDiscoveryItems();
    }
  }, [isOpen]);

  const loadDiscoveryItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await getDiscoveryList()) as DiscoveryResponse;
      setItems(response.items);
    } catch (err) {
      setError("Failed to load discovery items");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (resource: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [resource]: !prev[resource],
    }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);

    if (key.startsWith("asset:")) {
      setCopiedAssets(prev => ({ ...prev, [key.replace("asset:", "")]: true }));
      setTimeout(() => {
        setCopiedAssets(prev => ({ ...prev, [key.replace("asset:", "")]: false }));
      }, 2000);
    } else if (key.startsWith("prompt:")) {
      setCopiedPrompt(prev => ({ ...prev, [key.replace("prompt:", "")]: true }));
      setTimeout(() => {
        setCopiedPrompt(prev => ({ ...prev, [key.replace("prompt:", "")]: false }));
      }, 2000);
    }
  };

  const truncateAddress = (address: string) => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const generatePrompt = (item: DiscoveryItem, acceptIndex: number) => {
    const accept = item.accepts[acceptIndex];
    const promptText = `Make an HTTP request to ${
      item.resource
    } using the following request structure: ${
      accept.outputSchema?.input
        ? JSON.stringify(accept.outputSchema.input, null, 2)
        : "No input schema provided"
    }. Full metadata about the resource is: ${JSON.stringify(item, null, 2)}`;

    return promptText;
  };

  const handleCopyPrompt = (item: DiscoveryItem, acceptIndex: number) => {
    const promptText = generatePrompt(item, acceptIndex);
    copyToClipboard(promptText, `prompt:${item.resource}-${acceptIndex}`);
  };

  if (!isOpen) return null;

  return (
    <>
      <Flex justify="between" align="center" mb="4">
        <Dialog.Title mb="0">Discovered Resources</Dialog.Title>
        <Dialog.Close onClick={() => onClose?.()}>
          <IconButton size="2">
            <Cross2Icon />
          </IconButton>
        </Dialog.Close>
      </Flex>
      {loading && <Text>Loading...</Text>}
      {error && <Text color="red">{error}</Text>}
      <Flex direction="column" gap="4">
        {items.map(item => (
          <Card key={item.resource}>
            <Flex justify="between" align="start">
              <Flex direction="column" gap="1">
                <Text size="2" weight="medium" color="gray">
                  {item.resource}
                </Text>
                {item.accepts[0].description && <Text size="3">{item.accepts[0].description}</Text>}
              </Flex>
              <Flex gap="2" align="center" justify="end">
                <Badge variant="soft" size="2" radius="full" color="cyan">
                  {item.type.toUpperCase()}
                </Badge>
                <Badge variant="soft" size="2" radius="full" color="blue">
                  {item.accepts[0].network.toUpperCase()}
                </Badge>
                <Button
                  variant="ghost"
                  size="2"
                  ml="2"
                  onClick={() => toggleExpand(item.resource)}
                  aria-label={expandedItems[item.resource] ? "Collapse" : "Expand"}
                >
                  {expandedItems[item.resource] ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </Button>
              </Flex>
            </Flex>

            {expandedItems[item.resource] && (
              <>
                <Heading as="h3" size="3" my="2" mt="4">
                  Accepts
                </Heading>
                <Card>
                  {item.accepts.length > 0 ? (
                    <Table.Root>
                      <Table.Header>
                        <Table.Row>
                          <Table.RowHeaderCell>Network</Table.RowHeaderCell>
                          <Table.RowHeaderCell>Scheme</Table.RowHeaderCell>
                          <Table.RowHeaderCell>Amount</Table.RowHeaderCell>
                          <Table.RowHeaderCell>Asset</Table.RowHeaderCell>
                          {/* Only show description column if it differs from resource description */}
                          {item.accepts.some(
                            a => a.description !== item.accepts[0].description,
                          ) && <Table.RowHeaderCell>Description</Table.RowHeaderCell>}
                          <Table.RowHeaderCell>Actions</Table.RowHeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {item.accepts.map((accept, index) => (
                          <Table.Row key={index}>
                            <Table.Cell>{accept.network}</Table.Cell>
                            <Table.Cell>{accept.scheme}</Table.Cell>
                            <Table.Cell>{accept.maxAmountRequired}</Table.Cell>
                            <Table.Cell>
                              <Tooltip content={<p>{accept.asset}</p>}>
                                <Flex gap="1" align="center">
                                  <span>{truncateAddress(accept.asset || "")}</span>
                                  <Button
                                    variant="ghost"
                                    size="2"
                                    onClick={() =>
                                      copyToClipboard(accept.asset || "", `asset:${accept.asset}`)
                                    }
                                    aria-label="Copy asset address"
                                  >
                                    {copiedAssets[accept.asset || ""] ? (
                                      <CheckIcon className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <CopyIcon className="h-3 w-3" />
                                    )}
                                  </Button>
                                </Flex>
                              </Tooltip>
                            </Table.Cell>
                            <Table.Cell>
                              <Tooltip content={<p>Copy prompt to clipboard</p>}>
                                <Button
                                  variant="ghost"
                                  size="2"
                                  onClick={() => handleCopyPrompt(item, index)}
                                  aria-label="Copy prompt"
                                >
                                  {copiedPrompt[`${item.resource}-${index}`] ? (
                                    <CheckIcon className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <ClipboardCopyIcon className="h-4 w-4" />
                                  )}
                                </Button>
                              </Tooltip>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  ) : (
                    <Text>No accept entries available</Text>
                  )}
                </Card>
              </>
            )}
          </Card>
        ))}
      </Flex>
    </>
  );
}
