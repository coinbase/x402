"use client";

import { useState } from "react";

export default function Home() {
  const [premiumResponse, setPremiumResponse] = useState("");
  const [dataResponse, setDataResponse] = useState("");
  const [healthResponse, setHealthResponse] = useState("");

  async function makePayment(
    path: string,
    setResponse: (value: string) => void
  ) {
    setResponse("⏳ Initiating payment flow...\n\nThis will:\n1. Return 402 Payment Required\n2. Show wallet popup\n3. Request payment approval\n4. Process payment\n5. Return content");

    try {
      const response = await fetch(path);
      const contentType = response.headers.get("content-type");

      if (response.status === 402) {
        // Payment required - wallet UI should appear
        setResponse(
          "💳 Payment Required\n\nStatus: 402\n\nThe wallet popup should appear now.\nPlease approve the payment in your wallet.\n\nNote: If you don't see the popup, check:\n- Wallet extension is installed\n- Connected to Base Sepolia testnet\n- Have testnet USDC"
        );
      } else if (response.status === 200) {
        // Payment successful
        const data = contentType?.includes("application/json")
          ? await response.json()
          : await response.text();
        setResponse(
          `✅ Payment Successful!\n\nStatus: 200 OK\n\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n\n🎉 Check the dashboard to see the complete workflow with transaction hash!`
        );
      } else {
        // Other response
        const text = await response.text();
        setResponse(`Status: ${response.status}\n\n${text}`);
      }
    } catch (error) {
      setResponse(
        `❌ Error: ${error instanceof Error ? error.message : String(error)}\n\nMake sure the server is running`
      );
    }
  }

  async function testHealthEndpoint() {
    setHealthResponse("Loading...");

    try {
      const response = await fetch("/api/health");
      const data = await response.json();
      setHealthResponse(`Status: ${response.status}\n\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setHealthResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: "900px",
        margin: "0 auto",
        padding: "20px",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
          marginBottom: "30px",
          textAlign: "center",
        }}
      >
        <h1 style={{ color: "#667eea", marginBottom: "10px", fontSize: "2.5em" }}>
          🔍 x402-observed Next.js Demo
        </h1>
        <p style={{ color: "#666", fontSize: "1.1em" }}>
          Complete Payment Flow with Wallet Integration
        </p>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
        }}
      >
        <h3 style={{ color: "#667eea", marginBottom: "15px" }}>ℹ️ How It Works</h3>
        <ul style={{ listStyle: "none", paddingLeft: 0 }}>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <strong>1.</strong> Click "Pay & Access" button below
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <strong>2.</strong> Wallet popup appears (MetaMask, Coinbase Wallet, etc.)
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <strong>3.</strong> Approve the payment on Base Sepolia testnet
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <strong>4.</strong> See "Payment Successful" message
          </li>
          <li style={{ padding: "8px 0" }}>
            <strong>5.</strong> View complete workflow in dashboard with transaction hash
          </li>
        </ul>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
        }}
      >
        <h3 style={{ color: "#667eea", marginBottom: "15px" }}>🔧 Setup Requirements</h3>
        <ul style={{ listStyle: "none", paddingLeft: 0 }}>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            ✅ Wallet extension installed (MetaMask or Coinbase Wallet)
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            ✅ Connected to Base Sepolia testnet
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            ✅ Some testnet USDC (get from faucet)
          </li>
          <li style={{ padding: "8px 0" }}>
            ✅ Dashboard running: <code>npx x402-observed</code>
          </li>
        </ul>
      </div>

      <div
        style={{
          background: "white",
          padding: "25px",
          borderRadius: "12px",
          marginBottom: "20px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
          borderLeft: "4px solid #667eea",
        }}
      >
        <h3 style={{ color: "#333", marginBottom: "10px" }}>GET /api/premium</h3>
        <span
          style={{
            display: "inline-block",
            background: "#667eea",
            color: "white",
            padding: "5px 15px",
            borderRadius: "20px",
            fontWeight: "bold",
            margin: "10px 0",
          }}
        >
          $0.001 USDC
        </span>
        <p style={{ color: "#666", margin: "10px 0" }}>
          Premium content access - perfect for testing the payment flow
        </p>
        <button
          onClick={() => makePayment("/api/premium", setPremiumResponse)}
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            padding: "12px 30px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "16px",
            marginTop: "10px",
          }}
        >
          💳 Pay & Access Premium Content
        </button>
        {premiumResponse && (
          <div
            style={{
              background: "#f8f9fa",
              padding: "15px",
              marginTop: "15px",
              borderRadius: "8px",
              fontFamily: "'Courier New', monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              maxHeight: "300px",
              overflowY: "auto",
              borderLeft: premiumResponse.includes("✅")
                ? "4px solid #10b981"
                : premiumResponse.includes("❌")
                  ? "4px solid #ef4444"
                  : "4px solid #f59e0b",
            }}
          >
            {premiumResponse}
          </div>
        )}
      </div>

      <div
        style={{
          background: "white",
          padding: "25px",
          borderRadius: "12px",
          marginBottom: "20px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
          borderLeft: "4px solid #667eea",
        }}
      >
        <h3 style={{ color: "#333", marginBottom: "10px" }}>GET /api/data</h3>
        <span
          style={{
            display: "inline-block",
            background: "#667eea",
            color: "white",
            padding: "5px 15px",
            borderRadius: "20px",
            fontWeight: "bold",
            margin: "10px 0",
          }}
        >
          $0.005 USDC
        </span>
        <p style={{ color: "#666", margin: "10px 0" }}>
          Data API endpoint - higher tier payment
        </p>
        <button
          onClick={() => makePayment("/api/data", setDataResponse)}
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            padding: "12px 30px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "16px",
            marginTop: "10px",
          }}
        >
          💎 Pay & Access Data Content
        </button>
        {dataResponse && (
          <div
            style={{
              background: "#f8f9fa",
              padding: "15px",
              marginTop: "15px",
              borderRadius: "8px",
              fontFamily: "'Courier New', monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              maxHeight: "300px",
              overflowY: "auto",
              borderLeft: dataResponse.includes("✅")
                ? "4px solid #10b981"
                : dataResponse.includes("❌")
                  ? "4px solid #ef4444"
                  : "4px solid #f59e0b",
            }}
          >
            {dataResponse}
          </div>
        )}
      </div>

      <div
        style={{
          background: "white",
          padding: "25px",
          borderRadius: "12px",
          marginBottom: "20px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
          borderLeft: "4px solid #10b981",
        }}
      >
        <h3 style={{ color: "#333", marginBottom: "10px" }}>GET /api/health</h3>
        <p style={{ color: "#666", margin: "10px 0" }}>No payment required</p>
        <button
          onClick={testHealthEndpoint}
          style={{
            background: "#10b981",
            color: "white",
            border: "none",
            padding: "12px 30px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "16px",
            marginTop: "10px",
          }}
        >
          Test Health Endpoint
        </button>
        {healthResponse && (
          <div
            style={{
              background: "#f8f9fa",
              padding: "15px",
              marginTop: "15px",
              borderRadius: "8px",
              fontFamily: "'Courier New', monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            {healthResponse}
          </div>
        )}
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}
      >
        <h3 style={{ color: "#667eea", marginBottom: "15px" }}>📊 View Workflow Dashboard</h3>
        <p style={{ margin: "15px 0", color: "#666" }}>
          Watch your payment workflows in real-time with complete event tracking
        </p>
        <a
          href="http://localhost:4402"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            background: "#10b981",
            color: "white",
            padding: "15px 30px",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "bold",
            marginTop: "10px",
          }}
        >
          🚀 Open Dashboard
        </a>
      </div>
    </div>
  );
}
