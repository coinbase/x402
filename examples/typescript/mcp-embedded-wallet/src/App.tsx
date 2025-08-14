import { useEvmAddress, useIsSignedIn } from "@coinbase/cdp-hooks";
import { SignIn } from "@coinbase/cdp-react";
import { OperationsList } from "./components/OperationsList";
import { Header } from "./components/Header";
import { Box, Flex } from "@radix-ui/themes";

/**
 * Root application component that handles authentication state and layout.
 * Shows sign-in screen when not authenticated, or the main app interface when signed in.
 *
 * @returns {JSX.Element} The rendered application component
 */
export function App() {
  const signedIn = useIsSignedIn();
  const { evmAddress: address } = useEvmAddress();

  return (
    <Box p="4" minHeight="100vh" width="100%">
      {signedIn && address ? (
        <Flex direction="column" gap="4">
          <Header />
          <OperationsList />
        </Flex>
      ) : (
        <Flex justify="center" align="center" height="100%">
          <SignIn />
        </Flex>
      )}
    </Box>
  );
}
