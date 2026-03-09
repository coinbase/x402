# Demo of paying for Anthropic tokens via a proxy

This example demonstrates how to use x402 to pay for Anthropic API calls using a proxy server. The setup involves configuring both a Go proxy server and a TypeScript agent.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- Go (install via `brew install go` on macOS or [golang.org/dl](https://golang.org/dl) for other platforms)
- A valid Ethereum private key for making payments (must have Base Sepolia USDC)
- An Anthropic API key

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd clients/agent
```

2. Configure your environment:
   - Create a `.env` file in the agent directory
   - Add your private key (must be prefixed with `0x`):
     ```
     PRIVATE_KEY=0x<your-private-key>
     ```
   - Add your resource server URL (default: http://localhost:4021):
     ```
     RESOURCE_SERVER_URL=http://localhost:4021
     ```

### 1. Configure and Start the Proxy Server

1. Navigate to the proxy directory:
   ```bash
   cd go/bin
   ```

2. Create an `anthropic_config.json` file with the following configuration:
   ```json
   {
     "targetURL": "https://api.anthropic.com",
     "amount": 0.01,
     "payTo": "address to pay to",
     "headers": {
       "x-api-key": "<your-anthropic-api-key>",
       "anthropic-version": "2023-06-01",
       "content-type": "application/json"
     }
   }
   ```

3. Start the proxy server:
   ```bash
   go run proxy_demo.go anthropic_config.json
   ```

### 2. Run the Agent

1. Navigate back to the agent directory:
   ```bash
   cd ../../examples/typescript/clients/agent
   ```

2. Run the agent:
   ```bash
   pnpm agent
   ```

## Troubleshooting

### Common Issues

1. **Go Command Not Found**
   - Ensure Go is properly installed and in your PATH
   - Verify installation with `go version`

2. **Module Not Found**
   - Make sure you've built the x402 package before running the agent
   - Run `pnpm install` and `pnpm build` in the x402 package directory

3. **Invalid Private Key**
   - Ensure your private key is prefixed with `0x`
   - Verify the key has the correct format and length

4. **Proxy Connection Issues**
   - Verify the proxy server is running
   - Check that the `anthropic_config.json` has the correct configuration
   - Ensure your Anthropic API key is valid

## Security Notes

- Never commit your private keys or API keys to version control
- Always use testnet funds (Base Sepolia) for development
- Keep your `.env` file secure and never share it