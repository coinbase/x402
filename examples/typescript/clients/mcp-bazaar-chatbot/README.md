# Anthropic Claude Chatbot with CDP MCP Bazaar + x402 Payments

An interactive chatbot that uses **Anthropic Claude** for natural language, **MCP** for tool discovery/execution, and **x402** for automatic payment of paid tools. Connects to the **CDP MCP Bazaar** via Streamable HTTP transport with JWT authentication.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CDP MCP Bazaar Chatbot                                │
│                                                                          │
│  ┌──────────────┐              ┌──────────────┐                         │
│  │   Anthropic   │◀────────────▶│  MCP Client  │                         │
│  │   Claude      │  Tool defs   │   (x402)     │                         │
│  │               │  Tool results│              │                         │
│  └──────────────┘              └──────────────┘                         │
│         │                              │                                 │
│         │ Decides which tools          │ Streamable HTTP + JWT            │
│         │ to call                      │                                 │
└─────────┼──────────────────────────────┼────────────────────────────────┘
          │                              │
          │                              ▼
          │                       ┌──────────────┐
          │                       │ CDP MCP      │
          │                       │ Bazaar       │
          │                       │ (discovery)  │
          │                       └──────────────┘
```

## Key Features

- **Streamable HTTP transport** - Connects to facilitator-proxied MCP endpoints (not SSE)
- **CDP JWT authentication** - Uses `generateJwt` from `@coinbase/cdp-sdk/auth`
- **Anthropic Claude** - Uses Claude for LLM (not OpenAI)
- **x402 automatic payment** - Pays for paid tools automatically

## Setup

1. Copy `.env-local` to `.env` and configure:

```bash
cp .env-local .env
```

2. Add your credentials:

   - `ANTHROPIC_API_KEY`: Get from https://console.anthropic.com/
   - `CDP_API_KEY_ID`: CDP API key ID (from Coinbase Developer Platform)
   - `CDP_API_KEY_SECRET`: CDP API key secret (PEM or base64)
   - `EVM_PRIVATE_KEY`: Wallet private key for x402 payments (needs funds on Base Sepolia)

3. Install dependencies:

```bash
pnpm install
```

## Running

```bash
pnpm dev
```

No local MCP server needed - the chatbot connects directly to the CDP MCP Bazaar at `https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp`.

## Bazaar-Specific Tools

The CDP Bazaar may expose tools like:

- `search_resources` - Search for available tools in the marketplace
- `proxy_tool_call` - Execute a tool (with `toolName` in args)

The chatbot handles these transparently and passes through to the MCP client.

## MCP Client Methods Used

1. `connect()` - Once at startup (Streamable HTTP + JWT)
2. `listTools()` - Once at startup
3. `callTool()` - Every time LLM calls a tool
4. `close()` - Once at shutdown

## Troubleshooting

### "CDP_API_KEY_ID and CDP_API_KEY_SECRET are required"

- Create API keys at the Coinbase Developer Platform
- Ensure both are set in your `.env` file

### "Payment request denied"

- Ensure EVM_PRIVATE_KEY has funds on Base Sepolia
- Check wallet has test USDC for paid tools

### "Anthropic API error"

- Verify ANTHROPIC_API_KEY is valid
- Check API key has credits at https://console.anthropic.com/
