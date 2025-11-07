import { useState } from "react";
import "./App.css";
import { EvmWallet } from "./components/EvmWallet";
import { SolanaWallet } from "./components/SolanaWallet";

function App() {
  const [networkType, setNetworkType] = useState<"ETH" | "SOL" | null>(null);
  const [showNetworkSelector, setShowNetworkSelector] = useState(true);
  const [showCodeExample, setShowCodeExample] = useState(false);

  const handleNetworkChange = () => {
    setNetworkType(null);
    setShowNetworkSelector(true);
  };

  return (
    <div className={`app ${networkType === "SOL" ? "theme-solana" : ""}`}>
      <div className="container">
        {/* Network Selection Modal */}
        {showNetworkSelector && !networkType && (
          <div className="modal-overlay">
            <div className="modal network-selector-modal">
              <div className="modal-header">
                <h2>🌐 Select Network</h2>
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", opacity: 0.8 }}>
                  Choose which blockchain network to use for this demo
                </p>
              </div>
              <div className="modal-body">
                <div className="network-selection-grid">
                  <button
                    className="network-selection-card"
                    onClick={() => {
                      setNetworkType("ETH");
                      setShowNetworkSelector(false);
                    }}
                  >
                    <div className="network-icon">
                      <img
                        src="https://cdn.b3.fun/ethereum.svg"
                        alt="Ethereum"
                        style={{ width: "80px", height: "80px" }}
                      />
                    </div>
                    <h3>EVM Chains</h3>
                    <p className="network-description">
                      Use Ethereum, Base, Polygon, Arbitrum, BSC and other EVM-compatible chains
                    </p>
                    <div className="network-features">
                      <span className="feature-tag">🔗 Multi-chain</span>
                      <span className="feature-tag">💰 Any ERC-20 token</span>
                    </div>
                  </button>

                  <button
                    className="network-selection-card"
                    onClick={() => {
                      setNetworkType("SOL");
                      setShowNetworkSelector(false);
                    }}
                  >
                    <div className="network-icon">
                      <img
                        src="https://cdn.b3.fun/solana-logo.png"
                        alt="Solana"
                        style={{ width: "80px", height: "80px" }}
                      />
                    </div>
                    <h3>Solana</h3>
                    <p className="network-description">
                      Use Solana mainnet with USDC payments
                    </p>
                    <div className="network-features">
                      <span className="feature-tag">⚡ Fast & Cheap</span>
                      <span className="feature-tag">💵 USDC payments</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Demo Banner */}
        {networkType && (
          <div className="demo-banner">
            <div className="demo-banner-content">
              <span className="demo-badge">DEMO</span>
              <p className="demo-text">
                This is a demo application showcasing <strong>x402</strong> - Pay
                with any token for HTTP APIs
                {networkType && (
                  <span style={{ marginLeft: "0.5rem" }}>
                    • Using <strong>{networkType === "ETH" ? "EVM Chains" : "Solana"}</strong>
                  </span>
                )}
              </p>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <button
                  onClick={handleNetworkChange}
                  className="demo-link change-network-btn"
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    Change Network
                  </span>
                </button>
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
          </div>
        )}

        {/* Render appropriate wallet component */}
        {networkType === "ETH" && <EvmWallet onDisconnect={handleNetworkChange} />}
        {networkType === "SOL" && <SolanaWallet onDisconnect={handleNetworkChange} />}

        {/* Code Example Section - Only show for EVM chains */}
        {networkType === "ETH" && (
          <div className="code-example-section">
            <div className="code-example-header">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>💻 How to Pay with Any Token</h2>
                <button
                  onClick={() => setShowCodeExample(!showCodeExample)}
                  className="button button-small button-secondary"
                  style={{ minWidth: "auto" }}
                >
                  {showCodeExample ? "Hide Code ▲" : "Show Code ▼"}
                </button>
              </div>
              <p className="code-example-description">
                Use the x402-fetch library to enable payments with any token in
                your application. This example shows how to pay with B3 token on
                Base, which gets automatically swapped to USDC.
              </p>
            </div>

            {showCodeExample && (
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
            )}
          </div>
        )}

        {/* Footer */}
        {networkType && (
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
              {networkType === "ETH"
                ? "⚡ Pay with any token, get instant access"
                : "⚡ Pay with USDC on Solana, get instant access"}
            </p>
            <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
              {networkType === "ETH"
                ? "🔒 Your keys never leave your wallet • 🌐 Works on any chain • ✨ Gas-efficient permits"
                : "🔒 Your keys never leave your wallet • ◎ Native Solana integration • ⚡ Fast & cheap transactions"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
