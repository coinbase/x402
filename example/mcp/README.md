# MCP Examples

## `local.ts`

Runs an MCP server locally which calls to a data API via HTTP, paying for the data with x402.

Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "demo": {
      "command": "npm",
      "args": ["--prefix", "<absolute path to this repo>/example", "run", "mcp:local"],
      "env": {
        "PRIVATE_KEY": "<private key of a wallet with USDC on Base Sepolia>"
      }
    }
  }
}
```
