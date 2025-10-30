# Quick Start Guide

This is a 5-minute guide to get the demo running.

## Step 1: Start the AnySpend Server

In a separate terminal:

```bash
cd examples/typescript/fullstack/anyspend
pnpm install
pnpm dev:server
```

You should see:
```
🚀 AnySpend Express Server with Remote Facilitator
===================================================
   Server running on: http://localhost:3001
```

## Step 2: Configure Your Private Key

Create a `.env` file in this directory:

```bash
cp .env.example .env
```

Edit `.env` and add your private key:

```env
PRIVATE_KEY=0x1234567890abcdef...
```

**Important**: Make sure your wallet has:
- USDC on Base Sepolia (for payments)
- ETH on Base Sepolia (for gas fees)

### Getting Testnet Tokens

1. **Base Sepolia ETH**: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
2. **USDC on Base Sepolia**: Contact: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - Use a DEX or ask in Discord/Telegram

## Step 3: Run the Demo

```bash
pnpm start
```

That's it! You should see output like:

```
🚀 AnySpend Fetch Demo
════════════════════════════════════════
📡 Server URL: http://localhost:3001
🌐 Network: base-sepolia

🔐 Creating signer from private key...
✅ Signer created for base-sepolia

Example 1: Free Endpoint (No Payment)
✅ Health check response: { status: "healthy" }

Example 2: Premium Endpoint with Default Payment (USDC)
📤 Making request to /api/premium...
✅ Response status: 200 OK
💳 Payment settled! Transaction: 0xabc123...
📊 Premium Market Analysis Data received!
```

## Advanced Usage

### Pay with a different token

```bash
# Pay with WETH
PAYMENT_TOKEN=0x4200000000000000000000000000000000000006 pnpm start

# Pay with DAI
PAYMENT_TOKEN=0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb pnpm start
```

### Use a different network

```bash
NETWORK=base pnpm start
```

## Troubleshooting

**"Connection refused"** → Make sure the AnySpend server is running

**"Insufficient funds"** → Get testnet USDC and ETH

**"Missing PRIVATE_KEY"** → Create a `.env` file with your private key

## What's Happening?

1. Your client creates a signed payment message using your private key
2. The payment is sent to the server via HTTP header
3. Server verifies the signature and checks your balance
4. Remote facilitator settles the transaction on-chain
5. You receive the premium data!

No wallet popup, no browser extension needed - just pure HTTP + crypto magic! ✨
