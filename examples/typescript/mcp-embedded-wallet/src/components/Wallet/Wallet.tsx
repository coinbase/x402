import { useEvmAddress } from "@coinbase/cdp-hooks";

import { Flex, Text } from "@radix-ui/themes";

/**
 * A component that displays the user's connected wallet address.
 * Uses CDP hooks to access the EVM address and displays it in a formatted layout.
 *
 * @returns {JSX.Element} The rendered wallet display component
 */
export function Wallet() {
  const { evmAddress } = useEvmAddress();

  return (
    <Flex align="center" gap="2" p="2" justify="end">
      <Text>Wallet: {evmAddress || "Not Connected"}</Text>
    </Flex>
  );
}
