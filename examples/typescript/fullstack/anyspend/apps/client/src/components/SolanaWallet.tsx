/**
 * Solana Wallet Component - X402 Payment Integration
 *
 * Demonstrates how to integrate Solana payments with the x402 protocol using browser wallet adapters.
 *
 * Key features:
 * - Connects to Solana wallets (Phantom) via @solana/wallet-adapter-react
 * - Uses createWalletAdapterSigner() to bridge wallet adapter with x402 library
 * - Handles payment flow: sign → verify → settle
 * - Displays payment confirmation and transaction links
 *
 * @see https://docs.anyspend.com/x402 for protocol documentation
 * @see @b3dotfun/anyspend-x402-solana-wallet-adapter for the wallet adapter bridge
 */

import {
  decodeXPaymentResponse,
  wrapFetchWithPayment,
} from "@b3dotfun/anyspend-x402-fetch";
import {
  createWalletAdapterSigner,
  useWallet,
  WalletMultiButton,
} from "@b3dotfun/anyspend-x402-solana-wallet-adapter";
import { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const SOLANA_RPC_URL = "https://solana-rpc.publicnode.com";

interface SolanaWalletProps {
  onDisconnect?: () => void;
}

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

export function SolanaWallet({ onDisconnect }: SolanaWalletProps) {
  const {
    publicKey: solanaPublicKey,
    connected: solanaConnected,
    disconnect: solanaDisconnect,
    signAllTransactions,
  } = useWallet();

  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [premiumData, setPremiumData] = useState<PremiumData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<{
    stage: "idle" | "signing" | "verifying" | "settling" | "complete";
    message: string;
  }>({ stage: "idle", message: "" });

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `${timestamp}: ${message}`]);
  };

  const handleDisconnect = async () => {
    await solanaDisconnect();
    if (onDisconnect) {
      onDisconnect();
    }
  };

  /**
   * Fetches premium data using x402 payment protocol
   *
   * Payment flow:
   * 1. Create a TransactionSigner adapter for the wallet
   * 2. Wrap fetch with payment capability
   * 3. Make request - library handles 402 response and payment automatically
   * 4. Decode payment response header
   * 5. Display premium data
   */
  const fetchPremiumData = async () => {
    if (!solanaConnected || !solanaPublicKey || !signAllTransactions) {
      setError("Please connect your wallet first");
      return;
    }

    setLoading(true);
    setLogs([]);
    setError(null);
    setPaymentInfo(null);
    setPremiumData(null);
    setPaymentStatus({ stage: "idle", message: "" });

    try {
      addLog(`🔐 Connected wallet: ${solanaPublicKey.toBase58()}`);
      addLog(`🌐 Network: Solana Mainnet`);
      addLog(`💰 Payment: 0.01 USDC`);

      setPaymentStatus({
        stage: "signing",
        message: "Preparing payment signature...",
      });
      addLog("🔧 Setting up payment-enabled fetch...");

      // Create a TransactionSigner adapter for the wallet
      const solanaSigner = createWalletAdapterSigner(
        solanaPublicKey.toBase58(),
        signAllTransactions!,
        (count) => addLog(`Signing ${count} transaction(s)...`),
      );

      // Wrap fetch with payment capability
      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        solanaSigner,
        undefined, // Let server determine max amount
        undefined, // Use default payment selector
        { svmConfig: { rpcUrl: SOLANA_RPC_URL } },
      );

      setPaymentStatus({
        stage: "signing",
        message: "Please sign the payment in your wallet...",
      });
      addLog(
        "📡 Making request to server (payment will be handled automatically)...",
      );

      try {
        setPaymentStatus({
          stage: "verifying",
          message: "Verifying payment signature...",
        });

        // Make the payment request - fetchWithPayment handles 402 response automatically
        const endpoint = `${API_BASE_URL}/api/solana/premium`;
        const response = await fetchWithPayment(endpoint, { method: "POST" });

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

        // Decode payment confirmation from response header
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

        setPaymentStatus({
          stage: "complete",
          message: "Payment successful! Loading data...",
        });
        const data = await response.json();
        addLog(`🎉 Premium content received!`);

        setPremiumData(data.data);
      } catch (fetchError) {
        const message =
          fetchError instanceof Error ? fetchError.message : "Unknown error";
        addLog(`❌ Error during payment: ${message}`);
        throw fetchError;
      }
    } catch (err) {
      let message = "Unknown error";

      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "object" && err !== null) {
        const errObj = err as Record<string, unknown>;
        if (typeof errObj.shortMessage === "string")
          message = errObj.shortMessage;
        else if (typeof errObj.reason === "string") message = errObj.reason;
        else if (typeof errObj.message === "string") message = errObj.message;
        else if (
          typeof errObj.error === "object" &&
          errObj.error !== null &&
          typeof (errObj.error as Record<string, unknown>).message === "string"
        )
          message = (errObj.error as Record<string, unknown>).message as string;
      } else {
        message = String(err);
      }

      if (
        message.includes("User rejected") ||
        message.includes("User denied")
      ) {
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
              <p className="subtitle">SOL Price History - Pay with USDC</p>
            </div>
          </div>
          <div className="wallet-section">
            {!solanaConnected ? (
              <div className="connector-buttons-header">
                <WalletMultiButton className="button button-small solana-wallet-btn" />
              </div>
            ) : (
              <div className="wallet-header-info">
                <span className="status-badge">
                  ✅ {solanaPublicKey?.toBase58().slice(0, 4)}...
                  {solanaPublicKey?.toBase58().slice(-4)}
                </span>
                <button
                  onClick={handleDisconnect}
                  className="button button-small button-secondary"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Action Card */}
      <div className="card action-card">
        <div className="action-content">
          <div className="action-text">
            <h2>◎ SOL Price History</h2>
            <p className="subtitle">
              Get 24-hour OHLCV data - Pay 0.01 USDC on Solana
            </p>
          </div>
          <button
            onClick={fetchPremiumData}
            disabled={!solanaConnected || loading}
            className="button button-large"
          >
            {loading ? "⏳ Processing..." : "◎ Get Premium Data"}
          </button>
        </div>
      </div>

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
                      href={`https://explorer.solana.com/tx/${paymentInfo.transaction}`}
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
                  <div className="detail">
                    <span className="label">View on Solscan:</span>
                    <a
                      href={`https://solscan.io/tx/${paymentInfo.transaction}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="value link"
                    >
                      View Transaction
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {premiumData && premiumData.currentPrice !== undefined && (
          <div className="card content-card">
            <div className="content-header">
              <h2>◎ {premiumData.name} Price Data</h2>
              <span className="badge">✨ PAID</span>
            </div>

            <div className="section">
              <h3>📊 24-Hour Price Analysis</h3>
              <div className="analysis-grid">
                <div className="stat">
                  <span className="stat-label">Current Price</span>
                  <p className="stat-value">
                    ${premiumData.currentPrice?.toFixed(2) ?? "N/A"}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">24h Change</span>
                  <p
                    className={`stat-value ${parseFloat(premiumData.priceChangePercent || "0") >= 0 ? "positive" : "negative"}`}
                  >
                    {parseFloat(premiumData.priceChangePercent || "0") >= 0
                      ? "▲"
                      : "▼"}{" "}
                    {premiumData.priceChangePercent}%
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">24h High</span>
                  <p className="stat-value">
                    ${premiumData.high24h?.toFixed(2) ?? "N/A"}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">24h Low</span>
                  <p className="stat-value">
                    ${premiumData.low24h?.toFixed(2) ?? "N/A"}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">Price Range</span>
                  <p className="stat-value">
                    $
                    {(
                      (premiumData.high24h ?? 0) - (premiumData.low24h ?? 0)
                    ).toFixed(2)}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-label">Data Points</span>
                  <p className="stat-value">
                    {premiumData.dataPoints ?? "N/A"} OHLC bars
                  </p>
                </div>
              </div>
            </div>

            {premiumData.priceHistory &&
              premiumData.priceHistory.length > 0 && (
                <div className="section">
                  <h3>📈 Recent OHLC Data (Last 5 Periods)</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.9rem",
                        marginTop: "1rem",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          <th style={{ padding: "0.5rem", textAlign: "left" }}>
                            Time
                          </th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>
                            Open
                          </th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>
                            High
                          </th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>
                            Low
                          </th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>
                            Close
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {premiumData.priceHistory
                          .slice(-5)
                          .reverse()
                          .map((bar, idx) => (
                            <tr
                              key={idx}
                              style={{
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              <td style={{ padding: "0.5rem" }}>
                                {new Date(bar.timestamp).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem",
                                  textAlign: "right",
                                }}
                              >
                                ${bar.open.toFixed(2)}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem",
                                  textAlign: "right",
                                  color: "#4ade80",
                                }}
                              >
                                ${bar.high.toFixed(2)}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem",
                                  textAlign: "right",
                                  color: "#f87171",
                                }}
                              >
                                ${bar.low.toFixed(2)}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem",
                                  textAlign: "right",
                                  fontWeight: 600,
                                }}
                              >
                                ${bar.close.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            <div className="timestamp">
              Data fetched at {new Date(premiumData.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
