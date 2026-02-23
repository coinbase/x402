# x402-observed Express Paywall Example

This example demonstrates the **complete payment flow** with:
- ✅ Full wallet integration (MetaMask, Coinbase Wallet)
- ✅ Real payments on Base Sepolia testnet
- ✅ Automatic workflow observability
- ✅ Transaction hash tracking
- ✅ Real-time dashboard updates

## What You'll Experience

1. **Click "Pay & Access" button**
2. **Wallet popup appears** (MetaMask/Coinbase Wallet)
3. **Approve payment** (0.001 USDC on testnet)
4. **See "Payment Successful"** message
5. **View complete workflow** in dashboard with transaction hash

## Prerequisites

### 1. Wallet Setup

Install a wallet extension:
- [MetaMask](https://metamask.io/)
- [Coinbase Wallet](https://www.coinbase.com/wallet)

### 2. Base Sepolia Testnet

Add Base Sepolia to your wallet:
- **Network Name:** Base Sepolia
- **RPC URL:** https://sepolia.base.org
- **Chain ID:** 84532
- **Currency Symbol:** ETH
- **Block Explorer:** https://sepolia.basescan.org

### 3. Testnet USDC

Get testnet USDC:
1. Get Sepolia ETH from [Sepolia Faucet](https://sepoliafaucet.com/)
2. Bridge to Base Sepolia at [Base Bridge](https://bridge.base.org/)
3. Get USDC from [Circle Faucet](https://faucet.circle.com/)

Or use the Coinbase Developer Platform faucet with your CDP API key.

## Quick Start

### 1. Install Dependencies

```bash
cd typescript/examples/express-paywall-example
pnpm install
```

### 2. Start the Server

```bash
pnpm dev
```

Server starts at http://localhost:3001

### 3. Start the Dashboard (separate terminal)

```bash
cd typescript/examples/express-paywall-example
npx x402-observed
```

Dashboard starts at http://localhost:4402

### 4. Test the Payment Flow

1. Open http://localhost:3001 in your browser
2. Connect your wallet to Base Sepolia
3. Click "Pay & Access Premium Content"
4. Approve the payment in your wallet
5. See "Payment Successful" message
6. Open http://localhost:4402 to see the complete workflow

## What Gets Logged

When you make a payment, the dashboard shows all 8 events:

1. **request_received** - Initial request arrives
2. **payment_required** - Server returns 402
3. **payment_header_received** - Payment signature received
4. **verify_called** - Verification starts
5. **verify_result** - Payment verified
6. **settle_called** - Settlement starts
7. **settle_result** - Payment settled (includes transaction hash!)
8. **workflow_completed** - Request completed with 200

## Endpoints

### Protected Endpoints (Require Payment)

**GET /api/premium** - $0.001 USDC
- Perfect for testing
- Low cost for quick iterations

**GET /api/exclusive** - $0.01 USDC
- Higher tier content
- Tests different price points

### Free Endpoints

**GET /** - Interactive demo page
- Wallet integration UI
- Payment buttons
- Real-time response display

**GET /health** - Health check
- No payment required
- Shows server status

## How It Works

### 1. Server-Side (Observability)

```typescript
import { paymentMiddleware } from "@x402-observed/express";

// This middleware:
// - Wraps original x402 middleware
// - Logs all events to SQLite
// - Preserves original behavior
app.use(paymentMiddleware(routes, server, undefined, paywall));
```

### 2. Client-Side (Wallet Integration)

The `@x402/paywall` package automatically:
- Detects 402 responses
- Shows wallet connection UI
- Handles payment signing
- Retries request with payment header

### 3. Payment Flow

```
Browser Request
    ↓
Server returns 402 with payment requirements
    ↓
Paywall UI appears
    ↓
User connects wallet
    ↓
User approves payment
    ↓
Payment signed and sent
    ↓
Server verifies payment
    ↓
Server settles payment on-chain
    ↓
Server returns 200 with content
    ↓
All events logged to SQLite
```

## Viewing the Dashboard

The dashboard shows:
- **Workflows Table** - All payment workflows
- **Event Timeline** - Complete event sequence
- **Transaction Details** - On-chain transaction hash
- **Real-time Updates** - Live event streaming

**Dashboard URL:** http://localhost:4402

## Database Inspection

View the SQLite database directly:

```bash
# View workflows
sqlite3 .x402-observed/events.db "SELECT * FROM workflows;"

# View events
sqlite3 .x402-observed/events.db "SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;"

# View transaction hashes
sqlite3 .x402-observed/events.db "SELECT data FROM events WHERE event_type = 'settle_result';"
```

## Troubleshooting

### Wallet popup doesn't appear

**Solutions:**
- Ensure wallet extension is installed
- Check you're on Base Sepolia testnet
- Refresh the page and try again
- Check browser console for errors

### "Insufficient funds" error

**Solutions:**
- Get testnet USDC from faucet
- Check you're on the correct network (Base Sepolia)
- Verify USDC balance in wallet

### Payment fails after approval

**Solutions:**
- Check facilitator is running
- Verify payee address is correct
- Check network connection
- View server logs for errors

### No workflows in dashboard

**Solutions:**
- Make at least one request first
- Check `.x402-observed/events.db` exists
- Verify dashboard is running on port 4402
- Check server logs for SQLite errors

## Configuration

### Environment Variables

```bash
# Server port
PORT=3001

# x402 Configuration
FACILITATOR_URL=https://facilitator.x402.org
EVM_NETWORK=eip155:84532
EVM_PAYEE_ADDRESS=0xYourAddressHere

# App Configuration
APP_NAME=Your App Name
APP_LOGO=/path/to/logo.png
```

### Supported Networks

This example uses Base Sepolia (eip155:84532), but x402 supports:
- **EVM Testnets:** Base Sepolia, Ethereum Sepolia, Polygon Mumbai
- **EVM Mainnets:** Base, Ethereum, Polygon, Arbitrum, Optimism
- **Solana:** Devnet, Mainnet
- **Aptos:** Testnet, Mainnet

## Testing Checklist

- [ ] Server starts without errors
- [ ] Frontend loads at http://localhost:3001
- [ ] Wallet connects to Base Sepolia
- [ ] Payment button triggers wallet popup
- [ ] Payment approval succeeds
- [ ] "Payment Successful" message appears
- [ ] Dashboard shows workflow at http://localhost:4402
- [ ] All 8 events are logged
- [ ] Transaction hash appears in settle_result
- [ ] Real-time updates work

## Next Steps

After testing:

1. ✅ Try different price points
2. ✅ Test with multiple wallets
3. ✅ Monitor dashboard for patterns
4. ✅ Inspect transaction hashes on block explorer
5. ✅ Test error scenarios (rejected payments, insufficient funds)
6. ✅ Integrate into your own application

## Learn More

- [x402 Documentation](https://docs.x402.org)
- [x402 Paywall Guide](https://docs.x402.org/paywall)
- [Base Sepolia Faucet](https://faucet.quicknode.com/base/sepolia)
- [Base Sepolia Explorer](https://sepolia.basescan.org)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. View server logs for errors
3. Check browser console for client-side errors
4. Inspect the SQLite database
5. Verify wallet and network configuration
