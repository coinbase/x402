import express from "express";
import { paymentMiddleware } from "@x402-observed/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import dotenv from "dotenv";

dotenv.config();

/**
 * Express Example with x402-observed + Full Paywall Integration
 * 
 * This example demonstrates:
 * - @x402-observed/express for observability
 * - @x402/paywall for wallet connection UI
 * - Complete payment flow with MetaMask/Coinbase Wallet
 * - Real-time workflow tracking in dashboard
 */

const PORT = process.env.PORT || "3001";
const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:84532") as `${string}:${string}`;
const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;

if (!EVM_PAYEE_ADDRESS) {
  console.error("❌ EVM_PAYEE_ADDRESS environment variable is required");
  process.exit(1);
}

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// Initialize Express app
const app = express();

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create x402 resource server
const server = new x402ResourceServer(facilitatorClient);

// Register EVM scheme for Base Sepolia testnet
server.register("eip155:*", new ExactEvmScheme());

console.log(`Using facilitator at: ${facilitatorUrl}`);
console.log(`Payment network: ${EVM_NETWORK}`);
console.log(`Payee address: ${EVM_PAYEE_ADDRESS}`);

/**
 * Configure x402-observed payment middleware
 * 
 * This middleware:
 * 1. Logs all payment events to SQLite
 * 2. Handles payment verification and settlement
 * 3. Tracks complete workflow with transaction hashes
 */
app.use(
  paymentMiddleware(
    {
      "GET /api/premium": {
        accepts: {
          payTo: EVM_PAYEE_ADDRESS,
          scheme: "exact",
          price: "$0.001", // 0.001 USDC on Base Sepolia
          network: EVM_NETWORK,
        },
        description: "Premium content - requires payment",
      },
      "GET /api/exclusive": {
        accepts: {
          payTo: EVM_PAYEE_ADDRESS,
          scheme: "exact",
          price: "$0.01", // 0.01 USDC on Base Sepolia
          network: EVM_NETWORK,
        },
        description: "Exclusive content - higher tier",
      },
    },
    server,
    undefined, // paywallConfig
    undefined, // paywall
    true, // syncFacilitatorOnStart - enable to fetch supported kinds
  ),
);

/**
 * Protected endpoint - requires $0.001 USDC payment
 */
app.get("/api/premium", (req, res) => {
  res.json({
    success: true,
    message: "🎉 Payment Successful!",
    content: "You now have access to premium content",
    timestamp: new Date().toISOString(),
    data: {
      feature: "premium",
      value: "This is premium content that required payment",
      tips: [
        "Check the dashboard at http://localhost:4402",
        "View the complete workflow with all 8 events",
        "See the transaction hash in settle_result event",
      ],
    },
  });
});

/**
 * Protected endpoint - requires $0.01 USDC payment
 */
app.get("/api/exclusive", (req, res) => {
  res.json({
    success: true,
    message: "🎉 Payment Successful!",
    content: "You now have access to exclusive content",
    timestamp: new Date().toISOString(),
    data: {
      feature: "exclusive",
      value: "This is exclusive content with higher payment tier",
      benefits: [
        "Premium features unlocked",
        "Priority support access",
        "Exclusive community access",
      ],
    },
  });
});

