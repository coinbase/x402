/* eslint-disable jsdoc/check-tag-names */
import { useRef, useMemo, useCallback } from "react";
import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { erc20Abi, formatUnits, type Address } from "viem";
import { UseX402BalanceOptions } from "../types";

const USDC_ADDRESSES: Record<string, Address> = {
  "8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // base
  "84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // base-sepolia
  "137": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // polygon
  "80002": "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // polygon-amoy
  "43114": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // avalanche
  "43113": "0x5425890298aed601595a70AB815c96711a31Bc65", // avalanche-fuji
};

/**
 * React hook for tracking ERC20 token balances with automatic updates.
 *
 * Automatically polls for balance changes using multiple strategies:
 * - Watches for new blocks on the blockchain
 * - Falls back to interval polling if block watching fails
 * - Updates when wallet address or network changes
 *
 * Default behavior checks USDC balance for the currently connected chain.
 *
 * @param options - Configuration object with optional callbacks and settings
 * @returns Object containing balance data, loading state, and refresh function
 *
 * @example
 * Basic usage:
 * ```tsx
 * function WalletBalance() {
 *   const { balance, formatted, isLoading } = useX402Balance();
 *
 *   if (isLoading) return <div>Loading balance...</div>;
 *
 *   return (
 *     <div>
 *       <p>Balance: {balance} USDC</p>
 *       <p>Formatted: {formatted}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * With custom token and callbacks:
 * ```tsx
 * function CustomTokenBalance() {
 *   const { balance, refresh, error } = useX402Balance({
 *     token: "0x1234...",
 *     pollingInterval: 5000,
 *     onSuccess: (bal) => console.log('Balance updated:', bal),
 *     onError: (err) => console.error('Failed:', err)
 *   });
 *
 *   return (
 *     <div>
 *       <p>Balance: {balance}</p>
 *       <button onClick={refresh}>Refresh</button>
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * Real-time balance monitoring:
 * ```tsx
 * function BalanceMonitor() {
 *   const [history, setHistory] = useState<string[]>([]);
 *
 *   const { balance } = useX402Balance({
 *     callbackOnPoll: true,
 *     onSuccess: (newBalance) => {
 *       setHistory(prev => [...prev, newBalance].slice(-10));
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       <h3>Current: {balance}</h3>
 *       <h4>Recent changes:</h4>
 *       <ul>
 *         {history.map((bal, i) => <li key={i}>{bal}</li>)}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 *
 * @remarks
 * Balance Update Strategy:
 * 1. Fetches on mount and when address/network changes
 * 2. Watches for new blocks (when callbackOnPoll is not false)
 * 3. Polls at specified interval as fallback (default: 10s)
 * 4. Manual refresh via refresh() function (always triggers onSuccess)
 *
 * The hook uses multiple update mechanisms concurrently for reliability.
 *
 * @remarks
 * Callback Behavior:
 * - By default, onSuccess is only called when you manually call refresh()
 * - Set callbackOnPoll: true to trigger onSuccess on every balance change
 * - This prevents unnecessary re-renders when you just need to display the balance
 *
 * @remarks
 * Supported Networks (USDC addresses built-in):
 * - Base (Mainnet & Sepolia)
 * - Polygon (Mainnet & Amoy)
 * - Avalanche (Mainnet & Fuji)
 *
 * For other tokens or networks, provide custom token address via options.
 * The hook automatically fetches the token's decimals from the blockchain.
 */
export function useX402Balance(options?: UseX402BalanceOptions) {
  const { address, chain } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: options?.callbackOnPoll !== false });

  const tokenAddress = useMemo(
    () => options?.token || (chain?.id ? USDC_ADDRESSES[chain.id.toString()] : undefined),
    [options?.token, chain?.id],
  );

  const pollingInterval = options?.pollingInterval || 10000;
  const lastCallbackBalance = useRef<string | null>(null);
  const lastBlockRef = useRef<bigint | undefined>(undefined);

  // Fetch token decimals
  const { data: decimals } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
    query: {
      enabled: !!tokenAddress,
    },
  });

  const {
    data: rawBalance,
    isLoading,
    error: queryError,
    refetch,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!(address && tokenAddress),
      refetchInterval: pollingInterval,
      staleTime: pollingInterval / 2,
      gcTime: 1000 * 60 * 5,
    },
  });

  const balance = useMemo(() => {
    if (!rawBalance || !decimals) return "0";
    return formatUnits(rawBalance, decimals);
  }, [rawBalance, decimals]);

  // Format as currency
  const formatted = useMemo(() => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(parseFloat(balance));
  }, [balance]);

  // Handle block number changes for callbacks
  useMemo(() => {
    if (!blockNumber) return;

    // Only trigger callback if block actually changed
    if (blockNumber !== lastBlockRef.current) {
      lastBlockRef.current = blockNumber;

      // Call onSuccess only if balance changed AND callbackOnPoll is enabled!
      const shouldCallback = options?.callbackOnPoll && lastCallbackBalance.current !== balance;

      if (shouldCallback) {
        options?.onSuccess?.(balance);
        lastCallbackBalance.current = balance;
      }
    }
  }, [blockNumber, balance, options]);

  const error = useMemo(() => {
    if (queryError) {
      const err = queryError instanceof Error ? queryError : new Error("Failed to fetch balance");

      options?.onError?.(err);

      return err;
    }
    return null;
  }, [queryError, options]);

  const refresh = useCallback(async () => {
    const result = await refetch();
    if (result.data && decimals) {
      const newBalance = formatUnits(result.data, decimals);
      options?.onSuccess?.(newBalance);
      lastCallbackBalance.current = newBalance;
    }
  }, [options, decimals]);

  return {
    /**
     * Raw balance as string with full precision (e.g., "123.456789").
     * Always returns "0" if balance cannot be fetched.
     */
    balance,

    /**
     * Balance formatted as USD currency string (e.g., "$123.46").
     * Useful for displaying in UI with proper formatting.
     *
     * @example
     * ```tsx
     * const { formatted } = useX402Balance();
     * return <p>Your balance: {formatted}</p>;
     * ```
     */
    formatted,

    /**
     * Whether balance is currently being fetched.
     * Useful for showing loading indicators.
     */
    isLoading,

    /**
     * Manually trigger a balance refresh.
     * Always invokes onSuccess callback when complete (if provided).
     *
     * @example
     * ```tsx
     * const { balance, refresh } = useX402Balance();
     *
     * return (
     *   <button onClick={refresh}>
     *     Refresh Balance
     *   </button>
     * );
     * ```
     */
    refresh,

    /**
     * Error object if balance fetch failed, null otherwise.
     * Contains detailed error message explaining what went wrong.
     */
    error,
  };
}
