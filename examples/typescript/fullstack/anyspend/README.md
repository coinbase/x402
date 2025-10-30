# AnySpend Fullstack Example

A complete fullstack application demonstrating how to use the x402 payment protocol with a **remote facilitator** for blockchain payment verification and settlement.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  React Client   │────────▶│  Express Server │────────▶│ Remote          │
│  (Browser)      │         │  (Your Backend) │         │ Facilitator     │
│                 │         │                 │         │ (x402.org)      │
│ • Creates       │         │ • Receives      │         │                 │
│   payment       │         │   X-PAYMENT     │         │ • Verifies      │
│   header        │         │   header        │         │   signatures    │
│ • Signs with    │         │ • Calls remote  │         │ • Checks        │
│   private key   │         │   facilitator   │         │   balances      │
│ • Never sends   │         │ • No blockchain │         │ • Settles       │
│   key to server │         │   node needed   │         │   transactions  │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## Key Features

- **No Blockchain Infrastructure**: Server uses remote facilitator instead of running blockchain nodes
- **Gasless Payments**: Uses ERC-2612 permits for gas-free token approvals
- **Fast Verification**: Payment verification happens off-chain via remote facilitator
- **On-Chain Settlement**: Facilitator handles actual blockchain transactions
- **Secure**: Private keys never leave the browser

## What is a Remote Facilitator?

A remote facilitator is a service that handles blockchain operations on behalf of your application:

- **Verification**: Fast off-chain validation of payment signatures and balances
- **Settlement**: On-chain execution of approved transactions
- **No Infrastructure**: You don't need to run blockchain nodes or manage keys
- **Public & Free**: The default facilitator at `https://facilitator.x402.org` is open and free to use

## Project Structure

```
anyspend-fullstack/
├── apps/
│   ├── client/          # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── App.tsx       # Main React component
│   │   │   ├── App.css       # Styles
│   │   │   └── main.tsx      # Entry point
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── .env.example
│   │
│   └── server/          # Express backend
│       ├── index.ts          # Express app with x402 integration
│       ├── package.json
│       ├── tsconfig.json
│       └── .env.example
│
├── package.json         # Root workspace config
├── pnpm-workspace.yaml  # PNPM workspace definition
└── README.md
```

## Prerequisites

- Node.js 18+ and pnpm
- A wallet with USDC on Base Sepolia testnet
- (Optional) Your own facilitator instance

## Setup

### 1. Install Dependencies

From the root directory:

```bash
pnpm install
```

### 2. Configure Server

Create `apps/server/.env`:

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env`:

```env
PORT=3001

# Use the public remote facilitator (no auth required)
FACILITATOR_URL=https://facilitator.x402.org

# Or use your own facilitator
# FACILITATOR_URL=https://your-facilitator.example.com
# FACILITATOR_VERIFY_TOKEN=your-verify-token
# FACILITATOR_SETTLE_TOKEN=your-settle-token

# Payment configuration
NETWORK=base-sepolia
PAYMENT_AMOUNT=1000000  # 1 USDC (6 decimals)
PAYTO_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0

# For permit-based payments, specify the facilitator's execution address
FACILITATOR_ADDRESS=
```

### 3. Configure Client (Optional)

Create `apps/client/.env` if you want to use a different API URL:

```bash
cp apps/client/.env.example apps/client/.env
```

Edit `apps/client/.env`:

```env
VITE_API_URL=http://localhost:3001
```

## Running the Application

### Development Mode (Both Apps)

Start both client and server with hot reload:

```bash
pnpm dev
```

This will start:
- React client at `http://localhost:3000`
- Express server at `http://localhost:3001`

### Run Individually

**Server only:**
```bash
pnpm dev:server
```

**Client only:**
```bash
pnpm dev:client
```

## How It Works

### Client Flow (React)

1. **User enters private key** in the browser (never sent to server)
2. **Initial request** to `/api/premium` receives `402 Payment Required`
3. **Create payment header** using x402 client library
4. **Retry request** with `X-PAYMENT` header containing signed permit
5. **Receive premium content** after payment is verified and settled

### Server Flow (Express with Middleware)

The `paymentMiddleware` from `x402-express` automatically handles the entire payment flow:

