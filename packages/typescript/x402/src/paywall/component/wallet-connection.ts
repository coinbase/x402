import { createEvent, COMPONENT_EVENTS } from "./events";
import { hasWeb3Provider, updateStatus } from "./utils";
import { connect, disconnect } from "@wagmi/core";
import { createPublicClient, custom, publicActions } from "viem";
import { base, baseSepolia } from "viem/chains";
import { injected } from "@wagmi/connectors";
import { chainConfig, wagmiConfig } from "./config";
import { X402Paywall } from "./x402-paywall";

type ContractReader = {
  readContract(args: {
    address: `0x${string}`;
    abi: readonly any[];
    functionName: string;
    args: readonly any[];
  }): Promise<unknown>;
};

export async function connectWallet(component: X402Paywall) {
  if (!hasWeb3Provider()) {
    throw new Error(
      "No Web3 wallet detected. Please install MetaMask or another compatible wallet.",
    );
  }

  try {
    const chain = component.testnet ? baseSepolia : base;
    const result = await connect(wagmiConfig, {
      connector: injected(),
      chainId: chain.id,
    });

    if (!result.accounts?.[0]) {
      throw new Error("No accounts found. Please unlock your wallet.");
    }

    const walletAddress = result.accounts[0];

    const publicClient = createPublicClient({
      chain,
      transport: custom(window.ethereum!),
    }).extend(publicActions);

    // Check USDC balance
    await checkUsdcBalance(component, publicClient, walletAddress);

    return walletAddress;
  } catch (error) {
    updateStatus(
      component,
      `Wallet connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

// Disconnect wallet
export async function disconnectWallet(component: X402Paywall) {
  try {
    await disconnect(wagmiConfig);
    component.walletAddress = null;
    component.walletConnected = false;
    updateStatus(component, "Wallet disconnected");
    component.dispatchEvent(createEvent(COMPONENT_EVENTS.WALLET_DISCONNECTED));
    return true;
  } catch (error) {
    updateStatus(
      component,
      `Failed to disconnect wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

async function checkUsdcBalance(
  component: X402Paywall,
  publicClient: ContractReader,
  address: `0x${string}`,
) {
  const isTestnet = component.testnet;
  const usdcAddress = chainConfig[isTestnet ? "84532" : "8453"].usdcAddress;

  try {
    const balance = await publicClient.readContract({
      address: usdcAddress as `0x${string}`,
      abi: [
        {
          inputs: [{ internalType: "address", name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [address],
    });

    const formattedBalance = Number(balance) / 10 ** 6;
    component.usdcBalance = formattedBalance;

    if (formattedBalance === 0) {
      updateStatus(
        component,
        `Your USDC balance is 0. Please make sure you have USDC tokens on ${
          isTestnet ? "Base Sepolia" : "Base"
        }.`,
      );
    } else {
      updateStatus(component, `USDC Balance: $${formattedBalance.toFixed(2)}`);
    }

    return formattedBalance;
  } catch (error) {
    console.error("Failed to check USDC balance:", error);
    updateStatus(component, "Could not check USDC balance");
    return 0;
  }
}
