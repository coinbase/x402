/**
 * Generates a session token for the user
 *
 * @param address - The user's connected wallet address
 * @returns The session token
 */
export const generateOnrampSessionToken = async (address: string): Promise<string | undefined> => {
  const endpoint = window.x402?.sessionTokenEndpoint;
  if (!endpoint) {
    return undefined;
  }

  try {
    // Call the session token API with user's address
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [
          {
            address,
            blockchains: ["base"], // Onramp only supports mainnet
          },
        ],
        assets: ["USDC"],
      }),
    });

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Failed to generate onramp session token:", error);
    return undefined;
  }
};
