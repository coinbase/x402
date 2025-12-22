import { useCallback, useState, useEffect } from "react";
import { createPublicClient, http, parseUnits, publicActions, Address, Chain } from "viem";
import { getUSDCBalance } from "x402/shared/evm";
import { formatUSDC } from "./chainConfig";

export interface BalanceCheckResult {
  isSufficient: boolean;
  formattedBalance: string;
  balance: bigint;
}

/**
 * Check USDC balance for a given address
 *
 * @param address - The wallet address to check
 * @param chain - Chain object
 * @returns Promise with balance as bigint
 */
export const checkUSDCBalance = async (address: Address, chain: Chain): Promise<bigint> => {
  if (!address) {
    return 0n;
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  }).extend(publicActions);

  return await getUSDCBalance(publicClient, address);
};

/**
 * Check USDC balance and determine if sufficient for payment
 *
 * @param walletAddress - The wallet address to check
 * @param requiredAmount - The amount required (in USDC units, not atomic units)
 * @param chain - Chain object
 * @returns Promise with balance check result
 */
export async function checkUSDCBalanceForPayment(
  walletAddress: Address,
  requiredAmount: string,
  chain: Chain,
): Promise<BalanceCheckResult> {
  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    }).extend(publicActions);
    const currentBalance = await getUSDCBalance(publicClient, walletAddress);
    const requiredBigInt = parseUnits(requiredAmount, 6);

    const isSufficient = currentBalance >= requiredBigInt;

    const formattedBalance = formatUSDC(currentBalance.toString());
    const formattedRequiredAmount = formatUSDC(requiredBigInt.toString());

    console.log(
      `USDC Balance check: ${formattedBalance} available, ${formattedRequiredAmount} required (sufficient: ${isSufficient})`,
    );

    return {
      isSufficient,
      formattedBalance,
      balance: currentBalance,
    };
  } catch (error) {
    console.error("Failed to check USDC balance:", error);
    // If balance check fails, assume insufficient to be safe
    return {
      isSufficient: false,
      balance: 0n,
      formattedBalance: "0",
    };
  }
}

/**
 * Check USDC balance and determine if sufficient for payment (atomic units version)
 *
 * @param walletAddress - The wallet address to check
 * @param requiredAmountAtomic - The amount required in atomic units (e.g., "1000" for 0.001 USDC)
 * @param chain - Chain object
 * @returns Promise with balance check result
 */
export async function checkUSDCBalanceForPaymentAtomic(
  walletAddress: Address,
  requiredAmountAtomic: string,
  chain: Chain,
): Promise<BalanceCheckResult> {
  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    }).extend(publicActions);
    const currentBalance = await getUSDCBalance(publicClient, walletAddress); // bigint
    const requiredBigInt = BigInt(requiredAmountAtomic);

    const isSufficient = currentBalance >= requiredBigInt;

    const formattedBalance = formatUSDC(currentBalance.toString());

    console.log(
      `USDC Balance check (atomic): ${currentBalance} available, ${requiredBigInt} required (sufficient: ${isSufficient})`,
    );

    return {
      isSufficient,
      formattedBalance,
      balance: currentBalance,
    };
  } catch (error) {
    console.error("Failed to check USDC balance (atomic):", error);
    // If balance check fails, assume insufficient to be safe
    return {
      isSufficient: false,
      balance: 0n,
      formattedBalance: "0",
    };
  }
}

/**
 * React hook for managing USDC balance checking
 *
 * @param address - The wallet address to check
 * @param paymentChain - The chain to check balance on (Base or Base Sepolia)
 * @returns Object with balance data and refresh function
 */
export function useUSDCBalance(address: Address | undefined, paymentChain: Chain) {
  const [formattedBalance, setFormattedBalance] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setFormattedBalance("");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const publicClient = createPublicClient({
        chain: paymentChain,
        transport: http(),
      }).extend(publicActions);
      const balance = await getUSDCBalance(publicClient, address);
      console.log("Balance:", balance);
      setFormattedBalance(formatUSDC(balance.toString()));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch balance";
      setError(errorMessage);
      console.error("Error fetching USDC balance:", err);
    } finally {
      setIsLoading(false);
    }
  }, [address, paymentChain]);

  // Auto-refresh balance when address changes
  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  return {
    formattedBalance,
    isLoading,
    error,
    refreshBalance,
  };
}

/**
 * Check if wallet has sufficient USDC balance for a payment
 *
 * @param address - The wallet address
 * @param amount - Required amount in USDC
 * @param chain - Chain object
 * @param chainName - Name of the chain for error messages
 * @returns Promise that resolves if balance is sufficient, throws if not
 */
export async function ensureSufficientUSDCBalance(
  address: Address,
  amount: number,
  chain: Chain,
  chainName?: string,
): Promise<void> {
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  }).extend(publicActions);
  const defaultChainName = chain.name;
  const finalChainName = chainName || defaultChainName;

  const balance = await getUSDCBalance(publicClient, address);

  if (balance === 0n) {
    throw new Error(`Insufficient balance. Make sure you have USDC on ${finalChainName}`);
  }

  const requiredAmount = parseUnits(amount.toString(), 6);
  if (balance < requiredAmount) {
    const formattedBalance = formatUSDC(balance.toString());
    throw new Error(
      `Insufficient USDC balance. You have ${formattedBalance} but need ${amount} USDC`,
    );
  }
}
