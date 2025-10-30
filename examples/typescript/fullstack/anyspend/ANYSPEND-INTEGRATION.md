# AnySpend Fullstack Integration Guide

Complete guide for integrating the x402 payment protocol with remote facilitator verification and automatic signature type detection.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Signature Types](#signature-types)
5. [Setup Instructions](#setup-instructions)
6. [Code Implementation](#code-implementation)
7. [API Reference](#api-reference)
8. [Testing](#testing)
9. [Security](#security)

---

## Overview

This fullstack application demonstrates how to use the x402 payment protocol with:

- **Remote Facilitator**: No blockchain infrastructure needed on your server
- **Automatic Signature Detection**: Supports both EIP-3009 and ERC-2612 signing
- **React + Express**: Modern fullstack TypeScript architecture
- **Gasless Payments**: User signs, facilitator pays gas

### Key Features

- ✅ No blockchain nodes required
- ✅ Automatic payment verification and settlement
- ✅ Support for multiple signature types
- ✅ Secure (private keys never leave browser)
- ✅ Fast off-chain verification
- ✅ On-chain settlement via facilitator

---

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
│ • Auto-detects  │         │ • No blockchain │         │ • Settles       │
│   signature     │         │   node needed   │         │   transactions  │
│   type          │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

### What is a Remote Facilitator?

A remote facilitator is a service that handles blockchain operations on behalf of your application:

- **Verification**: Fast off-chain validation of payment signatures and balances
- **Settlement**: On-chain execution of approved transactions
- **No Infrastructure**: You don't need to run blockchain nodes or manage keys
- **Public & Free**: The default facilitator at `https://facilitator.x402.org` is open and free to use

---

## Project Structure

```
anyspend/
├── apps/
│   ├── client/                    # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── App.tsx           # Main React component with payment logic
│   │   │   ├── App.css           # Styles
│   │   │   └── main.tsx          # Entry point
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── .env.example
│   │
│   └── server/                    # Express backend
│       ├── index.ts               # Express app with x402 integration
│       ├── package.json
│       ├── tsconfig.json
│       └── .env.example
│
├── ANYSPEND-INTEGRATION.md        # This file
├── SIGNATURE_TYPES.md             # Detailed signature type documentation
├── README.md                      # Quick start guide
└── package.json                   # Root workspace config
```

---

## Signature Types

The x402 protocol now supports **automatic detection and signing** of two EVM signature types:

1. **EIP-3009 TransferWithAuthorization** (default)
2. **ERC-2612 Permit**

### Quick Comparison

| Feature | Authorization (EIP-3009) | Permit (ERC-2612) |
|---------|--------------------------|-------------------|
| **Default** | ✅ Yes | ❌ No |
| **Payload Field** | `authorization` | `permit` |
| **Primary Type** | `TransferWithAuthorization` | `Permit` |
| **Nonce Type** | Random 32-byte hex | Sequential uint256 |
| **Nonce Source** | Client generates | Read from contract |
| **Time Validity** | `validAfter` + `validBefore` | `deadline` |
| **Parties** | `from` + `to` | `owner` + `spender` |
| **Settlement** | 1 transaction | 2 transactions |
| **Token Support** | USDC, USDT (limited) | Any ERC-2612 token |
| **Gas Cost** | Lower (1 tx) | Higher (2 txs) |

### EIP-3009: TransferWithAuthorization (Default)

**What it is:**
- USDC's native gasless transfer method
- One-step transfer: approval + transfer in single transaction
- Uses random nonce (32-byte hex)

**EIP-712 Structure:**
```typescript
{
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  domain: {
    name: "USD Coin",
    version: "2",
    chainId: 84532,
    verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  message: {
    from: "0x...",      // Payer
    to: "0x...",        // Receiver
    value: "1000000",   // 1 USDC
    validAfter: "...",  // Unix timestamp
    validBefore: "...", // Unix timestamp
    nonce: "0x...",     // Random 32-byte hex
  },
}
```

**Settlement:**
```solidity
USDC.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)
```

### ERC-2612: Permit

**What it is:**
- Standard ERC-20 permit extension
- Two-step: approval signature + separate transfer transaction
- Uses sequential nonce from contract

**EIP-712 Structure:**
```typescript
{
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  domain: {
    name: "MyToken",
    version: "1",
    chainId: 84532,
    verifyingContract: "0x...",
  },
  message: {
    owner: "0x...",     // Token owner
    spender: "0x...",   // Approved spender (facilitator)
    value: "1000000",   // Amount
    nonce: "5",         // Sequential nonce from contract
    deadline: "...",    // Unix timestamp
  },
}
```

**Settlement:**
```solidity
// Step 1: Redeem permit
Token.permit(owner, spender, value, deadline, v, r, s);

// Step 2: Transfer tokens
Token.transferFrom(owner, receiver, value);
```

---

## Setup Instructions

### Prerequisites

- Node.js 18+ and pnpm
- A wallet with USDC on Base Sepolia testnet
- (Optional) Your own facilitator instance

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
PAYMENT_AMOUNT_USD=$0.001
PAYTO_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
```

### 3. Configure Client (Optional)

Create `apps/client/.env`:

```bash
cp apps/client/.env.example apps/client/.env
```

Edit `apps/client/.env`:

```env
VITE_API_URL=http://localhost:3001
```

### 4. Run the Application

Start both client and server:

```bash
pnpm dev
```

This will start:
- React client at `http://localhost:3000`
- Express server at `http://localhost:3001`

**Or run individually:**

```bash
pnpm dev:server  # Server only
pnpm dev:client  # Client only
```

---

## Code Implementation

### Server Implementation

**File:** `apps/server/index.ts`

```typescript
import express, { Request, Response } from "express";
import { paymentMiddleware } from "x402-express";
import { Address } from "viem";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const PAYTO_ADDRESS = process.env.PAYTO_ADDRESS as Address;
const NETWORK = process.env.NETWORK || "base-sepolia";
const PAYMENT_AMOUNT_USD = process.env.PAYMENT_AMOUNT_USD || "$0.001";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.x402.org";

// Apply payment middleware to protected routes
app.use(
  paymentMiddleware(
    PAYTO_ADDRESS,
    {
      "POST /api/premium": {
        price: PAYMENT_AMOUNT_USD,
        network: NETWORK,
        config: {
          description: "Access to premium market analysis data",
          mimeType: "application/json",

          // Optional: Specify signature type
          // signatureType: "authorization", // EIP-3009 (default)
          // signatureType: "permit",        // ERC-2612
        },
      },
    },
    {
      url: FACILITATOR_URL,
    },
  ),
);

// Free endpoint (no payment required)
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    facilitator: FACILITATOR_URL,
    network: NETWORK,
  });
});

// Protected endpoint (requires payment)
// Payment middleware handles verification and settlement automatically
app.post("/api/premium", (req: Request, res: Response) => {
  console.log("✅ Payment verified and settled - generating premium data");

  return res.json({
    success: true,
    data: generatePremiumData(),
  });
});

function generatePremiumData() {
  return {
    marketAnalysis: {
      trend: "bullish",
      confidence: 0.87,
      timeframe: "30d",
      signals: ["Strong institutional buying detected", "..."],
    },
    predictions: {
      btc: { price: "$95,000", change: "+5.5%", timeframe: "7d" },
      eth: { price: "$3,200", change: "+6.7%", timeframe: "7d" },
    },
    timestamp: new Date().toISOString(),
  };
}

app.listen(3001, () => {
  console.log("🚀 Server running on http://localhost:3001");
});
```

### Client Implementation

**File:** `apps/client/src/App.tsx`

```typescript
import { useState } from 'react';
import { wrapFetchWithPayment, decodeXPaymentResponse, createSigner } from 'x402-fetch';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MAX_PAYMENT_VALUE = BigInt(1 * 10 ** 6); // 1 USDC max
const NETWORK = 'base-sepolia';

function App() {
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [premiumData, setPremiumData] = useState<any>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `${timestamp}: ${message}`]);
  };

  const fetchPremiumData = async () => {
    if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
      setError('Invalid private key');
      return;
    }

    setLoading(true);
    setLogs([]);
    setError(null);
    setPaymentInfo(null);
    setPremiumData(null);

    try {
      addLog('🔐 Creating wallet from private key...');
      const wallet = createSigner(NETWORK, privateKey);
      addLog(`Wallet address: ${wallet.account.address}`);

      addLog('🔧 Setting up payment-enabled fetch...');
      // Wrap fetch with automatic payment handling
      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        wallet,
        MAX_PAYMENT_VALUE,
      );

      addLog('📡 Making request (payment handled automatically)...');

      // Make request - wrapFetchWithPayment handles 402 and payment automatically
      const response = await fetchWithPayment(`${API_BASE_URL}/api/premium`, {
        method: 'POST'
      });

      addLog(`Server responded with status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Request failed');
      }

      // Get payment response header if present
      const paymentResponseHeader = response.headers.get('X-PAYMENT-RESPONSE');
      if (paymentResponseHeader) {
        const paymentInfo = decodeXPaymentResponse(paymentResponseHeader);
        addLog(`✅ Payment ${paymentInfo.success ? 'settled' : 'verified'}`);
        if (paymentInfo.transaction) {
          addLog(`Transaction: ${paymentInfo.transaction}`);
        }
        setPaymentInfo({
          status: paymentInfo.success ? 'settled' : 'verified',
          payer: paymentInfo.payer,
          transaction: paymentInfo.transaction,
          network: paymentInfo.network,
        });
      }

      // Get the response data
      const data = await response.json();
      addLog('🎉 Premium content received!');
      setPremiumData(data.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog(`❌ Error: ${message}`);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>AnySpend Fullstack Demo</h1>

      <input
        type="password"
        value={privateKey}
        onChange={(e) => setPrivateKey(e.target.value)}
        placeholder="0x..."
      />

      <button onClick={fetchPremiumData} disabled={loading}>
        {loading ? 'Processing...' : 'Get Premium Data (Pay 1 USDC)'}
      </button>

      {/* Display logs, errors, payment info, and premium data */}
    </div>
  );
}

export default App;
```

### How Automatic Signature Detection Works

#### 1. Server Creates Payment Requirements

**File:** `x402-express/src/index.ts`

```typescript
// Server creates payment requirements
if (SupportedEVMNetworks.includes(network)) {
  paymentRequirements.push({
    scheme: "exact",
    network,
    maxAmountRequired,
    asset: getAddress(asset.address),
    extra: {
      ...(asset as ERC20TokenAmount["asset"]).eip712,
      // Include signatureType if specified (backward compatible)
      ...(signatureType && { signatureType }),
    },
  });
}
```

#### 2. Client Auto-Detects Signature Type

**File:** `x402/src/client/createPaymentHeader.ts`

```typescript
export async function createPaymentHeader(
  client: Signer,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  if (paymentRequirements.scheme === "exact") {
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      // Auto-detect signature type (defaults to "authorization")
      const signatureType = paymentRequirements.extra?.signatureType || "authorization";

      if (signatureType === "permit") {
        // Use ERC-2612 Permit flow
        return await createPermitPaymentHeaderExactEVM(
          client,
          x402Version,
          paymentRequirements,
        );
      } else {
        // Use EIP-3009 Authorization flow (default)
        return await createPaymentHeaderExactEVM(
          client,
          x402Version,
          paymentRequirements,
        );
      }
    }
  }
}
```

#### 3. Authorization Signing (EIP-3009)

**File:** `x402/src/schemes/exact/evm/client.ts`

```typescript
// Creates authorization payload with random nonce
function preparePaymentHeader(from, x402Version, paymentRequirements) {
  const nonce = createNonce(); // Random 32-byte hex

  return {
    x402Version,
    scheme: "exact",
    network,
    payload: {
      signature: undefined,
      authorization: {  // ← Key field: "authorization"
        from,
        to: paymentRequirements.payTo,
        value: paymentRequirements.maxAmountRequired,
        validAfter: (now - 600).toString(),
        validBefore: (now + timeout).toString(),
        nonce,
      },
    },
  };
}

// Signs with EIP-712
async function signAuthorization(client, authorization, paymentRequirements) {
  const signature = await client.signTypedData({
    types: authorizationTypes,
    domain: {
      name: paymentRequirements.extra?.name,
      version: paymentRequirements.extra?.version,
      chainId,
      verifyingContract: paymentRequirements.asset,
    },
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  return { signature };
}
```

#### 4. Permit Signing (ERC-2612)

**File:** `x402/src/schemes/exact/evm/permit-client.ts`

```typescript
// Creates permit payload with sequential nonce from contract
async function createPermitPayment(client, x402Version, paymentRequirements) {
  const owner = client.account.address;

  // Query current nonce from token contract
  const nonce = await getPermitNonce(client, paymentRequirements.asset, owner);

  return {
    x402Version,
    scheme: "exact",
    network,
    payload: {
      signature: undefined,
      permit: {  // ← Key field: "permit"
        owner,
        spender: paymentRequirements.extra?.facilitatorAddress || paymentRequirements.payTo,
        value: paymentRequirements.maxAmountRequired,
        nonce,  // Sequential from contract
        deadline: (now + timeout).toString(),
        domain: {
          name: paymentRequirements.extra?.name,
          version: paymentRequirements.extra?.version,
          chainId,
          verifyingContract: paymentRequirements.asset,
        },
      },
    },
  };
}

// Signs with EIP-712
async function signPermit(client, permit) {
  const signature = await client.signTypedData({
    types: permitTypes,
    domain: permit.domain,
    primaryType: "Permit",
    message: {
      owner: permit.owner,
      spender: permit.spender,
      value: permit.value,
      nonce: permit.nonce,
      deadline: permit.deadline,
    },
  });

  return { signature };
}
```

---

## API Reference

### Server Endpoints

#### `GET /health`
Health check endpoint (free, no payment required)

**Response:**
```json
{
  "status": "healthy",
  "facilitator": "https://facilitator.x402.org",
  "network": "base-sepolia"
}
```

#### `GET /api/free`
Free endpoint that doesn't require payment

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "This is a free endpoint",
    "timestamp": "2025-10-30T..."
  }
}
```

#### `POST /api/premium`
Premium endpoint that requires payment

**Without Payment:**
- Returns `402 Payment Required`
- Includes payment requirements in response

**With Valid Payment:**
- Returns `200 OK`
- Includes `X-PAYMENT-RESPONSE` header with settlement details
- Returns premium market analysis data

**Response:**
```json
{
  "success": true,
  "data": {
    "marketAnalysis": { ... },
    "predictions": { ... },
    "recommendations": [ ... ],
    "whaleActivity": { ... },
    "timestamp": "2025-10-30T..."
  }
}
```

### Payment Middleware Configuration

```typescript
paymentMiddleware(
  payToAddress: Address | SolanaAddress,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
)
```

**Parameters:**

- `payToAddress`: Your receiving wallet address
- `routes`: Route configurations with payment requirements
- `facilitator`: Optional facilitator configuration
- `paywall`: Optional paywall UI configuration

**Route Configuration:**

```typescript
interface RouteConfig {
  price: Money | ERC20TokenAmount | SPLTokenAmount;
  network: Network;
  config?: {
    description?: string;
    mimeType?: string;
    maxTimeoutSeconds?: number;
    signatureType?: "authorization" | "permit";
    // ... other options
  };
}
```

---

## Testing

### 1. Get Testnet Tokens

1. Get Base Sepolia testnet ETH from a faucet
2. Get USDC on Base Sepolia:
   - Contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - Use a faucet or bridge

### 2. Test Authorization Flow (Default)

**Server:**
```typescript
config: {
  signatureType: "authorization", // or omit for default
}
```

**Client:**
Automatically uses EIP-3009

### 3. Test Permit Flow

**Server:**
```typescript
config: {
  signatureType: "permit",
}
```

**Client:**
Automatically uses ERC-2612

### 4. Manual Testing

1. Open `http://localhost:3000`
2. Enter your private key
3. Click "Get Premium Data (Pay 1 USDC)"
4. Watch the transaction log:
   - ✅ Wallet created
   - ✅ Payment header created
   - ✅ Request sent with payment
   - ✅ Payment verified
   - ✅ Payment settled
   - ✅ Premium content received

---

## Security

### Best Practices

1. **Private Keys**
   - Private keys are only used in the browser
   - Never sent to the server
   - Only signed messages are transmitted

2. **HTTPS**
   - Use HTTPS in production for all communication
   - Prevents man-in-the-middle attacks

3. **Environment Variables**
   - Never commit `.env` files
   - Use `.env.example` as templates
   - Keep facilitator tokens secure

4. **Payment Verification**
   - Server always verifies payments via facilitator
   - Don't trust client-side payment status
   - Verify before granting access to protected resources

5. **Amount Validation**
   - Set maximum payment limits
   - Validate amounts match expectations
   - Check payment requirements carefully

### Security Notes

- ✅ Private keys never leave the browser
- ✅ Server only receives signed payment permits
- ✅ Remote facilitator verifies signatures and balances
- ✅ Settlement happens on-chain with verifiable transactions
- ✅ Backward compatible - existing code continues to work

---

## Backward Compatibility

The implementation is **fully backward compatible**:

1. **No breaking changes**: Existing code works without modification
2. **Optional field**: `signatureType` is optional in `PaymentMiddlewareConfig`
3. **Default behavior**: Defaults to `"authorization"` when not specified
4. **Client fallback**: Client defaults to authorization if server doesn't specify

### Migration Path

**Existing code (still works):**
```typescript
app.use(paymentMiddleware(payTo, {
  "/api/premium": {
    price: "$0.001",
    network: "base-sepolia",
  }
}));
```

**New code (with explicit signature type):**
```typescript
app.use(paymentMiddleware(payTo, {
  "/api/premium": {
    price: "$0.001",
    network: "base-sepolia",
    config: {
      signatureType: "permit", // Now use permit!
    }
  }
}));
```

---

## Implementation Files Reference

Core implementation files for signature type detection:

- **Schema**: `x402/src/types/verify/x402Specs.ts` - Added `evmSignatureTypes` and `EvmExtraSchema`
- **Auto-detection**: `x402/src/client/createPaymentHeader.ts` - Routes to correct signing method
- **Authorization**: `x402/src/schemes/exact/evm/client.ts` - EIP-3009 implementation
- **Permit**: `x402/src/schemes/exact/evm/permit-client.ts` - ERC-2612 implementation
- **Middleware Config**: `x402/src/types/shared/middleware.ts` - Added `signatureType` to config
- **Express Middleware**: `x402-express/src/index.ts` - Passes `signatureType` to client

---

## Environment Variables

### Server (`apps/server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server port |
| `FACILITATOR_URL` | No | `https://facilitator.x402.org` | Remote facilitator URL |
| `NETWORK` | No | `base-sepolia` | Blockchain network |
| `PAYMENT_AMOUNT_USD` | No | `$0.001` | Payment amount in USD |
| `PAYTO_ADDRESS` | Yes | - | Address to receive payments |

### Client (`apps/client/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3001` | Backend API URL |

---

## Building for Production

Build both apps:

```bash
pnpm build
```

This creates:
- Server → `apps/server/dist/`
- Client → `apps/client/dist/`

Deploy:
- Server: Deploy to any Node.js hosting (Vercel, Railway, etc.)
- Client: Deploy to static hosting (Vercel, Netlify, Cloudflare Pages, etc.)

---

## Learn More

- [x402 Documentation](https://x402.org/docs)
- [EIP-3009 Standard](https://eips.ethereum.org/EIPS/eip-3009)
- [ERC-2612 Permit Standard](https://eips.ethereum.org/EIPS/eip-2612)
- [Remote Facilitator API](https://x402.org/docs/facilitator)
- [Base Sepolia Network](https://docs.base.org/network-information)

---

## License

MIT
