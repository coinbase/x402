/**
 * MCP Client with x402 Payment Support
 *
 * This example demonstrates how to create an MCP client that can automatically
 * pay for tool calls using the x402 protocol.
 *
 * Run with: pnpm dev
 * Requires: MCP server running (see servers/mcp example)
 */

import { config } from "dotenv";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createX402MCPClient } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
if (!evmPrivateKey) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

const serverUrl = process.env.MCP_SERVER_URL || "http://localhost:4022";

/**
 * Demonstrates calling MCP tools with automatic x402 payment handling.
 *
 * @returns Promise that resolves when demo is complete
 */
async function main(): Promise<void> {
  console.log("🔌 Connecting to MCP server at:", serverUrl);

  // Create EVM signer from private key
  const evmSigner = privateKeyToAccount(evmPrivateKey);
  console.log("💳 Using wallet:", evmSigner.address);

  // Create x402 MCP client using factory (simplified setup)
  const x402Mcp = createX402MCPClient({
    name: "x402-mcp-client-demo",
    version: "1.0.0",
    schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(evmSigner) }],
    autoPayment: true,
    onPaymentApproval: async context => {
      const price = context.paymentRequired.accepts[0];
      console.log(`\n💰 Payment required for tool: ${context.toolName}`);
      console.log(`   Amount: ${price.amount} (${price.asset})`);
      console.log(`   Network: ${price.network}`);
      console.log(`   Approving payment...\n`);
      return true; // Auto-approve for demo
    },
  });

  // Connect to server
  const transport = new SSEClientTransport(new URL(`${serverUrl}/sse`));
  await x402Mcp.connect(transport);
  console.log("✅ Connected to MCP server\n");

  // List available tools
  console.log("📋 Discovering available tools...");
  const tools = await x402Mcp.listTools();
  console.log("Available tools:");
  for (const tool of tools.tools) {
    console.log(`   - ${tool.name}: ${tool.description}`);
  }
  console.log();

  // Test 1: Call free tool
  console.log("━".repeat(50));
  console.log("🆓 Test 1: Calling free tool (ping)");
  console.log("━".repeat(50));

  try {
    const pingResult = await x402Mcp.callTool("ping");
    console.log("Response:", pingResult.content[0]?.text);
    console.log("Payment made:", pingResult.paymentMade);
  } catch (error) {
    console.error("Error:", error);
  }

  console.log();

  // Test 2: Call paid tool
  console.log("━".repeat(50));
  console.log("💰 Test 2: Calling paid tool (get_weather)");
  console.log("━".repeat(50));

  try {
    const weatherResult = await x402Mcp.callTool("get_weather", { city: "San Francisco" });
    console.log("Response:", weatherResult.content[0]?.text);
    console.log("Payment made:", weatherResult.paymentMade);

    if (weatherResult.paymentResponse) {
      console.log("\n📦 Payment Receipt:");
      console.log("   Success:", weatherResult.paymentResponse.success);
      if (weatherResult.paymentResponse.transaction) {
        console.log("   Transaction:", weatherResult.paymentResponse.transaction);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  console.log();

  // Test 3: Get payment requirements without calling
  console.log("━".repeat(50));
  console.log("🔍 Test 3: Check payment requirements");
  console.log("━".repeat(50));

  try {
    const requirements = await x402Mcp.getToolPaymentRequirements("get_weather", {
      city: "New York",
    });

    if (requirements) {
      console.log("Payment required:");
      console.log("   Accepts:", requirements.accepts.length, "payment option(s)");
      for (const option of requirements.accepts) {
        console.log(`   - ${option.amount} on ${option.network}`);
      }
    } else {
      console.log("Tool is free (no payment required)");
    }
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n✅ Demo complete!");

  // Cleanup
  await x402Mcp.close();
  process.exit(0);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
