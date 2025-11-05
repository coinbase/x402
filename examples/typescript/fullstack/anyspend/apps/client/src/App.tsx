import { useEffect, useState } from "react";
import { publicActions } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import {
  decodeXPaymentResponse,
  MultiNetworkSigner,
  Signer,
  wrapFetchWithPayment,
} from "@b3dotfun/anyspend-x402-fetch";
import { TokenCompatClient } from "@b3dotfun/anyspend-x402-token-compat";
import "./App.css";
import { BASE_TOKENS } from "./wagmi.config";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MAX_PAYMENT_VALUE = BigInt(1 * 10 ** 25); // 1 USDC max

interface PaymentInfo {
  status: string;
  payer?: string;
  transaction?: string;
  network?: string;
  error?: string;
}

interface PremiumData {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: string;
  high24h: number;
  low24h: number;
  priceHistory: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  dataPoints: number;
  timestamp: string;
}

function App() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  const [selectedToken, setSelectedToken] = useState<string>("preset");
  const [customTokenAddress, setCustomTokenAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [premiumData, setPremiumData] = useState<PremiumData | null>(null);
  const [btcData, setBtcData] = useState<PremiumData | null>(null);
  const [priceInfo, setPriceInfo] = useState<string>("Loading...");
  const [srcNetwork, setSrcNetwork] = useState<string>("base");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>(
    {},
  );
  const [selectedChain, setSelectedChain] = useState<string>("8453"); // Base mainnet
  const [userTokens, setUserTokens] = useState<
    Array<{
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      balance: string;
      valueUsd?: number;
    }>
  >([]);
  const [availableChains, setAvailableChains] = useState<string[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<{
    stage: "idle" | "signing" | "verifying" | "settling" | "complete";
    message: string;
  }>({ stage: "idle", message: "" });
  const [dataType, setDataType] = useState<"eth" | "btc">("eth");

  // Set default preset token when connected (default to B3)
  useEffect(() => {
    if (isConnected && selectedToken === "preset" && BASE_TOKENS.length > 0) {
      setSelectedToken(BASE_TOKENS[0].address); // B3 token
    }
  }, [isConnected, selectedToken]);

  // Fetch token balances from server and detect available chains
  useEffect(() => {
    const fetchBalancesForAllChains = async () => {
      if (!address) return;

      const chains = ["1", "8453", "137", "42161"]; // Ethereum, Base, Polygon, Arbitrum
      const chainsWithTokens: string[] = [];

      try {
        // Fetch balances for all chains in parallel
        const promises = chains.map(async (chainId) => {
          try {
            const url = `${API_BASE_URL}/api/balances/${address}?chain_id=${chainId}`;
            const response = await fetch(url);

            if (response.ok) {
              const data = await response.json();
              if (data.success && data.tokens && data.tokens.length > 0) {
                // Check if there are any non-native tokens
                const hasTokens = data.tokens.some(
                  (token: any) => token.address.toLowerCase() !== "native",
                );
                if (hasTokens) {
                  return chainId;
                }
              }
            }
          } catch (err) {
            console.error(
              `Failed to fetch balances for chain ${chainId}:`,
              err,
            );
          }
          return null;
        });

        const results = await Promise.all(promises);
        const validChains = results.filter(
          (chain): chain is string => chain !== null,
        );

        // If no chains have tokens, show all chains by default
        if (validChains.length === 0) {
          setAvailableChains(chains);
        } else {
          setAvailableChains(validChains);
          // If current selected chain has no tokens, switch to first available chain
          if (!validChains.includes(selectedChain)) {
            setSelectedChain(validChains[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch balances for all chains:", err);
      }
    };

    const fetchBalances = async () => {
      if (!address) return;

      try {
        const url = `${API_BASE_URL}/api/balances/${address}?chain_id=${selectedChain}`;
        console.log("Fetching balances from:", url);

        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          console.log("Balance response:", data);

          if (data.success && data.tokens) {
            const balances: Record<string, string> = {};

            // Filter out native ETH token (address: "native") and WETH tokens
            const filteredTokens = data.tokens.filter((token: any) => {
              const address = token.address.toLowerCase();
              const symbol = token.symbol?.toUpperCase() || "";

              return (
                address !== "native" &&
                symbol !== "WETH" &&
                !symbol.includes("WETH")
              );
            });

            // Check compatibility for each token using the fixed TokenCompatClient
            const compatClient = new TokenCompatClient();
            const compatibilityChecks = await Promise.all(
              filteredTokens.map(async (token: any) => {
                try {
                  const chainIdNum = Number(selectedChain);
                  const supportsPermit = await compatClient.supportsEip2612(
                    chainIdNum,
                    token.address,
                  );
                  return { token, supportsPermit };
                } catch (err) {
                  console.error(
                    `Failed to check compatibility for ${token.symbol}:`,
                    err,
                  );
                  // If we can't check, exclude the token to be safe
                  return { token, supportsPermit: false };
                }
              }),
            );

            // Filter to only compatible tokens (EIP-2612 support)
            const compatibleTokens = compatibilityChecks
              .filter((result) => result.supportsPermit)
              .map((result) => result.token);

            console.log(
              `Filtered to ${compatibleTokens.length} compatible tokens out of ${filteredTokens.length} total`,
            );

            // Map balances by token address
            compatibleTokens.forEach((token: any) => {
              const tokenAddress = token.address.toLowerCase();
              balances[tokenAddress] = token.balance;
            });

            setTokenBalances(balances);
            setUserTokens(compatibleTokens);
          }
        } else {
          console.error("Balance fetch failed:", response.status);
        }
      } catch (err) {
        console.error("Failed to fetch balances:", err);
      }
    };

    if (address) {
      // First fetch available chains
      fetchBalancesForAllChains();
      // Then fetch balances for selected chain
      fetchBalances();
    }
  }, [address, selectedChain]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `${timestamp}: ${message}`]);
  };

  // Fetch price information from server for "You Pay" display
  useEffect(() => {
    const fetchPriceInfo = async () => {
      try {
        let tokenAddress = selectedToken;

        // Handle custom token
        if (selectedToken === "custom") {
          tokenAddress = customTokenAddress;
        }

        // Skip if no valid token
        if (
          !tokenAddress ||
          tokenAddress === "preset" ||
          !tokenAddress.startsWith("0x")
        ) {
          console.log("Skipping price fetch - invalid token:", tokenAddress);
          setPriceInfo("Loading...");
          return;
        }

        // Set loading state
        setPriceInfo("Loading...");
        setSrcNetwork("base");
        console.log("Fetching price for token:", tokenAddress);

        // Map chain ID to network name
        const getNetworkName = (chainId: string): string => {
          switch (chainId) {
            case "1":
              return "ethereum";
            case "8453":
              return "base";
            case "84532":
              return "base-sepolia";
            case "137":
              return "polygon";
            case "80002":
              return "polygon-amoy";
            case "42161":
              return "arbitrum";
            case "10":
              return "optimism";
            case "56":
              return "bsc";
            case "43114":
              return "avalanche";
            case "43113":
              return "avalanche-fuji";
            case "2741":
              return "abstract";
            case "11124":
              return "abstract-testnet";
            case "8333":
              return "b3";
            case "4689":
              return "iotex";
            case "3338":
              return "peaq";
            case "1329":
              return "sei";
            case "1328":
              return "sei-testnet";
            default:
              return "base";
          }
        };

        // Make a request to get payment requirements (402 response)
        const headers: HeadersInit = {};
        headers["X-PREFERRED-TOKEN"] = tokenAddress;
        headers["X-PREFERRED-NETWORK"] = getNetworkName(selectedChain);

        // Use the appropriate endpoint based on dataType
        const endpoint =
          dataType === "btc"
            ? `${API_BASE_URL}/api/btc`
            : `${API_BASE_URL}/api/b3/premium`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
        });

        console.log("Price fetch response status:", response.status);

        // If 402, parse the payment requirements
        if (response.status === 402) {
          const data = await response.json();
          console.log("Payment requirements:", data);

          const paymentReqs = data.accepts || data.paymentRequirements || [];

          if (paymentReqs.length > 0) {
            const req = paymentReqs[0];

            // Capture source network
            setSrcNetwork(req.srcNetwork || req.network || "base");

            // Process srcAmountRequired (what you pay)
            const srcAmountStr =
              req.srcAmountRequired || req.amount || req.maxAmountRequired;

            if (srcAmountStr) {
              const srcAmount = BigInt(srcAmountStr);

              // Get decimals - try multiple sources
              let srcDecimals = 18; // Default
              let srcTokenAddr = req.srcTokenAddress || req.asset;

              // First try to find in BASE_TOKENS
              const srcToken = BASE_TOKENS.find(
                (t) =>
                  t.address.toLowerCase() ===
                  (srcTokenAddr || "").toLowerCase(),
              );

              if (srcToken) {
                srcDecimals = srcToken.decimals;
              } else if (req.extra?.chainId && req.extra?.verifyingContract) {
                // For cross-chain tokens, try to infer decimals from common tokens
                const tokenAddr = (
                  req.srcTokenAddress ||
                  req.extra.verifyingContract ||
                  ""
                ).toLowerCase();
                const tokenName = (req.extra?.name || "").toLowerCase();

                // Common token decimals mapping
                if (
                  tokenAddr === "0xdac17f958d2ee523a2206206994597c13d831ec7" ||
                  tokenAddr === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" ||
                  tokenAddr === "0xaf88d065e77c8cc2239327c5edb3a432268e5831" ||
                  tokenAddr === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ||
                  tokenAddr === "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
                ) {
                  // USDT/USDC on various chains
                  srcDecimals = 6;
                } else if (
                  tokenAddr === "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" ||
                  tokenAddr === "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
                ) {
                  // cbBTC/WBTC
                  srcDecimals = 8;
                } else if (
                  tokenName.includes("wrapped btc") ||
                  tokenName.includes("wbtc") ||
                  tokenName.includes("btc")
                ) {
                  srcDecimals = 8;
                } else if (
                  tokenName.includes("usd coin") ||
                  tokenName.includes("usdc") ||
                  tokenName.includes("tether") ||
                  tokenName.includes("usdt")
                ) {
                  srcDecimals = 6;
                }
              } else if (req.decimals) {
                srcDecimals = req.decimals;
              }

              // Convert to human-readable format
              const srcDivisor = BigInt(10 ** srcDecimals);
              const srcIntegerPart = srcAmount / srcDivisor;
              const srcFractionalPart = srcAmount % srcDivisor;

              let srcPriceStr = srcIntegerPart.toString();
              if (srcFractionalPart > 0) {
                const fracStr = srcFractionalPart
                  .toString()
                  .padStart(srcDecimals, "0");
                const trimmed = fracStr.replace(/0+$/, "");
                if (trimmed.length > 0) {
                  srcPriceStr += "." + trimmed;
                }
              }

              // Get source token symbol
              let srcSymbol = "tokens";

              if (req.srcTokenAddress) {
                const sourceToken = BASE_TOKENS.find(
                  (t) =>
                    t.address.toLowerCase() ===
                    req.srcTokenAddress.toLowerCase(),
                );
                if (sourceToken) {
                  srcSymbol = sourceToken.symbol;
                }
              } else if (req.asset) {
                const assetToken = BASE_TOKENS.find(
                  (t) => t.address.toLowerCase() === req.asset.toLowerCase(),
                );
                if (assetToken) {
                  srcSymbol = assetToken.symbol;
                }
              }

              if (srcSymbol === "tokens" && req.extra?.name) {
                srcSymbol = req.extra.name;
              }

              setPriceInfo(`${srcPriceStr} ${srcSymbol}`);
            } else {
              setPriceInfo("Loading...");
            }
          } else {
            console.log("No payment requirements found");
            setPriceInfo("Loading...");
          }
        } else {
          console.log("Non-402 response, using default");
          setPriceInfo("Loading...");
        }
      } catch (err) {
        console.error("Failed to fetch price info:", err);
        setPriceInfo("Loading...");
      }
    };

    if (isConnected && selectedToken && selectedToken !== "preset") {
      fetchPriceInfo();
    } else if (!isConnected || selectedToken === "preset") {
      setPriceInfo("Loading...");
    }
  }, [isConnected, selectedToken, customTokenAddress, selectedChain, dataType]);

  const openPaymentModal = () => {
    if (!isConnected) {
      setError("Please connect your wallet first");
      return;
    }
    // Note: We don't check network here because we automatically switch chains before payment
    setShowPaymentModal(true);
  };

  const fetchData = async (type: "eth" | "btc") => {
    if (!isConnected || !walletClient || !address) {
      setError("Please connect your wallet first");
      setShowPaymentModal(false);
      return;
    }

    // Determine which token address to use
    const tokenAddress =
      selectedToken === "custom" ? customTokenAddress : selectedToken;

    if (!tokenAddress || tokenAddress === "preset") {
      setError("Please select or enter a token address");
      return;
    }

    // Validate custom token address format
    if (
      selectedToken === "custom" &&
      !customTokenAddress.match(/^0x[a-fA-F0-9]{40}$/)
    ) {
      setError("Invalid token address format");
      return;
    }

    // Note: We don't check network here because we support cross-chain payments
    // The user can pay from any chain, not just Base

    // Close the payment configuration modal immediately
    setShowPaymentModal(false);

    setLoading(true);
    setLogs([]);
    setError(null);
    setPaymentInfo(null);
    if (type === "btc") {
      setBtcData(null);
    } else {
      setPremiumData(null);
    }
    setPaymentStatus({ stage: "idle", message: "" });

    try {
      addLog(`🔐 Connected wallet: ${address}`);
      addLog(`💰 Payment token: ${tokenAddress}`);
      addLog(`🌐 Network: ${chain?.name}`);

      // Switch to the correct chain if the selected token is on a different chain
      const targetChainId = Number(selectedChain);
      if (chain?.id !== targetChainId) {
        addLog(`🔄 Switching to chain ${selectedChain}...`);
        setPaymentStatus({
          stage: "signing",
          message: `Switching to chain ${selectedChain}...`,
        });
        try {
          await switchChain({ chainId: targetChainId });
          addLog(`✅ Switched to chain ${selectedChain}`);
        } catch (switchError) {
          throw new Error(
            `Failed to switch chain: ${switchError instanceof Error ? switchError.message : "Unknown error"}`,
          );
        }
      }

      setPaymentStatus({
        stage: "signing",
        message: "Preparing payment signature...",
      });
      addLog("🔧 Setting up payment-enabled fetch...");
      // Extend wallet client with public actions to make it compatible with Signer type
      const extendedWalletClient = walletClient.extend(publicActions);

      // Only set payment preferences if not using default USDC
      const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

      // Map chain ID to network name
      const getNetworkName = (chainId: string): string => {
        switch (chainId) {
          case "1":
            return "ethereum";
          case "8453":
            return "base";
          case "84532":
            return "base-sepolia";
          case "137":
            return "polygon";
          case "80002":
            return "polygon-amoy";
          case "42161":
            return "arbitrum";
          case "10":
            return "optimism";
          case "56":
            return "bsc";
          case "43114":
            return "avalanche";
          case "43113":
            return "avalanche-fuji";
          case "2741":
            return "abstract";
          case "11124":
            return "abstract-testnet";
          case "8333":
            return "b3";
          case "4689":
            return "iotex";
          case "3338":
            return "peaq";
          case "1329":
            return "sei";
          case "1328":
            return "sei-testnet";
          default:
            return "base";
        }
      };

      // Always include payment preferences - tell server which token we want to pay with
      const paymentPreferences = {
        preferredToken: tokenAddress,
        preferredNetwork: getNetworkName(selectedChain) as any,
      };

      addLog(
        `💡 Using preferred token: ${tokenAddress} on ${getNetworkName(selectedChain)}`,
      );

      // Wrap fetch with automatic payment handling and payment preferences
      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        extendedWalletClient as Signer | MultiNetworkSigner,
        MAX_PAYMENT_VALUE, // Max 1 USDC
        undefined, // Use default payment requirements selector
        undefined, // Use default config
        paymentPreferences,
      );

      setPaymentStatus({
        stage: "signing",
        message: "Please sign the payment in your wallet...",
      });
      addLog(
        "📡 Making request to server (payment will be handled automatically)...",
      );

      // Make request - payment preferences are automatically added as headers
      try {
        setPaymentStatus({
          stage: "verifying",
          message: "Verifying payment signature...",
        });

        // Determine the API endpoint based on type
        const endpoint =
          type === "btc"
            ? `${API_BASE_URL}/api/btc`
            : `${API_BASE_URL}/api/b3/premium`;
        const response = await fetchWithPayment(endpoint, {
          method: "POST",
        });

        setPaymentStatus({
          stage: "settling",
          message: "Settling payment on-chain...",
        });
        addLog(`✅ Server responded with status: ${response.status}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || errorData.error || "Request failed",
          );
        }

        // Get payment response header if present
        const paymentResponseHeader =
          response.headers.get("X-PAYMENT-RESPONSE");
        if (paymentResponseHeader) {
          const paymentInfo = decodeXPaymentResponse(paymentResponseHeader);
          addLog(`✅ Payment ${paymentInfo.success ? "settled" : "verified"}`);
          if (paymentInfo.transaction) {
            addLog(`Transaction: ${paymentInfo.transaction}`);
          }
          setPaymentInfo({
            status: paymentInfo.success ? "settled" : "verified",
            payer: paymentInfo.payer,
            transaction: paymentInfo.transaction,
            network: paymentInfo.network,
          });
        }

        // Get the response data
        setPaymentStatus({
          stage: "complete",
          message: "Payment successful! Loading data...",
        });
        const data = await response.json();
        const dataLabel = type === "btc" ? "BTC" : "Premium";
        addLog(`🎉 ${dataLabel} content received!`);

        // Set the appropriate data state
        if (type === "btc") {
          setBtcData(data.data);
        } else {
          setPremiumData(data.data);
        }
      } catch (fetchError) {
        // This catches errors from fetchWithPayment including signature requests
        const message =
          fetchError instanceof Error ? fetchError.message : "Unknown error";
        addLog(`❌ Error during payment: ${message}`);
        console.error("Payment error details:", fetchError);
        throw fetchError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      // Check if error is due to nonces function not existing (non-permit token)
      if (
        message.includes("nonces") &&
        (message.includes("reverted") || message.includes("returned no data"))
      ) {
        const friendlyMessage =
          "This token doesn't support gasless signatures (EIP-2612 permit). Please select a different token like USDC or DAI.";
        addLog(`❌ Error: ${friendlyMessage}`);
        setError(friendlyMessage);
      } else {
        addLog(`❌ Error: ${message}`);
        setError(message);
      }
    } finally {
      setLoading(false);
      // Reset payment status after a delay
      setTimeout(() => {
        setPaymentStatus({ stage: "idle", message: "" });
      }, 2000);
    }
  };

  // Wrapper functions for convenience
  const fetchPremiumData = () => fetchData("eth");
  const fetchBtcData = () => fetchData("btc");

  return (
    <div className="app">
      <div className="container">
        {/* Demo Banner */}
        <div className="demo-banner">
          <div className="demo-banner-content">
            <span className="demo-badge">DEMO</span>
            <p className="demo-text">
              This is a demo application showcasing <strong>x402</strong> - Pay
              with any token for HTTP APIs
            </p>
            <a
              href="https://anyspend.com/x402"
              target="_blank"
              rel="noopener noreferrer"
              className="demo-link"
            >
              Learn More →
            </a>
          </div>
        </div>

        {/* Header with Wallet Status */}
        <div className="header">
          <div className="header-content">
            <div className="logo-section">
              <img
                src="https://cdn.b3.fun/anyspend-logo-brand.svg"
                alt="AnySpend"
                className="logo"
              />
              <div className="logo-text">
                <p className="subtitle">
                  Premium ETH price data - Pay with any token
                </p>
              </div>
            </div>
            <div className="wallet-section">
              {!isConnected ? (
                <div className="connector-buttons-header">
                  <button
                    onClick={() => connect({ connector: connectors[0] })}
                    className="button button-small"
                  >
                    Connect Wallet
                  </button>
                </div>
              ) : (
                <div className="wallet-header-info">
                  <span className="status-badge">
                    ✅ {address?.slice(0, 6)}...{address?.slice(-4)}
                    {chain?.name && (
                      <span style={{ marginLeft: "8px", fontSize: "0.85em" }}>
                        ({chain.name})
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => disconnect()}
                    className="button button-small button-secondary"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Action Cards */}
        {isConnected && (
          <>
            <div className="card action-card">
              <div className="action-content">
                <div className="action-text">
                  <h2>📈 ETH Price History</h2>
                  <p className="subtitle">
                    Get 24-hour ETH price history with OHLC data from CoinGecko
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDataType("eth");
                    openPaymentModal();
                  }}
                  disabled={loading}
                  className="button button-large"
                >
                  📊 Get ETH Data
                </button>
              </div>
            </div>

            <div className="card action-card">
              <div className="action-content">
                <div className="action-text">
                  <h2>₿ BTC Price History</h2>
                  <p className="subtitle">
                    Get 24-hour BTC price history with OHLC data - Only 0.01
                    USDC!
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDataType("btc");
                    setShowPaymentModal(true);
                  }}
                  disabled={loading}
                  className="button button-large"
                >
                  ₿ Get BTC Data
                </button>
              </div>
            </div>
          </>
        )}

        {/* Payment Modal */}
        {showPaymentModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowPaymentModal(false)}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>💳 Payment Configuration</h2>
                <button
                  className="modal-close"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={loading}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {/* Price Display - Show dynamic "You Pay" and fixed "Data Price" */}
                {selectedToken && selectedToken !== "preset" && (
                  <div className="price-display">
                    <div className="price-row">
                      <div className="price-item">
                        <div className="price-label">You Pay</div>
                        <div className="price-value">
                          {priceInfo === "Loading..." ? (
                            <span className="loading">⏳ Loading...</span>
                          ) : (
                            <span>{priceInfo}</span>
                          )}
                        </div>
                        <div className="price-network-small">
                          on {srcNetwork}
                        </div>
                      </div>
                      <div className="swap-arrow">→</div>
                      <div className="price-item">
                        <div className="price-label">Data Price</div>
                        <div className="price-value">
                          <span>
                            {dataType === "btc" ? "0.01 USDC" : "100 B3"}
                          </span>
                        </div>
                        <div className="price-network-small">on base</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chain Selection - Only show chains with tokens */}
                <div className="input-group">
                  <label>⛓️ Select Chain</label>
                  {availableChains.length > 0 ? (
                    <div className="chain-selector">
                      {availableChains.includes("1") && (
                        <button
                          type="button"
                          className={`chain-option ${selectedChain === "1" ? "selected" : ""}`}
                          onClick={() => setSelectedChain("1")}
                          disabled={loading}
                        >
                          <span className="chain-name">Ethereum</span>
                        </button>
                      )}
                      {availableChains.includes("8453") && (
                        <button
                          type="button"
                          className={`chain-option ${selectedChain === "8453" ? "selected" : ""}`}
                          onClick={() => setSelectedChain("8453")}
                          disabled={loading}
                        >
                          <span className="chain-name">Base</span>
                        </button>
                      )}
                      {availableChains.includes("137") && (
                        <button
                          type="button"
                          className={`chain-option ${selectedChain === "137" ? "selected" : ""}`}
                          onClick={() => setSelectedChain("137")}
                          disabled={loading}
                        >
                          <span className="chain-name">Polygon</span>
                        </button>
                      )}
                      {availableChains.includes("42161") && (
                        <button
                          type="button"
                          className={`chain-option ${selectedChain === "42161" ? "selected" : ""}`}
                          onClick={() => setSelectedChain("42161")}
                          disabled={loading}
                        >
                          <span className="chain-name">Arbitrum</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="chain-selector">
                      <div className="no-tokens">Loading chains...</div>
                    </div>
                  )}
                </div>

                {/* Token Selection - Top 5 from wallet */}
                <div className="input-group">
                  <label>
                    💰 Select Payment Token
                    {userTokens.length > 0 && (
                      <span
                        style={{
                          fontWeight: "normal",
                          fontSize: "0.8rem",
                          marginLeft: "0.5rem",
                        }}
                      >
                        (Top {userTokens.length} by value)
                      </span>
                    )}
                  </label>
                  <div className="token-grid">
                    {userTokens.length > 0 ? (
                      userTokens.map((token) => (
                        <button
                          key={token.address}
                          type="button"
                          className={`token-option ${selectedToken === token.address ? "selected" : ""}`}
                          onClick={() => setSelectedToken(token.address)}
                          disabled={loading}
                        >
                          <div className="token-info">
                            <div className="token-symbol">{token.symbol}</div>
                            <div className="token-name">
                              {token.balance} {token.symbol}
                            </div>
                          </div>
                          {selectedToken === token.address && (
                            <div className="token-check">✓</div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="no-tokens">
                        No tokens found. Connect your wallet or select a
                        different chain.
                      </div>
                    )}
                    <button
                      type="button"
                      className={`token-option ${selectedToken === "custom" ? "selected" : ""}`}
                      onClick={() => setSelectedToken("custom")}
                      disabled={loading}
                    >
                      <div className="token-info">
                        <div className="token-symbol">Custom</div>
                        <div className="token-name">Other Token</div>
                      </div>
                      {selectedToken === "custom" && (
                        <div className="token-check">✓</div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Custom Token Address Input */}
                {selectedToken === "custom" && (
                  <div className="input-group">
                    <label htmlFor="customToken">Custom Token Address</label>
                    <input
                      type="text"
                      id="customToken"
                      value={customTokenAddress}
                      onChange={(e) => setCustomTokenAddress(e.target.value)}
                      placeholder="0x..."
                      className="input"
                      disabled={loading}
                    />
                    <p className="help-text">
                      Enter the ERC-20 token contract address on Base
                    </p>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="button button-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    dataType === "btc" ? fetchBtcData() : fetchPremiumData()
                  }
                  disabled={
                    loading ||
                    !selectedToken ||
                    selectedToken === "preset" ||
                    priceInfo === "Loading..."
                  }
                  className={`button ${loading ? "loading" : ""}`}
                >
                  {loading
                    ? "⏳ Processing..."
                    : priceInfo === "Loading..."
                      ? "⏳ Loading Price..."
                      : "✓ Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Modal - Separate from payment configuration */}
        {loading && (
          <div className="modal-overlay">
            <div className="modal loading-modal">
              <div className="loading-modal-content">
                <div className="payment-status-spinner">
                  <div className={`spinner stage-${paymentStatus.stage}`}></div>
                </div>
                <div className="payment-status-text">
                  <h2>{paymentStatus.message || "Processing payment..."}</h2>
                  <div className="payment-status-steps">
                    <div
                      className={`status-step ${paymentStatus.stage === "signing" || paymentStatus.stage === "verifying" || paymentStatus.stage === "settling" || paymentStatus.stage === "complete" ? "active" : ""} ${paymentStatus.stage === "verifying" || paymentStatus.stage === "settling" || paymentStatus.stage === "complete" ? "completed" : ""}`}
                    >
                      <span className="step-number">1</span>
                      <span className="step-label">Sign</span>
                    </div>
                    <div className="status-connector"></div>
                    <div
                      className={`status-step ${paymentStatus.stage === "verifying" || paymentStatus.stage === "settling" || paymentStatus.stage === "complete" ? "active" : ""} ${paymentStatus.stage === "settling" || paymentStatus.stage === "complete" ? "completed" : ""}`}
                    >
                      <span className="step-number">2</span>
                      <span className="step-label">Verify</span>
                    </div>
                    <div className="status-connector"></div>
                    <div
                      className={`status-step ${paymentStatus.stage === "settling" || paymentStatus.stage === "complete" ? "active" : ""} ${paymentStatus.stage === "complete" ? "completed" : ""}`}
                    >
                      <span className="step-number">3</span>
                      <span className="step-label">Settle</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Network Switcher Card - Removed: We now support cross-chain payments */}

        {/* Results Section */}
        <div className="results-section">
          {/* Logs */}
          {logs.length > 0 && (
            <div className="card logs-card">
              <h2>📜 Transaction Log</h2>
              <div className="logs">
                {logs.map((log, i) => (
                  <div key={i} className="log-entry">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="card error-card">
              <h3>Error</h3>
              <p>{error}</p>
            </div>
          )}

          {/* Payment Info */}
          {paymentInfo && (
            <div className="card payment-card">
              <h2>✅ Payment Confirmed</h2>
              <div className="payment-details">
                <div className="detail">
                  <span className="label">Status:</span>
                  <span className="value">{paymentInfo.status}</span>
                </div>
                {paymentInfo.payer && (
                  <div className="detail">
                    <span className="label">Payer:</span>
                    <span className="value mono">{paymentInfo.payer}</span>
                  </div>
                )}
                {paymentInfo.transaction && (
                  <>
                    <div className="detail">
                      <span className="label">Transaction:</span>
                      <a
                        href={`https://sepolia.basescan.org/tx/${paymentInfo.transaction}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="value link mono"
                      >
                        {paymentInfo.transaction}
                      </a>
                    </div>
                    <div className="detail">
                      <span className="label">Network:</span>
                      <span className="value">{paymentInfo.network}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Premium Content */}
          {premiumData && (
            <div className="card content-card">
              <div className="content-header">
                <h2>
                  📈 {premiumData.name} ({premiumData.symbol}) Price History
                </h2>
                <span className="badge">✨ PAID</span>
              </div>

              {/* Price Overview */}
              <div className="section">
                <h3>💰 Current Price</h3>
                <div className="analysis-grid">
                  <div className="stat">
                    <span className="stat-label">Price</span>
                    <p className="stat-value">
                      ${premiumData.currentPrice.toLocaleString()}
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h Change</span>
                    <p
                      className={`stat-value ${parseFloat(premiumData.priceChangePercent) >= 0 ? "positive" : "negative"}`}
                    >
                      {premiumData.priceChangePercent}%
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h High</span>
                    <p className="stat-value">
                      ${premiumData.high24h.toLocaleString()}
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h Low</span>
                    <p className="stat-value">
                      ${premiumData.low24h.toLocaleString()}
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Data Points</span>
                    <p className="stat-value">{premiumData.dataPoints}</p>
                  </div>
                </div>
              </div>

              {/* Price History Sample */}
              <div className="section">
                <h3>📊 Recent Price History (Last 10 data points)</h3>
                <div className="price-history-table">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "2px solid var(--border-primary)",
                        }}
                      >
                        <th style={{ padding: "0.75rem", textAlign: "left" }}>
                          Time
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          Open
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          High
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          Low
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          Close
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {premiumData.priceHistory
                        .slice(-10)
                        .reverse()
                        .map((item, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom: "1px solid var(--border-primary)",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            >
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                              }}
                            >
                              ${item.open.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                                color: "var(--accent-success)",
                              }}
                            >
                              ${item.high.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                                color: "var(--accent-error)",
                              }}
                            >
                              ${item.low.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                                fontWeight: "600",
                              }}
                            >
                              ${item.close.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="timestamp">
                Data fetched at{" "}
                {new Date(premiumData.timestamp).toLocaleString()}
              </div>
            </div>
          )}

          {/* BTC Content */}
          {btcData && (
            <div className="card content-card">
              <div className="content-header">
                <h2>
                  ₿ {btcData.name} ({btcData.symbol}) Price History
                </h2>
                <span className="badge">✨ PAID</span>
              </div>

              {/* Price Overview */}
              <div className="section">
                <h3>💰 Current Price</h3>
                <div className="analysis-grid">
                  <div className="stat">
                    <span className="stat-label">Price</span>
                    <p className="stat-value">
                      ${btcData.currentPrice.toLocaleString()}
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h Change</span>
                    <p
                      className={`stat-value ${parseFloat(btcData.priceChangePercent) >= 0 ? "positive" : "negative"}`}
                    >
                      {btcData.priceChangePercent}%
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h High</span>
                    <p className="stat-value">
                      ${btcData.high24h.toLocaleString()}
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h Low</span>
                    <p className="stat-value">
                      ${btcData.low24h.toLocaleString()}
                    </p>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Data Points</span>
                    <p className="stat-value">{btcData.dataPoints}</p>
                  </div>
                </div>
              </div>

              {/* Price History Sample */}
              <div className="section">
                <h3>📊 Recent Price History (Last 10 data points)</h3>
                <div className="price-history-table">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "2px solid var(--border-primary)",
                        }}
                      >
                        <th style={{ padding: "0.75rem", textAlign: "left" }}>
                          Time
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          Open
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          High
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          Low
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>
                          Close
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {btcData.priceHistory
                        .slice(-10)
                        .reverse()
                        .map((item, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom: "1px solid var(--border-primary)",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            >
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                              }}
                            >
                              ${item.open.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                                color: "var(--accent-success)",
                              }}
                            >
                              ${item.high.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                                color: "var(--accent-error)",
                              }}
                            >
                              ${item.low.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem",
                                textAlign: "right",
                                fontSize: "0.875rem",
                                fontWeight: "600",
                              }}
                            >
                              ${item.close.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="timestamp">
                Data fetched at {new Date(btcData.timestamp).toLocaleString()}
              </div>
            </div>
          )}
        </div>
        {/* End Results Section */}

        {/* Code Example Section */}
        <div className="code-example-section">
          <div className="code-example-header">
            <h2>💻 How to Pay with Any Token</h2>
            <p className="code-example-description">
              Use the x402-fetch library to enable payments with any token in
              your application. This example shows how to pay with B3 token on
              Base, which gets automatically swapped to USDC.
            </p>
          </div>

          <div className="code-example-card">
            <div className="code-example-tabs">
              <span className="code-tab active">TypeScript</span>
            </div>
            <pre className="code-block">
              <code>{`import { config } from "dotenv";
import {
  createSigner,
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  type Hex,
  type PaymentPreferences,
} from "anyspend-x402-fetch";

config();

const privateKey = process.env.PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = \`\${baseURL}\${endpointPath}\`;

/**
 * This example demonstrates payments with any token:
 * - Client pays with B3 token on Base
 * - Anyspend facilitator swaps B3 → USDC
 * - Resource server receives USDC on Base
 */
async function main(): Promise<void> {
  // Create signer for Base mainnet
  const signer = await createSigner("base", privateKey);

  // Specify payment preferences
  const paymentPreferences: PaymentPreferences = {
    preferredToken: "0xB3B32F9f8827D4634fE7d973Fa1034Ec9fdDB3B3",
    preferredNetwork: "base",
  };

  // Set max payment value (with buffer)
  const maxValue = BigInt("1000000000000000000000");

  // Wrap fetch with payment capability
  const fetchWithPayment = wrapFetchWithPayment(
    fetch,
    signer,
    maxValue,
    undefined, // Use default payment selector
    undefined, // Use default config
    paymentPreferences,
  );

  // Make the request - payment handled automatically
  const response = await fetchWithPayment(url, {
    method: "POST",
  });

  const data = await response.json();
  console.log("Premium data:", data);
}

main();`}</code>
            </pre>
            <div className="code-example-footer">
              <a
                href="https://www.npmjs.com/package/@b3dotfun/anyspend-x402"
                target="_blank"
                rel="noopener noreferrer"
                className="code-link"
              >
                📦 View on NPM
              </a>
              <a
                href="https://github.com/b3-fun/anyspend-x402"
                target="_blank"
                rel="noopener noreferrer"
                className="code-link"
              >
                🔗 View on GitHub
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <p>
            Powered by{" "}
            <a
              href="https://www.npmjs.com/package/@b3dotfun/anyspend-x402"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anyspend-x402
            </a>{" "}
            ⚡ Pay with any token, get instant access
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
            🔒 Your keys never leave your wallet • 🌐 Works on any chain • ✨
            Gas-efficient permits
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
