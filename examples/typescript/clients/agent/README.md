# Demo of paying for Anthropic tokens via a proxy

This example demonstrates how to use x402 to pay for Anthropic API calls using a proxy server. The setup involves configuring both a Go proxy server and a TypeScript agent.

## Prerequisites

1. Install Go (if not already installed):
   ```bash
   brew install go  # For macOS
   # or visit https://golang.org/dl/ for other platforms
   ```

2. Install Node.js and npm (if not already installed)

## Setup Steps

### 1. Configure and Start the Proxy Server

1. Navigate to the proxy directory:
   ```bash
   cd packages/go/x402/bin
   ```

2. Create an `anthropic_config.json` file with the following configuration:
   ```json
   {
     "targetURL": "https://api.anthropic.com",
     "amount": 0.01,
     "payToAddress": "address to pay to",
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

### 2. Build the x402 Package

1. Navigate to the x402 package directory:
   ```bash
   cd packages/typescript/x402
   ```

2. Install dependencies and build the package:
   ```bash
   npm install
   npm run build
   ```

### 3. Configure and Run the Agent

1. Navigate to the agent directory:
   ```bash
   cd ../../../example/agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your environment:
   - Create a `.env` file in the agent directory
   - Add your private key (must be prefixed with `0x`):
     ```
     PRIVATE_KEY=0x<your-private-key>
     ```
   - **Important**: Use a private key with Base Sepolia USDC only. Do not use mainnet funds.
   - Add your resource server URL. By default, it's http://localhost:4021:
     ```
     RESOURCE_SERVER_URL=http://localhost:4021
     ```

4. Run the agent:
   ```bash
   npm run agent
   ```

## Troubleshooting

### Common Issues

1. **Go Command Not Found**
   - Ensure Go is properly installed and in your PATH
   - Verify installation with `go version`

2. **Module Not Found**
   - Make sure you've built the x402 package before running the agent
   - Run `npm install` and `npm run build` in the x402 package directory

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