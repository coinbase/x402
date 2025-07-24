# AgentKit Example

This is an example that demonstrates how to create an interactive AI agent using AgentKit and LangChain. The agent can perform onchain actions and interact with various CDP (Coinbase Developer Platform) services.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- OpenAI API key for the LLM
- (Optional) CDP API keys for additional functionality

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd agentkit
```

2. Copy `.env-local` to `.env` and configure your environment variables:
```bash
cp .env-local .env
```

Required environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `PRIVATE_KEY`: (Optional) Your Ethereum private key. If not provided, a new one will be generated
- `NETWORK_ID`: (Optional) Network to connect to (defaults to "base-sepolia")
- `CDP_API_KEY_ID`: (Optional) Your CDP API key ID
- `CDP_API_KEY_SECRET`: (Optional) Your CDP API key secret

3. Start the example:
```bash
pnpm dev
```

## How It Works

The example demonstrates how to:
1. Create an interactive AI agent using LangChain and AgentKit
2. Set up wallet management for onchain interactions
3. Configure various action providers (WETH, Wallet, ERC20, x402, CDP API)
4. Handle streaming responses and tool executions
5. Maintain an interactive chat session with the agent

## Example Code

Here's a simplified version of how the agent is created:

```typescript
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// Initialize wallet provider
const walletProvider = new ViemWalletProvider(client);

// Configure action providers
const actionProviders = [
  wethActionProvider(),
  walletActionProvider(),
  erc20ActionProvider(),
  x402ActionProvider()
];

// Initialize AgentKit
const agentkit = await AgentKit.from({
  walletProvider,
  actionProviders,
});

// Create LLM instance
const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

// Create the agent
const agent = createReactAgent({
  llm,
  tools: await getLangChainTools(agentkit),
  checkpointSaver: new MemorySaver(),
});
```

## Features

The agent can:
- Interact with blockchain networks
- Execute onchain transactions
- Query wallet information
- Interact with ERC20 tokens
- Use x402 payment protocol
- Access CDP API services (if configured)
- Maintain conversation context
- Stream responses in real-time

## Additional Resources

- [CDP Documentation](https://docs.cdp.coinbase.com)
- [AgentKit Documentation](https://docs.cdp.coinbase.com/agentkit/docs)
- [LangChain Documentation](https://js.langchain.com/docs)