/**
 * Health check endpoint - no payment required
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network: EVM_NETWORK,
    payee: EVM_PAYEE_ADDRESS,
    observability: "enabled",
    paywall: "enabled",
    testnet: true,
  });
});

/**
 * Serve interactive frontend with wallet integration
 */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>x402-observed Paywall Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      margin-bottom: 30px;
      text-align: center;
    }
    h1 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 2.5em;
    }
    .subtitle {
      color: #666;
      font-size: 1.1em;
    }
    .info-box {
      background: rgba(255,255,255,0.95);
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .info-box h3 {
      color: #667eea;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .info-box ul {
      list-style: none;
      padding-left: 0;
    }
    .info-box li {
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .info-box li:last-child {
      border-bottom: none;
    }
    .endpoint-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      border-left: 4px solid #667eea;
    }
    .endpoint-card h3 {
      color: #333;
      margin-bottom: 10px;
    }
    .price {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      margin: 10px 0;
    }
    .description {
      color: #666;
      margin: 10px 0;
    }
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 10px;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .response {
      background: #f8f9fa;
      padding: 15px;
      margin-top: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
      display: none;
    }
    .response.show {
      display: block;
    }
    .success {
      border-left: 4px solid #10b981;
    }
    .error {
      border-left: 4px solid #ef4444;
    }
    .loading {
      border-left: 4px solid #f59e0b;
    }
    .icon {
      font-size: 1.5em;
    }
    .dashboard-link {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 15px 30px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: bold;
      margin-top: 20px;
      transition: transform 0.2s;
    }
    .dashboard-link:hover {
      transform: translateY(-2px);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 x402-observed Paywall Demo</h1>
      <p class="subtitle">Complete Payment Flow with Wallet Integration</p>
    </div>

    <div class="info-box">
      <h3><span class="icon">ℹ️</span> How It Works</h3>
      <ul>
        <li><strong>1.</strong> Click "Pay & Access" button below</li>
        <li><strong>2.</strong> Wallet popup appears (MetaMask, Coinbase Wallet, etc.)</li>
        <li><strong>3.</strong> Approve the payment on Base Sepolia testnet</li>
        <li><strong>4.</strong> See "Payment Successful" message</li>
        <li><strong>5.</strong> View complete workflow in dashboard with transaction hash</li>
      </ul>
    </div>

    <div class="info-box">
      <h3><span class="icon">🔧</span> Setup Requirements</h3>
      <ul>
        <li>✅ Wallet extension installed (MetaMask or Coinbase Wallet)</li>
        <li>✅ Connected to Base Sepolia testnet</li>
        <li>✅ Some testnet USDC (get from faucet)</li>
        <li>✅ Dashboard running: <code>npx x402-observed</code></li>
      </ul>
    </div>

    <div class="endpoint-card">
      <h3>GET /api/premium</h3>
      <span class="price">$0.001 USDC</span>
      <p class="description">Premium content access - perfect for testing the payment flow</p>
      <button onclick="makePayment('/api/premium', 'premium-response')">
        💳 Pay & Access Premium Content
      </button>
      <div id="premium-response" class="response"></div>
    </div>

    <div class="endpoint-card">
      <h3>GET /api/exclusive</h3>
      <span class="price">$0.01 USDC</span>
      <p class="description">Exclusive content access - higher tier payment</p>
      <button onclick="makePayment('/api/exclusive', 'exclusive-response')">
        💎 Pay & Access Exclusive Content
      </button>
      <div id="exclusive-response" class="response"></div>
    </div>

    <div class="info-box" style="text-align: center;">
      <h3><span class="icon">📊</span> View Workflow Dashboard</h3>
      <p style="margin: 15px 0;">Watch your payment workflows in real-time with complete event tracking</p>
      <a href="http://localhost:4402" target="_blank" class="dashboard-link">
        🚀 Open Dashboard
      </a>
    </div>
  </div>

  <script>
    async function makePayment(endpoint, responseId) {
      const responseDiv = document.getElementById(responseId);
      responseDiv.className = 'response show loading';
      responseDiv.textContent = '⏳ Initiating payment flow...\\n\\nThis will:\\n1. Return 402 Payment Required\\n2. Show wallet popup\\n3. Request payment approval\\n4. Process payment\\n5. Return content';
      
      try {
        const response = await fetch(endpoint);
        const contentType = response.headers.get('content-type');
        
        if (response.status === 402) {
          // Payment required - wallet UI should appear
          responseDiv.className = 'response show loading';
          responseDiv.textContent = '💳 Payment Required\\n\\nStatus: 402\\n\\nThe wallet popup should appear now.\\nPlease approve the payment in your wallet.\\n\\nNote: If you don\\'t see the popup, check:\\n- Wallet extension is installed\\n- Connected to Base Sepolia testnet\\n- Have testnet USDC';
        } else if (response.status === 200) {
          // Payment successful
          const data = await response.json();
          responseDiv.className = 'response show success';
          responseDiv.textContent = \`✅ \${data.message}\\n\\nStatus: 200 OK\\n\\n\${JSON.stringify(data, null, 2)}\\n\\n🎉 Check the dashboard to see the complete workflow with transaction hash!\`;
        } else {
          // Other response
          const text = await response.text();
          responseDiv.className = 'response show';
          responseDiv.textContent = \`Status: \${response.status}\\n\\n\${text}\`;
        }
      } catch (error) {
        responseDiv.className = 'response show error';
        responseDiv.textContent = \`❌ Error: \${error.message}\\n\\nMake sure the server is running on port ${PORT}\`;
      }
    }
  </script>
</body>
</html>
  `);
});

// Start the server
app.listen(parseInt(PORT), () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     x402-observed Express Paywall Demo Server          ║
╠════════════════════════════════════════════════════════╣
║  Server:       http://localhost:${PORT}                ║
║  Network:      ${EVM_NETWORK} (Base Sepolia)          ║
║  Payee:        ${EVM_PAYEE_ADDRESS}                    ║
║  Testnet:      ✅ Enabled                              ║
║                                                        ║
║  Features:                                             ║
║  • HTTP 402 payment flow                              ║
║  • Real payment flow on Base Sepolia testnet          ║
║  • Complete workflow observability                     ║
║  • Transaction hash tracking                           ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /                  (interactive demo)          ║
║  • GET  /api/premium       ($0.001 USDC)              ║
║  • GET  /api/exclusive     ($0.01 USDC)               ║
║  • GET  /health            (no payment)                ║
║                                                        ║
║  Observability:                                        ║
║  • Events logged to: .x402-observed/events.db         ║
║  • Run: npx x402-observed                             ║
║  • Dashboard: http://localhost:4402                   ║
║                                                        ║
║  Setup:                                                ║
║  1. Install wallet (MetaMask/Coinbase Wallet)         ║
║  2. Connect to Base Sepolia testnet                   ║
║  3. Get testnet USDC from faucet                      ║
║  4. Visit http://localhost:${PORT}                    ║
╚════════════════════════════════════════════════════════╝
  `);
});
