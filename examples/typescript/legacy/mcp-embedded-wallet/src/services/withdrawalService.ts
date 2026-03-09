import { getCurrentUser, toViemAccount } from "@coinbase/cdp-core";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
  Address,
  LocalAccount,
  Chain,
} from "viem";
import { CHAIN_CONFIGS } from "../utils/chainConfig";

export type Asset = "ETH" | "USDC";

/**
 * Gets the token configuration for a specific asset on a given chain.
 * Handles both native ETH and ERC20 tokens like USDC.
 *
 * @param chain - The blockchain chain to get asset config for
 * @param asset - The asset type (ETH or USDC)
 * @returns {{ address: Address; decimals: number }} The asset's address and decimal places
 * @throws {Error} If chain or token is not supported
 */
function getAssetConfig(chain: Chain, asset: Asset): { address: Address; decimals: number } {
  const chainConfig = Object.values(CHAIN_CONFIGS).find(config => config.id === chain.id);
  if (!chainConfig) {
    throw new Error(`Chain ${chain.name} (id: ${chain.id}) not supported`);
  }

  if (asset === "ETH") {
    return {
      address: "0x0000000000000000000000000000000000000000" as Address,
      decimals: chainConfig.nativeCurrency.decimals,
    };
  }

  const token = chainConfig.tokens[asset];
  if (!token) {
    throw new Error(`Token ${asset} not supported on ${chain.name}`);
  }

  return {
    address: token.address as Address,
    decimals: token.decimals,
  };
}

// ERC20 ABI for balance and transfer operations
const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export interface WithdrawalConfig {
  toAddress: Address;
  amount: string;
  asset: Asset;
  chain: Chain;
}

/**
 * Retrieves the balance of a specific asset for a given address on a chain.
 * Handles both native ETH balance queries and ERC20 token balance checks.
 *
 * @param address - The address to check balance for
 * @param asset - The asset type (ETH or USDC) to check
 * @param chain - The blockchain chain to query
 * @returns {Promise<string>} The formatted balance with appropriate decimal places
 * @throws {Error} If balance check fails or chain/token is not supported
 */
export async function getBalance(address: Address, asset: Asset, chain: Chain): Promise<string> {
  const assetConfig = getAssetConfig(chain, asset);

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  try {
    if (asset === "ETH") {
      const balance = await publicClient.getBalance({ address });
      return formatUnits(balance, assetConfig.decimals);
    } else {
      const [rawBalance] = await Promise.all([
        publicClient.readContract({
          address: assetConfig.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as Address],
        }),
      ]);
      return formatUnits(rawBalance, assetConfig.decimals);
    }
  } catch (error) {
    console.error("Error fetching balance:", error);
    throw new Error(`Failed to fetch ${asset} balance on ${chain.name}`);
  }
}

/**
 * Sends a withdrawal transaction for ETH or ERC20 tokens.
 * Uses CDP for account access and viem for transaction handling.
 *
 * @param root0 - Withdrawal configuration object
 * @param root0.toAddress - The recipient's address
 * @param root0.amount - The amount to send (in human-readable format)
 * @param root0.asset - The asset type (ETH or USDC) to send
 * @param root0.chain - The blockchain chain to send on
 * @returns {Promise<`0x${string}`>} The transaction hash
 * @throws {Error} If transaction fails, user not found, or chain/token not supported
 */
export async function sendWithdrawal({
  toAddress,
  amount,
  asset,
  chain,
}: WithdrawalConfig): Promise<`0x${string}`> {
  const assetConfig = getAssetConfig(chain, asset);
  const user = await getCurrentUser();
  if (!user?.evmAccounts?.[0]) {
    throw new Error("No CDP user or EVM accounts found");
  }

  const account = await toViemAccount(user.evmAccounts[0]);
  const walletClient = createWalletClient({
    account: account as LocalAccount,
    chain,
    transport: http(),
  });

  try {
    if (asset === "ETH") {
      return await walletClient.sendTransaction({
        to: toAddress as Address,
        value: parseUnits(amount, assetConfig.decimals),
      });
    } else {
      return await walletClient.writeContract({
        address: assetConfig.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [toAddress as Address, parseUnits(amount, assetConfig.decimals)],
      });
    }
  } catch (error) {
    console.error("Error sending withdrawal:", error);
    throw new Error(`Failed to send ${asset} withdrawal on ${chain.name}`);
  }
}
