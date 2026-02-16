/**
 * Anthropic Claude Chatbot with MCP Tools + x402 Payments
 *
 * A complete chatbot implementation showing how to integrate:
 * - Anthropic Claude (the LLM)
 * - MCP Client (tool discovery and execution)
 * - x402 Payment Protocol (automatic payment for paid tools)
 *
 * Connects to the CDP MCP Bazaar via Streamable HTTP with JWT authentication.
 * This demonstrates the ACTUAL MCP client methods used in production chatbots.
 */

import { config } from "dotenv";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createx402MCPClient } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";

config();

// ============================================================================
// Configuration
// ============================================================================

const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicKey) {
  console.error("❌ ANTHROPIC_API_KEY environment variable is required");
  console.error("   Get your API key from: https://console.anthropic.com/");
  process.exit(1);
}

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
if (!evmPrivateKey) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  console.error("   Generate one with: cast wallet new");
  process.exit(1);
}

const serverUrl = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp";
const cdpApiKeyId = process.env.CDP_API_KEY_ID;
const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

// ============================================================================
// Chatbot Implementation
// ============================================================================

/**
 * Main chatbot loop - demonstrates real MCP client usage patterns
 */
export async function main(): Promise<void> {
  const MODEL_NAME = "claude-3-haiku-20240307";
  console.log("\n🤖 Anthropic Claude + MCP Chatbot with x402 Payments");
  console.log(`   Model: ${MODEL_NAME}`);
  console.log("   Connected to CDP MCP Bazaar");
  console.log("━".repeat(70));

  // Initialize Anthropic (the LLM)
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Initialize MCP client (connects to tool servers)
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  const mcpClient = createx402MCPClient({
    name: "claude-mcp-bazaar-chatbot",
    version: "1.0.0",
    schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(evmSigner) }],
    autoPayment: true,
    onPaymentRequested: async context => {
      const price = context.paymentRequired.accepts[0];
      console.log(`\n💰 Payment required for tool: ${context.toolName}`);
      console.log(`   Amount: ${price.amount} ${price.asset?.slice(0, 10)}...`);
      console.log(`   Network: ${price.network}`);
      console.log(`💳 Processing payment...`);
      return true; // Auto-approve
    },
  });

  // ========================================================================
  // MCP TOUCHPOINT #1: connect()
  // Establish connection to CDP MCP Bazaar via Streamable HTTP + JWT
  // ========================================================================
  if (!cdpApiKeyId || !cdpApiKeySecret) {
    console.error("❌ CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for discovery endpoints");
    process.exit(1);
  }

  const url = new URL(serverUrl);

  const jwt = await generateJwt({
    apiKeyId: cdpApiKeyId,
    apiKeySecret: cdpApiKeySecret,
    requestMethod: "POST",
    requestHost: url.host,
    requestPath: url.pathname,
  });

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

  await mcpClient.connect(transport);

  // Discover available tools from MCP server
  const { tools: mcpTools } = await mcpClient.listTools();

  // Convert MCP tools to Anthropic format
  const anthropicTools: Tool[] = mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    input_schema: {
      ...tool.inputSchema,
      type: "object",
    } as Tool.InputSchema,
  }));

  console.log(`✅ Ready! Found ${mcpTools.length} tool(s):`);
  mcpTools.forEach(tool => {
    const isPaid =
      tool.description?.toLowerCase().includes("payment") ||
      tool.description?.toLowerCase().includes("$");
    console.log(`   ${isPaid ? "💰" : "🆓"} ${tool.name}`);
  });
  console.log("━".repeat(70));

  // ========================================================================
  // Interactive Chat Loop
  // ========================================================================
  console.log("\n💬 Chat started! Try asking:");
  console.log("   - 'What's the weather in Tokyo?'");
  console.log("   - 'Can you ping the server?'");
  console.log("   - 'quit' to exit\n");

  const conversationHistory: MessageParam[] = [
    {
      role: "user",
      content: `You are a helpful assistant with access to MCP tools. Be concise and friendly.`,
    },
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  /**
   * Process one chat turn
   *
   * @param userInput - The user's message to process
   */
  const processTurn = async (userInput: string): Promise<void> => {
    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: userInput,
    });

    // ========================================================================
    // ANTHROPIC CALL: Send conversation + tools to LLM
    // ========================================================================
    let response = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 1024,
      messages: conversationHistory,
      tools: anthropicTools,
    });

    // ========================================================================
    // TOOL EXECUTION LOOP
    // This is where MCP client is actually used!
    // ========================================================================
    while (response.stop_reason === "tool_use") {
      // Add assistant message to history
      conversationHistory.push({
        role: "assistant",
        content: response.content,
      });

      // Execute each tool call
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const contentBlock of response.content) {
        if (contentBlock.type !== "tool_use") continue;

        const toolName = contentBlock.name;
        const toolArgs = contentBlock.input as Record<string, unknown>;

        // Log tool selection
        if (toolName === "search_resources") {
          console.log(`\n🔍 Searching for available tools...`);
        } else if (toolName === "proxy_tool_call") {
          const selectedToolName = (toolArgs as { toolName?: string })?.toolName;
          if (selectedToolName) {
            console.log(`\n🔧 Selected tool: ${selectedToolName}`);
          } else {
            console.log(`\n🔧 Selected tool: ${toolName}`);
          }
        } else {
          console.log(`\n🔧 Selected tool: ${toolName}`);
        }

        try {
          // Extract _meta from arguments if present (LLM may include it)
          // _meta is protocol-level metadata, not part of tool arguments
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _meta, ...cleanArgs } = toolArgs as Record<string, unknown> & { _meta?: unknown };

          // Execute tool via MCP (payment handled automatically)
          const mcpResult = await mcpClient.callTool(toolName, cleanArgs);

          // Show search results if this was a search
          if (toolName === "search_resources") {
            try {
              const resultText = mcpResult.content[0]?.text || JSON.stringify(mcpResult.content[0]);
              const searchResult =
                typeof resultText === "string" ? JSON.parse(resultText) : resultText;
              if (searchResult?.tools && Array.isArray(searchResult.tools)) {
                console.log(`   Found ${searchResult.tools.length} tool(s):`);
                searchResult.tools.forEach((tool: { name?: string }) => {
                  if (tool.name) {
                    console.log(`      • ${tool.name}`);
                  }
                });
              }
            } catch {
              // If parsing fails, just continue
            }
          }

          // Show payment transaction if payment was made
          if (mcpResult.paymentMade && mcpResult.paymentResponse) {
            console.log(`✅ Payment transaction: ${mcpResult.paymentResponse.transaction}`);
          }

          // Extract text content from MCP result
          const resultText =
            mcpResult.content[0]?.text ||
            JSON.stringify(mcpResult.content[0]) ||
            "No content returned";

          // Format for Anthropic
          toolResults.push({
            type: "tool_result",
            tool_use_id: contentBlock.id,
            content: typeof resultText === "string" ? resultText : JSON.stringify(resultText),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`   ❌ Error: ${errorMessage}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: contentBlock.id,
            content: `Error: ${errorMessage}`,
          });
        }
      }

      // Add tool results to conversation
      conversationHistory.push({
        role: "user",
        content: toolResults,
      });

      // ========================================================================
      // Get LLM's response after seeing tool results
      // ========================================================================
      response = await anthropic.messages.create({
        model: MODEL_NAME,
        max_tokens: 1024,
        messages: conversationHistory,
        tools: anthropicTools,
      });
    }

    // ========================================================================
    // Display final assistant response
    // ========================================================================
    const textContent = response.content
      .filter(block => block.type === "text")
      .map(block => (block as { type: "text"; text: string }).text)
      .join("\n");

    if (textContent) {
      conversationHistory.push({
        role: "assistant",
        content: response.content,
      });
      console.log(`\n🤖 Bot: ${textContent}\n`);
    }
  };

  /**
   * Main chat loop
   */
  const chatLoop = async (): Promise<void> => {
    return new Promise(resolve => {
      rl.question("You: ", async input => {
        const userInput = input.trim();

        if (userInput.toLowerCase() === "quit" || userInput.toLowerCase() === "exit") {
          console.log("\n👋 Closing connections...");

          await mcpClient.close();
          rl.close();
          console.log("✅ Goodbye!\n");
          process.exit(0);
          return;
        }

        if (!userInput) {
          resolve();
          return;
        }

        try {
          await processTurn(userInput);
        } catch (error) {
          console.log(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
        }

        resolve();
      });
    });
  };

  // Start chat loop
  while (true) {
    await chatLoop();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch(error => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
