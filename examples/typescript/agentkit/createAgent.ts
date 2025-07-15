import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { Hex } from "viem";
import {
  ActionProvider,
  AgentKit,
  cdpApiActionProvider,
  erc20ActionProvider,
  NETWORK_ID_TO_VIEM_CHAIN,
  walletActionProvider,
  wethActionProvider,
  x402ActionProvider,
} from "@coinbase/agentkit";
import { ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import { http } from "viem";
import { Network } from "x402/types";
/**
 * Agent Configuration Guide
 *
 * This file handles the core configuration of your AI agent's behavior and capabilities.
 *
 * Key Steps to Customize Your Agent:
 *
 * 1. Select your LLM:
 *    - Modify the `ChatOpenAI` instantiation to choose your preferred LLM
 *    - Configure model parameters like temperature and max tokens
 *
 * 2. Instantiate your Agent:
 *    - Pass the LLM, tools, and memory into `createReactAgent()`
 *    - Configure agent-specific parameters
 */

// The agent
let agent: ReturnType<typeof createReactAgent>;

// The wallet data file
const WALLET_DATA_FILE = "wallet_data.txt";

/**
 * Initializes and returns an instance of the AI agent.
 * If an agent instance already exists, it returns the existing one.
 *
 * @function getOrInitializeAgent
 * @returns {Promise<ReturnType<typeof createReactAgent>>} The initialized AI agent.
 *
 * @description Handles agent setup
 *
 * @throws {Error} If the agent initialization fails.
 */
export async function createAgent(): Promise<{
  agent: ReturnType<typeof createReactAgent>;
  config: { configurable: { thread_id: string } };
}> {
  const config = { configurable: { thread_id: "x402 AgentKit Chatbot Example!" } };

  // If agent has already been initialized, return it
  if (agent) {
    return { agent, config };
  }

  try {
    // Initialize WalletProvider: https://docs.cdp.coinbase.com/agentkit/docs/wallet-management
    let privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) {
      if (fs.existsSync(WALLET_DATA_FILE)) {
        privateKey = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8")).privateKey;
        console.info("Found private key in wallet_data.txt");
      } else {
        privateKey = generatePrivateKey();
        fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify({ privateKey }));
        console.log("Created new private key and saved to wallet_data.txt");
        console.log(
          "We recommend you save this private key to your .env file and delete wallet_data.txt afterwards.",
        );
      }
    }

    const account = privateKeyToAccount(privateKey);
    const networkId = process.env.NETWORK_ID || ("base-sepolia" as Network);

    const client = createWalletClient({
      account,
      chain: NETWORK_ID_TO_VIEM_CHAIN[networkId],
      transport: http(),
    });
    const walletProvider = new ViemWalletProvider(client);

    // Initialize AgentKit: https://docs.cdp.coinbase.com/agentkit/docs/agent-actions
    const actionProviders: ActionProvider[] = [
      wethActionProvider(),
      walletActionProvider(),
      erc20ActionProvider(),
      x402ActionProvider(),
    ];

    const canUseCdpApi = process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET;
    if (canUseCdpApi) {
      actionProviders.push(
        cdpApiActionProvider({
          apiKeyId: process.env.CDP_API_KEY_ID,
          apiKeySecret: process.env.CDP_API_KEY_SECRET,
        }),
      );
    }
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders,
    });

    // Initialize LLM: https://platform.openai.com/docs/models#gpt-4o
    const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

    const tools = await getLangChainTools(agentkit);
    const memory = new MemorySaver();

    const canUseFaucet = walletProvider.getNetwork().networkId == "base-sepolia";
    const faucetMessage = `If you ever need funds, you can request them from the faucet.`;
    const cantUseFaucetMessage = `If you need funds, you can provide your wallet details and request funds from the user.`;
    agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are 
        empowered to interact onchain using your tools. ${canUseFaucet ? faucetMessage : cantUseFaucetMessage}.
        Before executing your first action, get the wallet details to see what network 
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
        asks you to do something you can't do with your currently available tools, you must say so, and 
        encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to 
        docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from 
        restating your tools' descriptions unless it is explicitly requested.
        `,
    });

    return {
      agent,
      config,
    };
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }
}
