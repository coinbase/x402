# Testing x402-observed Examples

## Current Status

⚠️ **The Next.js example has compatibility issues with better-sqlite3 and Next.js bundling.**

✅ **The Express example is fully functional and ready to test!**

## Recommended: Test with Express Example

The Express example at `typescript/examples/express-paywall-example/` is fully working with:
- Complete wallet integration (MetaMask/Coinbase Wallet)
- Payment flow on Base Sepolia testnet
- Automatic event logging to SQLite
- Beautiful interactive UI
- Real-time dashboard monitoring

### How to Run the Express Example

```bash
cd typescript/examples/express-paywall-example
pnpm install
pnpm dev
```

Then open http://localhost:3001 in your browser.

### What You'll See

1. **Interactive UI** with payment buttons
2. **Wallet popup** when you click "Pay & Access"
3. **Payment approval** in your wallet
4. **Success message** with protected content
5. **Complete workflow** logged to `.x402-observed/events.db`

### View the Dashboard

In a separate terminal:

```bash
cd typescript/examples/express-paywall-example
npx x402-observed
```

Then open http://localhost:4402 to see:
- All 8 events for each payment workflow
- Transaction hashes from settlements
- Real-time updates as payments occur
- Timing information for each step

## Next.js Example Issues

The Next.js example has the following technical challenges:

1. **better-sqlite3 Native Bindings** - Next.js bundler doesn't handle native Node modules well
2. **Edge Runtime Limitations** - Middleware runs in Edge runtime which doesn't support all Node.js APIs
3. **process.cwd() Undefined** - Path resolution fails during bundling

These are known limitations of using native Node modules in Next.js. The Express example demonstrates the full functionality without these constraints.

## Setup Requirements

Before testing, ensure you have:

1. **Wallet Extension** - MetaMask or Coinbase Wallet
2. **Base Sepolia Testnet** - Connected in your wallet
3. **Testnet USDC** - Get from a faucet
4. **Environment Variables** - Already configured in `.env` files

## API Endpoints (Express Example)

- **GET /** - Interactive demo UI
- **GET /api/premium** - $0.001 USDC (protected)
- **GET /api/exclusive** - $0.01 USDC (protected)
- **GET /health** - Free health check

## Complete Payment Flow

1. Click "Pay & Access" button
2. Wallet popup appears
3. Approve payment in wallet
4. Payment verified by facilitator
5. Payment settled on-chain
6. Protected content delivered
7. All 8 events logged to SQLite
8. View in dashboard with transaction hash

The Express example provides the complete, working demonstration of x402-observed! 🎉

