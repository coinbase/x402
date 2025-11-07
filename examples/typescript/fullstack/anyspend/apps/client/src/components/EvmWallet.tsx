import {
  decodeXPaymentResponse,
  MultiNetworkSigner,
  Signer,
  wrapFetchWithPayment,
} from "@b3dotfun/anyspend-x402-fetch";
import { TokenCompatClient } from "@b3dotfun/anyspend-x402-token-compat";
import { useEffect, useState } from "react";
import { publicActions } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { BASE_TOKENS } from "../wagmi.config";

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

interface EvmWalletProps {
  onDisconnect?: () => void;
}

export function EvmWallet({ onDisconnect }: EvmWalletProps) {
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
  const [_tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
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
  const [showWalletModal, setShowWalletModal] = useState(false);

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

      const chains = ["1", "8453", "137", "42161", "56"]; // Ethereum, Base, Polygon, Arbitrum, BSC

      try {
        const promises = chains.map(async (chainId) => {
          try {
            const url = `${API_BASE_URL}/api/balances/${address}?chain_id=${chainId}`;
            const response = await fetch(url);

            if (response.ok) {
              const data = await response.json();
              if (data.success && data.tokens && data.tokens.length > 0) {
                const hasTokens = data.tokens.some(
                  (token: any) => token.address.toLowerCase() !== "native",
                );
                if (hasTokens) {
                  return chainId;
                }
              }
            }
          } catch (err) {
            console.error(`Failed to fetch balances for chain ${chainId}:`, err);
          }
          return null;
        });

        const results = await Promise.all(promises);
        const validChains = results.filter((chain): chain is string => chain !== null);

        if (validChains.length === 0) {
          setAvailableChains(chains);
        } else {
          setAvailableChains(validChains);
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
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.tokens) {
            const balances: Record<string, string> = {};

            const basicFilteredTokens = data.tokens.filter((token: any) => {
              const address = token.address.toLowerCase();
              const symbol = token.symbol?.toUpperCase() || "";

              return (
                address !== "native" &&
                symbol !== "WETH" &&
                !symbol.includes("WETH")
              );
            });

            const compatibleTokens: any[] = [];
            const compatClient = new TokenCompatClient();
            const chainId = parseInt(selectedChain);

            for (const token of basicFilteredTokens) {
              try {
                const metadata = await compatClient.getTokenMetadata(chainId, token.address);
                const supportsPermit = metadata.supportsEip2612 === true;
                const supportsTransferWithAuth = metadata.supportsEip3009 === true;

                if (supportsPermit || supportsTransferWithAuth) {
                  compatibleTokens.push(token);
                }
              } catch (err) {
                // Skip tokens that error during compatibility check
              }
            }

            compatibleTokens.forEach((token: any) => {
              const tokenAddress = token.address.toLowerCase();
              balances[tokenAddress] = token.balance;
            });

            setTokenBalances(balances);
            setUserTokens(compatibleTokens);
          }
        }
      } catch (err) {
        console.error("Failed to fetch balances:", err);
      }
    };

    if (address) {
      fetchBalancesForAllChains();
      fetchBalances();
    }
  }, [address, selectedChain]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `${timestamp}: ${message}`]);
  };

  // Fetch price information
  useEffect(() => {
    const fetchPriceInfo = async () => {
      try {
        let tokenAddress = selectedToken;

        if (selectedToken === "custom") {
          tokenAddress = customTokenAddress;
        }

        if (!tokenAddress || tokenAddress === "preset" || !tokenAddress.startsWith("0x")) {
          setPriceInfo("Loading...");
          return;
        }

        setPriceInfo("Loading...");
        setSrcNetwork("base");

        const getNetworkName = (chainId: string): string => {
          const networkMap: Record<string, string> = {
            "1": "ethereum",
            "8453": "base",
            "84532": "base-sepolia",
            "137": "polygon",
            "80002": "polygon-amoy",
            "42161": "arbitrum",
            "10": "optimism",
            "56": "bsc",
            "43114": "avalanche",
            "43113": "avalanche-fuji",
            "2741": "abstract",
            "11124": "abstract-testnet",
            "8333": "b3",
            "4689": "iotex",
            "3338": "peaq",
            "1329": "sei",
            "1328": "sei-testnet",
          };
          return networkMap[chainId] || "base";
        };

        const headers: HeadersInit = {};
        headers["X-PREFERRED-TOKEN"] = tokenAddress;
        headers["X-PREFERRED-NETWORK"] = getNetworkName(selectedChain);

        const endpoint =
          dataType === "btc"
            ? `${API_BASE_URL}/api/btc`
            : `${API_BASE_URL}/api/b3/premium`;
        const response = await fetch(endpoint, { method: "POST", headers });

        if (response.status === 402) {
          const data = await response.json();
          const paymentReqs = data.accepts || data.paymentRequirements || [];

          if (paymentReqs.length > 0) {
            const req = paymentReqs[0];
            setSrcNetwork(req.srcNetwork || req.network || "base");

            const srcAmountStr = req.srcAmountRequired || req.amount || req.maxAmountRequired;

            if (srcAmountStr) {
              const srcAmount = BigInt(srcAmountStr);
              let srcDecimals = 18;
              let srcTokenAddr = req.srcTokenAddress || req.asset;

              const srcToken = BASE_TOKENS.find(
                (t) => t.address.toLowerCase() === (srcTokenAddr || "").toLowerCase(),
              );

              if (srcToken) {
                srcDecimals = srcToken.decimals;
              } else if (req.extra?.chainId && req.extra?.verifyingContract) {
                const tokenAddr = (req.srcTokenAddress || req.extra.verifyingContract || "").toLowerCase();
                const tokenName = (req.extra?.name || "").toLowerCase();

                if (
                  tokenAddr === "0xdac17f958d2ee523a2206206994597c13d831ec7" ||
                  tokenAddr === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" ||
                  tokenAddr === "0xaf88d065e77c8cc2239327c5edb3a432268e5831" ||
                  tokenAddr === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ||
                  tokenAddr === "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
                ) {
                  srcDecimals = 6;
                } else if (
                  tokenAddr === "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" ||
                  tokenAddr === "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
                ) {
                  srcDecimals = 8;
                } else if (tokenName.includes("wrapped btc") || tokenName.includes("wbtc") || tokenName.includes("btc")) {
                  srcDecimals = 8;
                } else if (tokenName.includes("usd coin") || tokenName.includes("usdc") || tokenName.includes("tether") || tokenName.includes("usdt")) {
                  srcDecimals = 6;
                }
              } else if (req.decimals) {
                srcDecimals = req.decimals;
              }

              const srcDivisor = BigInt(10 ** srcDecimals);
              const srcIntegerPart = srcAmount / srcDivisor;
              const srcFractionalPart = srcAmount % srcDivisor;

              let srcPriceStr = srcIntegerPart.toString();
              if (srcFractionalPart > 0) {
                const fracStr = srcFractionalPart.toString().padStart(srcDecimals, "0");
                const trimmed = fracStr.replace(/0+$/, "");
                if (trimmed.length > 0) {
                  srcPriceStr += "." + trimmed;
                }
              }

              let srcSymbol = "tokens";

              if (req.srcTokenAddress) {
                const sourceToken = BASE_TOKENS.find(
                  (t) => t.address.toLowerCase() === req.srcTokenAddress.toLowerCase(),
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
            setPriceInfo("Loading...");
          }
        } else {
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
    setShowPaymentModal(true);
  };

  const fetchData = async (type: "eth" | "btc") => {
    if (!isConnected || !walletClient || !address) {
      setError("Please connect your wallet first");
      setShowPaymentModal(false);
      return;
    }

    const tokenAddress = selectedToken === "custom" ? customTokenAddress : selectedToken;

    if (!tokenAddress || tokenAddress === "preset") {
      setError("Please select or enter a token address");
      return;
    }

    if (selectedToken === "custom" && !customTokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("Invalid token address format");
      return;
    }

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

      const extendedWalletClient = walletClient.extend(publicActions);

      const getNetworkName = (chainId: string): string => {
        const networkMap: Record<string, string> = {
          "1": "ethereum",
          "8453": "base",
          "84532": "base-sepolia",
          "137": "polygon",
          "80002": "polygon-amoy",
          "42161": "arbitrum",
          "10": "optimism",
          "56": "bsc",
          "43114": "avalanche",
          "43113": "avalanche-fuji",
          "2741": "abstract",
          "11124": "abstract-testnet",
          "8333": "b3",
          "4689": "iotex",
          "3338": "peaq",
          "1329": "sei",
          "1328": "sei-testnet",
        };
        return networkMap[chainId] || "base";
      };

      const paymentPreferences = {
        preferredToken: tokenAddress,
        preferredNetwork: getNetworkName(selectedChain) as any,
      };

      addLog(`💡 Using preferred token: ${tokenAddress} on ${getNetworkName(selectedChain)}`);

      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        extendedWalletClient as Signer | MultiNetworkSigner,
        MAX_PAYMENT_VALUE,
        undefined,
        undefined,
        paymentPreferences,
      );

      setPaymentStatus({
        stage: "signing",
        message: "Please sign the payment in your wallet...",
      });
      addLog("📡 Making request to server (payment will be handled automatically)...");

      try {
        setPaymentStatus({
          stage: "verifying",
          message: "Verifying payment signature...",
        });

        const endpoint =
          type === "btc" ? `${API_BASE_URL}/api/btc` : `${API_BASE_URL}/api/b3/premium`;
        const response = await fetchWithPayment(endpoint, { method: "POST" });

        setPaymentStatus({
          stage: "settling",
          message: "Settling payment on-chain...",
        });
        addLog(`✅ Server responded with status: ${response.status}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || errorData.error || "Request failed");
        }

        const paymentResponseHeader = response.headers.get("X-PAYMENT-RESPONSE");
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

        setPaymentStatus({
          stage: "complete",
          message: "Payment successful! Loading data...",
        });
        const data = await response.json();
        const dataLabel = type === "btc" ? "BTC" : "Premium";
        addLog(`🎉 ${dataLabel} content received!`);

        if (type === "btc") {
          setBtcData(data.data);
        } else {
          setPremiumData(data.data);
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "Unknown error";
        addLog(`❌ Error during payment: ${message}`);
        throw fetchError;
      }
    } catch (err) {
      let message = "Unknown error";

      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "object" && err !== null) {
        const errObj = err as any;
        if (errObj.shortMessage) message = errObj.shortMessage;
        else if (errObj.reason) message = errObj.reason;
        else if (errObj.message) message = errObj.message;
        else if (errObj.error?.message) message = errObj.error.message;
      } else {
        message = String(err);
      }

      if (message.includes("nonces") && (message.includes("reverted") || message.includes("returned no data"))) {
        const friendlyMessage =
          "This token doesn't support gasless signatures (EIP-2612 permit). Please select a different token like USDC or DAI.";
        addLog(`❌ Error: ${friendlyMessage}`);
        setError(friendlyMessage);
      } else if (message.includes("User rejected") || message.includes("User denied")) {
        addLog(`❌ Error: Signature request was rejected`);
        setError("Signature request was rejected by user");
      } else {
        addLog(`❌ Error: ${message}`);
        setError(message);
      }
    } finally {
      setLoading(false);
      setTimeout(() => {
        setPaymentStatus({ stage: "idle", message: "" });
      }, 2000);
    }
  };

  const fetchPremiumData = () => fetchData("eth");
  const fetchBtcData = () => fetchData("btc");

  const handleDisconnect = () => {
    disconnect();
    if (onDisconnect) {
      onDisconnect();
    }
  };

  return (
    <>
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
              <p className="subtitle">Premium ETH price data - Pay with any token</p>
            </div>
          </div>
          <div className="wallet-section">
            {!isConnected ? (
              <div className="connector-buttons-header">
                <button
                  onClick={() => setShowWalletModal(true)}
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
                <button onClick={handleDisconnect} className="button button-small button-secondary">
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Action Cards */}
      <div className="card action-card">
        <div className="action-content">
          <div className="action-text">
            <h2>📈 ETH Price History</h2>
            <p className="subtitle">Get 24-hour ETH price history with OHLC data from CoinGecko</p>
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
            <p className="subtitle">Get 24-hour BTC price history with OHLC data - Only 0.01 USDC!</p>
          </div>
          <button
            onClick={() => {
              setDataType("btc");
              openPaymentModal();
            }}
            disabled={loading}
            className="button button-large"
          >
            ₿ Get BTC Data
          </button>
        </div>
      </div>

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="modal-overlay" onClick={() => setShowWalletModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔗 Select Wallet</h2>
              <button className="modal-close" onClick={() => setShowWalletModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Choose your wallet to connect</label>
                <div className="token-grid">
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      type="button"
                      className="token-option"
                      onClick={() => {
                        connect({ connector });
                        setShowWalletModal(false);
                      }}
                    >
                      <div className="token-info">
                        <div className="token-symbol">{connector.name}</div>
                        <div className="token-name">
                          {connector.id === "binance"
                            ? "Binance Chain Wallet"
                            : connector.id === "bnbSmartWallet"
                              ? "BNB Smart Wallet"
                              : connector.id === "metaMask"
                                ? "MetaMask Browser Extension"
                                : connector.id === "coinbaseWalletSDK"
                                  ? "Coinbase Wallet"
                                  : connector.id === "walletConnect"
                                    ? "WalletConnect"
                                    : "Browser Wallet"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
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
                      <div className="price-network-small">on {srcNetwork}</div>
                    </div>
                    <div className="swap-arrow">→</div>
                    <div className="price-item">
                      <div className="price-label">Data Price</div>
                      <div className="price-value">
                        <span>{dataType === "btc" ? "0.01 USDC" : "100 B3"}</span>
                      </div>
                      <div className="price-network-small">on base</div>
                    </div>
                  </div>
                </div>
              )}

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
                    {availableChains.includes("56") && (
                      <button
                        type="button"
                        className={`chain-option ${selectedChain === "56" ? "selected" : ""}`}
                        onClick={() => setSelectedChain("56")}
                        disabled={loading}
                      >
                        <span className="chain-name">BSC</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="chain-selector">
                    <div className="no-tokens">Loading chains...</div>
                  </div>
                )}
              </div>

              <div className="input-group">
                <label>
                  💰 Select Payment Token
                  {userTokens.length > 0 && (
                    <span style={{ fontWeight: "normal", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
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
                        {selectedToken === token.address && <div className="token-check">✓</div>}
                      </button>
                    ))
                  ) : (
                    <div className="no-tokens">
                      No tokens found. Connect your wallet or select a different chain.
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
                    {selectedToken === "custom" && <div className="token-check">✓</div>}
                  </button>
                </div>
              </div>

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
                  <p className="help-text">Enter the ERC-20 token contract address on Base</p>
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
                onClick={() => (dataType === "btc" ? fetchBtcData() : fetchPremiumData())}
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

      {/* Loading Modal */}
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

      {/* Results Section */}
      <div className="results-section">
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

        {error && (
          <div className="card error-card">
            <h3>Error</h3>
            <p>{error}</p>
          </div>
        )}

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

        {premiumData && (
          <div className="card content-card">
            <div className="content-header">
              <h2>
                📈 {premiumData.name} ({premiumData.symbol}) Price History
              </h2>
              <span className="badge">✨ PAID</span>
            </div>

            <div className="section">
              <h3>💰 Current Price</h3>
              <div className="analysis-grid">
                <div className="stat">
                  <span className="stat-label">Price</span>
                  <p className="stat-value">${premiumData.currentPrice.toLocaleString()}</p>
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
                  <p className="stat-value">${premiumData.high24h.toLocaleString()}</p>
                </div>
                <div className="stat">
                  <span className="stat-label">24h Low</span>
                  <p className="stat-value">${premiumData.low24h.toLocaleString()}</p>
                </div>
                <div className="stat">
                  <span className="stat-label">Data Points</span>
                  <p className="stat-value">{premiumData.dataPoints}</p>
                </div>
              </div>
            </div>

            <div className="section">
              <h3>📊 Recent Price History (Last 10 data points)</h3>
              <div className="price-history-table">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-primary)" }}>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>Time</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Open</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>High</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Low</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premiumData.priceHistory
                      .slice(-10)
                      .reverse()
                      .map((item, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem" }}>
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
              Data fetched at {new Date(premiumData.timestamp).toLocaleString()}
            </div>
          </div>
        )}

        {btcData && (
          <div className="card content-card">
            <div className="content-header">
              <h2>
                ₿ {btcData.name} ({btcData.symbol}) Price History
              </h2>
              <span className="badge">✨ PAID</span>
            </div>

            <div className="section">
              <h3>💰 Current Price</h3>
              <div className="analysis-grid">
                <div className="stat">
                  <span className="stat-label">Price</span>
                  <p className="stat-value">${btcData.currentPrice.toLocaleString()}</p>
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
                  <p className="stat-value">${btcData.high24h.toLocaleString()}</p>
                </div>
                <div className="stat">
                  <span className="stat-label">24h Low</span>
                  <p className="stat-value">${btcData.low24h.toLocaleString()}</p>
                </div>
                <div className="stat">
                  <span className="stat-label">Data Points</span>
                  <p className="stat-value">{btcData.dataPoints}</p>
                </div>
              </div>
            </div>

            <div className="section">
              <h3>📊 Recent Price History (Last 10 data points)</h3>
              <div className="price-history-table">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-primary)" }}>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>Time</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Open</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>High</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Low</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {btcData.priceHistory
                      .slice(-10)
                      .reverse()
                      .map((item, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem" }}>
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
    </>
  );
}
