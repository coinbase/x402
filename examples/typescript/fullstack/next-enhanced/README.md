# x402 Payment Demo App

A demo to show implementation of the x402-react-client package

## Features

- **Random Number Generator** - JSON response ($0.01)
- **Inspirational Quotes** - JSON response with data ($0.05)
- **AI Content Generation** - POST request with body ($0.10)
- **File Downloads** - Blob response type ($0.25)
- **Live Streaming** - ReadableStream response ($0.15)

## Quick Start

### 1. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` or `env` as you deem fit bro:

```bash
cp .env.example .env.local
```

Fill in your credentials:

```env
X402_WALLET_ADDRESS=0x...  # Your wallet address (seller, recipient of the x402 payment)
NEXT_PUBLIC_WC_PROJECT_ID=...  # Get from cloud.walletconnect.com
```

### 3. Run Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
.
├── app/
│   ├── layout.tsx              # Root layout with X402Provider
│   ├── page.tsx                # Homepage with demo cards
│   ├── globals.css             # Global styles
│   ├── random/
│   │   └── page.tsx            # Random number demo
│   ├── quote/
│   │   └── page.tsx            # Quote demo
│   ├── generate/
│   │   └── page.tsx            # AI generation demo
│   ├── download/
│   │   └── page.tsx            # File download demo
│   ├── stream/
│   │   └── page.tsx            # Streaming demo
│   └── api/
│       ├── random/route.ts     # Random number API
│       ├── quote/route.ts      # Quote API
│       ├── generate/route.ts   # Generate API
│       ├── download/route.ts   # Download API
│       └── stream/route.ts     # Stream API
└── proxy.ts               # x402 payment middleware
```

## API Endpoints

All endpoints are protected by x402 payment middleware:

- `GET /api/random` - Generate random number ($0.01)
- `GET /api/quote` - Get inspirational quote ($0.05)
- `POST /api/generate` - Generate AI content ($0.10)
- `GET /api/download` - Download file ($0.25)
- `GET /api/stream` - Stream data ($0.15)