1. **Receive request** without payment → middleware returns `402` with payment requirements
2. **Receive request** with `X-PAYMENT` header → middleware decodes payment payload
3. **Verify payment** → middleware calls remote facilitator (off-chain, fast)
4. **Execute route handler** → only if payment is valid
5. **Settle payment** → middleware handles settlement via remote facilitator (on-chain)
6. **Return response** → middleware adds `X-PAYMENT-RESPONSE` header with settlement details

Your route handler only runs after payment is verified and settled!

### Code Snippets

**Client: Creating Payment**
```typescript
import { createPaymentHeader } from 'x402/client';
import { createSignerSepolia } from 'x402/types/shared/evm';

// Create wallet from private key (stays in browser)
const wallet = createSignerSepolia(privateKey);

// Create payment header
const paymentHeader = await createPaymentHeader(
  wallet,
  1,  // nonce
  paymentRequirement
);

// Make request with payment
const response = await fetch('/api/premium', {
  method: 'POST',
  headers: { 'X-PAYMENT': paymentHeader }
});
```

**Server: Using Payment Middleware**
```typescript
import { paymentMiddleware } from 'x402-express';

// Apply payment middleware to protected routes
app.use(
  paymentMiddleware(
    "0xYourAddress", // your receiving wallet address
    {
      "POST /api/premium": {
        price: "$0.001",  // USDC amount in dollars
        network: "base-sepolia",
        config: {
          description: "Access to premium market analysis data",
          mimeType: "application/json",
        },
      },
    },
    {
      url: "https://facilitator.x402.org", // remote facilitator
    },
  ),
);

// Your route handler - payment already verified and settled by middleware
app.post("/api/premium", (req, res) => {
  res.json({ data: generatePremiumData() });
});
```

**Alternative: Manual Verification (Not Recommended)**

If you need more control, you can manually use the facilitator:

```typescript
import { useFacilitator } from 'x402/verify';
import { decodePayment } from 'x402/schemes/exact/evm';

// Configure remote facilitator
const facilitator = useFacilitator({
  url: 'https://facilitator.x402.org'
});

// Decode payment
const paymentPayload = decodePayment(paymentHeader);

// Verify with remote facilitator (fast, off-chain)
const verifyResult = await facilitator.verify(
  paymentPayload,
  PAYMENT_REQUIREMENTS
);

// Settle with remote facilitator (on-chain)
const settleResult = await facilitator.settle(
  paymentPayload,
  PAYMENT_REQUIREMENTS
);
```

## API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "facilitator": "https://facilitator.x402.org",
  "network": "base-sepolia"
}
```

### `GET /api/facilitator/supported`
Check what networks and schemes the facilitator supports.

### `GET /api/free`
Free endpoint that doesn't require payment.

### `POST /api/premium`
Premium endpoint that requires payment.

**Without payment:**
- Returns `402 Payment Required`
- Includes payment requirements in response

**With valid payment:**
- Returns `200 OK`
- Includes `X-PAYMENT-RESPONSE` header with settlement details
- Returns premium market analysis data

## Testing

1. Get Base Sepolia testnet ETH from a faucet
2. Get USDC on Base Sepolia (contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
3. Open `http://localhost:3000`
4. Enter your private key
5. Click "Get Premium Data (Pay 1 USDC)"
6. Watch the transaction log as payment is verified and settled

## Building for Production

```bash
pnpm build
```

This builds both apps:
- Server → `apps/server/dist/`
- Client → `apps/client/dist/`

## Environment Variables

### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server port |
| `FACILITATOR_URL` | No | `https://facilitator.x402.org` | Remote facilitator URL |
| `NETWORK` | No | `base-sepolia` | Blockchain network |
| `PAYMENT_AMOUNT_USD` | No | `$0.001` | Payment amount in USD |
| `PAYTO_ADDRESS` | Yes | - | Address to receive payments |

### Client

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3001` | Backend API URL |

## Security Notes

- Private keys are only used in the browser and never sent to the server
- The server only receives signed payment permits
- The remote facilitator verifies signatures and balances before settlement
- Use HTTPS in production for all communication

## Learn More

- [x402 Documentation](https://x402.org/docs)
- [ERC-2612 Permit Standard](https://eips.ethereum.org/EIPS/eip-2612)
- [Remote Facilitator API](https://x402.org/docs/facilitator)

## License

MIT
