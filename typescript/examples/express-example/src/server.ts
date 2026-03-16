import express from "express";
import { paymentMiddleware } from "@x402-observed/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Express Example with x402-observed
 * 
 * This example demonstrates how to use @x402-observed/express
 * to add observability to your x402 payment workflows.
 * 
 * Simply change the import from @x402/express to @x402-observed/express
 * and all payment events will be logged to .x402-observed/events.db
 */

const PORT = process.env.PORT || "3000";
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

// Register EVM scheme
server.register("eip155:*", new ExactEvmScheme());

console.log(`Using facilitator at: ${facilitatorUrl}`);
console.log(`Payment network: ${EVM_NETWORK}`);
console.log(`Payee address: ${EVM_PAYEE_ADDRESS}`);

/**
 * Configure x402-observed payment middleware
 * 
 * This is identical to @x402/express paymentMiddleware,
 * but automatically logs all payment events to SQLite
 */
app.use(
  paymentMiddleware(
    {
      "GET /api/premium": {
        accepts: {
          payTo: EVM_PAYEE_ADDRESS,
          scheme: "exact",
          price: "$0.001",
          network: EVM_NETWORK,
        },
        description: "Premium API endpoint",
      },
      "GET /api/data": {
        accepts: {
          payTo: EVM_PAYEE_ADDRESS,
          scheme: "exact",
          price: "$0.005",
          network: EVM_NETWORK,
        },
        description: "Data API endpoint",
      },
    },
    server,
  ),
);

/**
 * Protected endpoint - requires $0.001 USDC payment
 */
app.get("/api/premium", (req, res) => {
  res.json({
    message: "Premium content accessed successfully",
    timestamp: new Date().toISOString(),
    data: {
      feature: "premium",
      value: "This is premium content",
    },
  });
});

/**
 * Protected endpoint - requires $0.005 USDC payment
 */
app.get("/api/data", (req, res) => {
  res.json({
    message: "Data endpoint accessed successfully",
    timestamp: new Date().toISOString(),
    data: {
      items: [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
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
  });
});

/**
 * Serve simple HTML frontend
 */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>x402-observed Express Example</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #1c1c1e;
      color: #fff;
    }
    h1 { color: #d4a855; }
    .endpoint {
      background: #2c2c2e;
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
      border-left: 4px solid #d4a855;
    }
    button {
      background: #d4a855;
      color: #1c1c1e;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      margin-right: 10px;
    }
    button:hover { background: #e5b966; }
    .response {
      background: #1c1c1e;
      padding: 15px;
      margin-top: 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }
    .info {
      background: #2c2c2e;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    code {
      background: #1c1c1e;
      padding: 2px 6px;
      border-radius: 3px;
      color: #d4a855;
    }
  </style>
</head>
<body>
  <h1>🔍 x402-observed Express Example</h1>
  
  <div class="info">
    <h3>Observability Enabled</h3>
    <p>This server uses <code>@x402-observed/express</code> to automatically log all payment workflow events.</p>
    <p><strong>To view the dashboard:</strong></p>
    <ol>
      <li>Run <code>npx x402-observed</code> in this directory</li>
      <li>Open <a href="http://localhost:4402" target="_blank">http://localhost:4402</a></li>
      <li>Make requests to the endpoints below</li>
      <li>Watch workflows appear in real-time!</li>
    </ol>
  </div>

  <div class="endpoint">
    <h3>GET /api/premium</h3>
    <p>Price: $0.001 USDC</p>
    <button onclick="testEndpoint('/api/premium', 'premium-response')">Test Endpoint</button>
    <div id="premium-response" class="response"></div>
  </div>

  <div class="endpoint">
    <h3>GET /api/data</h3>
    <p>Price: $0.005 USDC</p>
    <button onclick="testEndpoint('/api/data', 'data-response')">Test Endpoint</button>
    <div id="data-response" class="response"></div>
  </div>

  <div class="endpoint">
    <h3>GET /health</h3>
    <p>No payment required</p>
    <button onclick="testEndpoint('/health', 'health-response')">Test Endpoint</button>
    <div id="health-response" class="response"></div>
  </div>

  <script>
    async function testEndpoint(path, responseId) {
      const responseDiv = document.getElementById(responseId);
      responseDiv.textContent = 'Loading...';
      
      try {
        const response = await fetch(path);
        const data = await response.text();
        
        responseDiv.textContent = \`Status: \${response.status}\\n\\n\${data}\`;
      } catch (error) {
        responseDiv.textContent = \`Error: \${error.message}\`;
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
║        x402-observed Express Example Server            ║
╠════════════════════════════════════════════════════════╣
║  Server:       http://localhost:${PORT}                ║
║  Network:      ${EVM_NETWORK}                          ║
║  Payee:        ${EVM_PAYEE_ADDRESS}                    ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /                  (frontend)                  ║
║  • GET  /api/premium       ($0.001 USDC)              ║
║  • GET  /api/data          ($0.005 USDC)              ║
║  • GET  /health            (no payment)                ║
║                                                        ║
║  Observability:                                        ║
║  • Events logged to: .x402-observed/events.db         ║
║  • Run: npx x402-observed                             ║
║  • Dashboard: http://localhost:4402                   ║
╚════════════════════════════════════════════════════════╝
  `);
});
