import { useEffect, useState } from "react";
import { publicActions } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { base } from "wagmi/chains";
import {
  decodeXPaymentResponse,
  MultiNetworkSigner,
  Signer,
  wrapFetchWithPayment,
} from "x402-fetch";
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
  marketAnalysis: {
    trend: string;
    confidence: number;
    timeframe: string;
    signals: string[];
  };
  predictions: {
    [key: string]: {
      price: string;
      change: string;
      timeframe: string;
    };
  };
  recommendations: Array<{
    action: string;
    asset: string;
    reason: string;
  }>;
  whaleActivity: {
    largeTransfers: number;
    netFlow: string;
    topWallets: Array<{
      address: string;
      balance: string;
      change: string;
    }>;
  };
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
  const [priceInfo, setPriceInfo] = useState<string>("Loading...");

  // Set default preset token when connected (default to B3)
  useEffect(() => {
    if (isConnected && selectedToken === "preset" && BASE_TOKENS.length > 0) {
      setSelectedToken(BASE_TOKENS[0].address); // B3 token
    }
  }, [isConnected, selectedToken]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `${timestamp}: ${message}`]);
  };

  const getTokenIcon = (address: string) => {
    const token = BASE_TOKENS.find(
      (t) => t.address.toLowerCase() === address.toLowerCase(),
    );
    if (!token) return { className: "custom", symbol: "?" };
    return {
      className: token.symbol.toLowerCase(),
      symbol: token.symbol.charAt(0),
    };
  };

  // Fetch price information from server
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
          setPriceInfo("1 USDC");
          return;
        }

        console.log("Fetching price for token:", tokenAddress);

        // Make a request to get payment requirements (402 response)
        const headers: HeadersInit = {};

        // Only add X-PREFERRED-TOKEN if it's not USDC (USDC is the default)
        const usdcAddress =
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
        if (tokenAddress.toLowerCase() !== usdcAddress) {
          headers["X-PREFERRED-TOKEN"] = tokenAddress;
          headers["X-PREFERRED-NETWORK"] = "base";
          console.log("Using preferred token:", tokenAddress);
        } else {
          console.log("Using default USDC (no preference header)");
        }

        const response = await fetch(`${API_BASE_URL}/api/premium`, {
          method: "POST",
          headers,
        });

        console.log("Price fetch response status:", response.status);

        // If 402, parse the payment requirements
        if (response.status === 402) {
          const data = await response.json();
          console.log("Payment requirements:", data);

          // Check for 'accepts' array (new format)
          const paymentReqs = data.accepts || data.paymentRequirements || [];

          if (paymentReqs.length > 0) {
            const req = paymentReqs[0];

            // Use srcAmountRequired if available, otherwise fall back to amount or maxAmountRequired
            const amountStr =
              req.srcAmountRequired || req.amount || req.maxAmountRequired;

            if (!amountStr) {
              console.log("No amount found in payment requirement");
              setPriceInfo("1 USDC");
              return;
            }

            const amount = BigInt(amountStr);

            // Get decimals from the source token
            let decimals = 18; // Default for most ERC-20 tokens

            // Try to get decimals from the token in our list
            const srcToken = BASE_TOKENS.find(
              (t) =>
                t.address.toLowerCase() ===
                (req.srcTokenAddress || req.asset || "").toLowerCase(),
            );

            if (srcToken) {
              decimals = srcToken.decimals;
            } else if (req.decimals) {
              decimals = req.decimals;
            }

            console.log("Amount:", amountStr, "Decimals:", decimals);

            // Convert to human-readable format with 6 decimal places
            const divisor = BigInt(10 ** decimals);
            const integerPart = amount / divisor;
            const fractionalPart = amount % divisor;

            // Format the price with 6 decimal places
            let priceStr = integerPart.toString();
            if (fractionalPart > 0) {
              const fracStr = fractionalPart.toString().padStart(decimals, "0");
              // Take first 6 decimals
              const displayDecimals = fracStr.slice(0, 6);
              priceStr += "." + displayDecimals;
            } else {
              // If no fractional part, still show .000000
              priceStr += ".000000";
            }

            // Get token symbol - prioritize source token
            let symbol = "tokens";

            // First try the source token address
            if (req.srcTokenAddress) {
              const sourceToken = BASE_TOKENS.find(
                (t) =>
                  t.address.toLowerCase() === req.srcTokenAddress.toLowerCase(),
              );
              if (sourceToken) {
                symbol = sourceToken.symbol;
              }
            }

            // Fall back to extra.name if available
            if (symbol === "tokens" && req.extra?.name) {
              symbol = req.extra.name;
            }

            // Fall back to requested token
            if (symbol === "tokens") {
              const requestedToken = BASE_TOKENS.find(
                (t) => t.address.toLowerCase() === tokenAddress.toLowerCase(),
              );
              if (requestedToken) {
                symbol = requestedToken.symbol;
              }
            }

            // Fall back to asset token
            if (symbol === "tokens" && req.asset) {
              const assetToken = BASE_TOKENS.find(
                (t) => t.address.toLowerCase() === req.asset.toLowerCase(),
              );
              if (assetToken) {
                symbol = assetToken.symbol;
              }
            }

            const priceText = `${priceStr} ${symbol}`;
            console.log("Setting price to:", priceText);
            setPriceInfo(priceText);
          } else {
            console.log("No payment requirements found");
            setPriceInfo("1 USDC");
          }
        } else {
          console.log("Non-402 response, using default");
          setPriceInfo("1 USDC");
        }
      } catch (err) {
        console.error("Failed to fetch price info:", err);
        setPriceInfo("1 USDC");
      }
    };

    if (isConnected && selectedToken && selectedToken !== "preset") {
      fetchPriceInfo();
    } else if (!isConnected || selectedToken === "preset") {
      // Set default when not connected or preset
      setPriceInfo("Loading...");
    }
  }, [isConnected, selectedToken, customTokenAddress]);

  const fetchPremiumData = async () => {
    if (!isConnected || !walletClient || !address) {
      setError("Please connect your wallet first");
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

    // Check if on correct network
    if (chain?.id !== base.id) {
      setError("Please switch to Base network");
      return;
    }

    setLoading(true);
    setLogs([]);
    setError(null);
    setPaymentInfo(null);
    setPremiumData(null);

    try {
      addLog(`🔐 Connected wallet: ${address}`);
      addLog(`💰 Payment token: ${tokenAddress}`);
      addLog(`🌐 Network: ${chain?.name}`);

      addLog("🔧 Setting up payment-enabled fetch...");
      // Extend wallet client with public actions to make it compatible with Signer type
      const extendedWalletClient = walletClient.extend(publicActions);

      // Only set payment preferences if not using default USDC
      const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const paymentPreferences =
        tokenAddress.toLowerCase() !== usdcAddress.toLowerCase()
          ? {
              // Payment preferences - tell server which token we want to pay with
              preferredToken: tokenAddress,
              preferredNetwork: "base" as const,
            }
          : undefined; // Use default (USDC) when undefined

      if (paymentPreferences) {
        addLog(`💡 Using preferred token: ${tokenAddress}`);
      } else {
        addLog(`💡 Using default token (USDC)`);
      }

      // Wrap fetch with automatic payment handling and payment preferences
      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        extendedWalletClient as Signer | MultiNetworkSigner,
        MAX_PAYMENT_VALUE, // Max 1 USDC
        undefined, // Use default payment requirements selector
        undefined, // Use default config
        paymentPreferences,
      );

      addLog(
        "📡 Making request to server (payment will be handled automatically)...",
      );

      // Make request - payment preferences are automatically added as headers
      try {
        const response = await fetchWithPayment(`${API_BASE_URL}/api/premium`, {
          method: "POST",
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
        const data = await response.json();
        addLog("🎉 Premium content received!");
        setPremiumData(data.data);
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
      addLog(`❌ Error: ${message}`);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <div className="card">
          <h1>✨ AnySpend</h1>
          <p className="subtitle">
            Pay-per-use API access with any token. Connect your wallet, choose
            your preferred payment token, and unlock premium content instantly.
            Powered by x402 payment protocol.
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="card">
          <h2>🔐 Your Wallet</h2>

          {!isConnected ? (
            <div>
              <p className="help-text">
                🚀 Connect your wallet to unlock premium features
              </p>
              <div className="connector-buttons">
                {connectors.map((connector) => (
                  <button
                    key={connector.id}
                    onClick={() => connect({ connector })}
                    className="button"
                  >
                    Connect {connector.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="wallet-info">
                <div className="detail">
                  <span className="label">Connected:</span>
                  <span className="value mono">{address}</span>
                </div>
                <div className="detail">
                  <span className="label">Network:</span>
                  <span className="value">{chain?.name}</span>
                </div>
              </div>

              {/* Network Switcher */}
              {chain?.id !== base.id && (
                <div className="network-warning">
                  <p>⚠️ Please switch to Base network</p>
                  <button
                    onClick={() => switchChain({ chainId: base.id })}
                    className="button"
                  >
                    Switch to Base
                  </button>
                </div>
              )}

              {/* Token Selection */}
              {chain?.id === base.id && (
                <>
                  <div className="input-group">
                    <label htmlFor="token">💰 Select Payment Token</label>
                    <div style={{ position: "relative" }}>
                      {selectedToken &&
                        selectedToken !== "preset" &&
                        selectedToken !== "custom" && (
                          <div
                            className={`token-icon ${getTokenIcon(selectedToken).className}`}
                            style={{
                              position: "absolute",
                              left: "0.75rem",
                              top: "50%",
                              transform: "translateY(-50%)",
                              zIndex: 1,
                              pointerEvents: "none",
                            }}
                          >
                            {getTokenIcon(selectedToken).symbol}
                          </div>
                        )}
                      <select
                        id="token"
                        value={selectedToken}
                        onChange={(e) => setSelectedToken(e.target.value)}
                        className="input token-select"
                      >
                        {BASE_TOKENS.map((token) => (
                          <option key={token.address} value={token.address}>
                            {token.symbol} - {token.name}
                          </option>
                        ))}
                        <option value="custom">🎨 Custom Token Address</option>
                      </select>
                    </div>
                    <p className="help-text">
                      Choose from popular tokens or use a custom ERC-20 address
                    </p>
                  </div>

                  {/* Price Display */}
                  {selectedToken && selectedToken !== "preset" && (
                    <div className="price-display">
                      <div className="price-label">Payment Amount</div>
                      <div className="price-value">
                        {priceInfo === "Loading..." ? (
                          <span className="loading">⏳ Fetching price...</span>
                        ) : (
                          <span>💰 {priceInfo}</span>
                        )}
                      </div>
                    </div>
                  )}

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
                      />
                      <p className="help-text">
                        Enter the ERC-20 token contract address on Base
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="button-group">
                <button
                  onClick={fetchPremiumData}
                  disabled={loading || !selectedToken}
                  className={`button ${loading ? "loading" : ""}`}
                >
                  {loading ? "⏳ Processing Payment..." : "🚀 Get Premium Data"}
                </button>
                <button
                  onClick={() => disconnect()}
                  className="button button-secondary"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>

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
              <h2>📊 Premium Market Analysis</h2>
              <span className="badge">✨ PAID</span>
            </div>

            {/* Market Analysis */}
            <div className="section">
              <h3>Market Analysis</h3>
              <div className="analysis-grid">
                <div className="stat">
                  <span className="stat-label">Trend</span>
                  <p className="stat-value trend">
                    {premiumData.marketAnalysis.trend}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">Confidence</span>
                  <p className="stat-value">
                    {(premiumData.marketAnalysis.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">Timeframe</span>
                  <p className="stat-value">
                    {premiumData.marketAnalysis.timeframe}
                  </p>
                </div>
              </div>
              <div className="signals">
                <span className="stat-label">Signals</span>
                <ul>
                  {premiumData.marketAnalysis.signals.map((signal, i) => (
                    <li key={i}>{signal}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Price Predictions */}
            <div className="section">
              <h3>Price Predictions</h3>
              <div className="predictions-grid">
                {Object.entries(premiumData.predictions).map(
                  ([symbol, pred]) => (
                    <div key={symbol} className="prediction-card">
                      <h4>{symbol.toUpperCase()}</h4>
                      <p className="price">{pred.price}</p>
                      <p className="change">{pred.change}</p>
                      <p className="timeframe">{pred.timeframe}</p>
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div className="section">
              <h3>Recommendations</h3>
              <div className="recommendations">
                {premiumData.recommendations.map((rec, i) => (
                  <div key={i} className="recommendation">
                    <div className="rec-header">
                      <span className="asset">{rec.asset}</span>
                      <span className={`action ${rec.action.toLowerCase()}`}>
                        {rec.action}
                      </span>
                    </div>
                    <p className="reason">{rec.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Whale Activity */}
            <div className="section">
              <h3>Whale Activity</h3>
              <div className="whale-stats">
                <div className="stat">
                  <span className="stat-label">Large Transfers (24h)</span>
                  <p className="stat-value">
                    {premiumData.whaleActivity.largeTransfers}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">Net Flow</span>
                  <p className="stat-value positive">
                    {premiumData.whaleActivity.netFlow}
                  </p>
                </div>
              </div>
              <div className="whale-wallets">
                <span className="stat-label">Top Wallets</span>
                {premiumData.whaleActivity.topWallets.map((wallet, i) => (
                  <div key={i} className="wallet">
                    <span className="wallet-address mono">
                      {wallet.address}
                    </span>
                    <div className="wallet-stats">
                      <span className="balance">{wallet.balance}</span>
                      <span
                        className={`change ${wallet.change.startsWith("+") ? "positive" : "negative"}`}
                      >
                        {wallet.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="timestamp">
              Generated at {new Date(premiumData.timestamp).toLocaleString()}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <p>
            Powered by{" "}
            <a
              href="https://x402.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              x402 Payment Protocol
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
