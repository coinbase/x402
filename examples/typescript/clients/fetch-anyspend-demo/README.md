# x402-fetch AnySpend Demo

A CLI demo that demonstrates how to use `x402-fetch` to make payments to a server using the x402 payment protocol. This demo works with the AnySpend Express server and shows how to handle automatic payments with just a private key.

## Features

- 🔐 **Private Key Based**: Simple authentication using just your wallet private key
- 💰 **Multi-Token Support**: Pay with USDC, WETH, DAI, B3, or any custom ERC-20 token
- 🌐 **Multi-Network**: Support for Base, Ethereum, and Solana networks
- 🚀 **Automatic Payment Handling**: x402-fetch handles the entire payment flow automatically
- 📊 **Real Payment Examples**: Fetches premium market data from the AnySpend server

## How It Works

This demo uses `x402-fetch` to automatically handle payments when making API requests:

1. **First Request**: Server returns `402 Payment Required` with payment requirements
2. **Payment Creation**: x402-fetch automatically creates and signs the payment
3. **Retry with Payment**: Request is retried with the `X-PAYMENT` header
4. **Verification & Settlement**: Server verifies and settles the payment via facilitator
5. **Response**: You receive the protected content

All of this happens automatically - you just use `fetchWithPayment` like regular `fetch`!

## Prerequisites

- Node.js 18+
- A wallet with funds on Base Sepolia (or your chosen network)
- The AnySpend server running (from `examples/typescript/fullstack/anyspend`)

## Setup

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your private key:

```env
PRIVATE_KEY=0x1234567890abcdef...
API_URL=http://localhost:3001
NETWORK=base-sepolia
```

**⚠️ Security Warning**: Never commit your private key or share it with anyone!

### 3. Start the AnySpend Server

In a separate terminal, start the AnySpend server:

```bash
cd examples/typescript/fullstack/anyspend
pnpm install
pnpm dev:server
```

The server should start on `http://localhost:3001`.

## Running the Demo

### Basic Usage

```bash
pnpm start
```

This will:
1. Test the free health endpoint
2. Make a payment with default token (USDC)
3. Fetch premium market analysis data

### With Custom Token

Pay with a specific token:

```bash
# Pay with WETH on Base Sepolia
PAYMENT_TOKEN=0x4200000000000000000000000000000000000006 pnpm start

# Pay with DAI on Base Sepolia
PAYMENT_TOKEN=0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb pnpm start

# Pay with B3 on Base mainnet
NETWORK=base PAYMENT_TOKEN=0x3Dc8a9DD98eE3Ec58C345f2804E6C06A49090425 pnpm start
```

### Different Networks

```bash
# Base mainnet
NETWORK=base pnpm start

# Ethereum Sepolia
NETWORK=ethereum-sepolia pnpm start

# Solana Devnet (if server supports it)
NETWORK=solana-devnet pnpm start
```

## Example Output

```
🚀 AnySpend Fetch Demo

════════════════════════════════════════

📡 Server URL: http://localhost:3001
🌐 Network: base-sepolia

🔐 Creating signer from private key...
✅ Signer created for base-sepolia
   Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0

════════════════════════════════════════
Example 1: Free Endpoint (No Payment)
════════════════════════════════════════

✅ Health check response:
{
  "status": "healthy",
  "facilitator": "https://facilitator.x402.org",
  "network": "base-sepolia"
}

════════════════════════════════════════
Example 2: Premium Endpoint with Default Payment (USDC)
════════════════════════════════════════

📤 Making request to /api/premium...
✅ Response status: 200 OK

💳 Payment Information:
   Status: ✅ Settled
   Payer: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
   Transaction: 0xabc123...
   Network: base-sepolia
   Explorer: https://sepolia.basescan.org/tx/0xabc123...

📊 Premium Market Analysis Data:
{
  "success": true,
  "data": {
    "marketAnalysis": { ... },
    "predictions": { ... },
    "recommendations": [ ... ]
  }
}

════════════════════════════════════════
✅ Demo completed!
════════════════════════════════════════
```

## Code Example

Here's the core of how this works:

```typescript
import { wrapFetchWithPayment, createSigner, decodeXPaymentResponse } from "x402-fetch";

// Create signer from private key
const signer = await createSigner("base-sepolia", privateKey);

// Wrap fetch with automatic payment handling
const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

// Use it like regular fetch - payment is handled automatically!
const response = await fetchWithPayment("http://localhost:3001/api/premium", {
  method: "POST",
});

// Get payment information from response
const paymentInfo = decodeXPaymentResponse(
  response.headers.get("X-PAYMENT-RESPONSE")
);
console.log("Payment settled:", paymentInfo.transaction);

// Get your data
const data = await response.json();
console.log("Premium data:", data);
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | - | Your wallet private key (with 0x prefix) |
| `API_URL` | No | `http://localhost:3001` | AnySpend server URL |
| `NETWORK` | No | `base-sepolia` | Network to use (base-sepolia, base, ethereum-sepolia, solana-devnet) |
| `PAYMENT_TOKEN` | No | USDC | Custom token address to pay with |

## Supported Networks

### EVM Networks
- `base-sepolia` - Base Sepolia testnet
- `base` - Base mainnet
- `ethereum-sepolia` - Ethereum Sepolia testnet
- `ethereum` - Ethereum mainnet

### Solana Networks
- `solana-devnet` - Solana Devnet
- `solana-mainnet` - Solana Mainnet

## Supported Tokens (Base Sepolia)

| Token | Address |
|-------|---------|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH | `0x4200000000000000000000000000000000000006` |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |

## Troubleshooting

### "Missing PRIVATE_KEY environment variable"
Make sure you've created a `.env` file with your private key:
```env
PRIVATE_KEY=0x1234567890abcdef...
```

### "Connection refused"
Make sure the AnySpend server is running:
```bash
cd examples/typescript/fullstack/anyspend
pnpm dev:server
```

### "Insufficient funds" or "Insufficient allowance"
Make sure your wallet has:
1. Enough of the payment token (USDC, WETH, etc.)
2. Enough native token (ETH) for gas fees

Get testnet tokens from:
- Base Sepolia ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- USDC on Base Sepolia: Use a DEX or faucet

### Payment fails with "Transaction reverted"
Check that:
1. You have enough token balance
2. You have enough ETH for gas
3. The token address is correct for your network
4. The server is configured correctly

## Learn More

- [x402 Documentation](https://x402.org/docs)
- [x402-fetch Package](../../../../typescript/packages/x402-fetch)
- [AnySpend Server Example](../../fullstack/anyspend)
- [ERC-2612 Permit Standard](https://eips.ethereum.org/EIPS/eip-2612)

## Security Best Practices

1. **Never commit `.env` files** - Add `.env` to `.gitignore`
2. **Use testnet for development** - Only use mainnet when ready for production
3. **Keep private keys secure** - Never share or expose them
4. **Use environment variables** - Don't hardcode sensitive data
5. **Test with small amounts** - Start with testnet or small mainnet amounts

## License

Apache-2.0
