# Demo of paying for anthropic tokens via a proxy

1. Setup up proxy

Create a `anthropic_config.json` with the following values in `x402/packages/go/x402/bin`:

```json
{
  "targetURL": "https://api.anthropic.com",
  "amount": 0.01,
  "payToAddress": "address to pay to",
  "headers": {
    "x-api-key": "<anthropic api key>",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  }
}
```

From `x402/packages/go/x402/bin` run `go run proxy_demo.go anthropic_config.json`

2. From `example/agent/` `npm install`

3. Either create a `.env` file with `PRIVATE_KEY=<private key with base sepolia usdc>` or `export PRIVATE_KEY=<private key with base sepolia usdc>` **Do not use mainnet funds.**

4. `npm run agent`
