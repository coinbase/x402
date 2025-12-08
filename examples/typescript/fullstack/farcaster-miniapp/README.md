# x402 Farcaster Mini App Example

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-onchain --mini`](), configured with [MiniKit](https://docs.base.org/builderkits/minikit/overview) and [OnchainKit](https://www.base.org/builders/onchainkit). It demonstrates how to build a [Farcaster Mini App](https://miniapps.farcaster.xyz/) with x402 payment-protected API endpoints, showcasing seamless integration between Farcaster's social platform and x402's payment protocol.

## Features

- 🚀 **Farcaster Mini App**: Native-like app experience within Farcaster
- 💳 **x402 Payments**: Seamless payment processing on Base network
- 🔗 **Wallet Integration**: Connect with Coinbase Wallet via OnchainKit
- 🛡️ **Protected API Routes**: Server-side payment verification with x402 middleware
- 📱 **Responsive Design**: Optimized for mobile and desktop experiences
- 🔔 **Background Notifications**: Redis-backed notification system using Upstash
- 🎨 **Custom Theming**: Pixel font integration with Pixelify Sans and dark/light mode support

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Wallet**: OnchainKit, Coinbase Wallet, Wagmi
- **Payments**: x402 protocol with Base network
- **Farcaster**: Frame SDK for Mini App detection and integration
- **Notifications**: Redis/Upstash for background notifications

## Prerequisites

- Node.js 22+
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- Coinbase Wallet
- API keys (see Environment Setup)

## Getting Started

1. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

2. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install
pnpm build
cd fullstack/farcaster-miniapp
```

3. Copy environment variables:

```bash
cp env.example .env.local
```

4. Configure your environment variables (see Environment Setup below)

5. Start the development server:

```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) with your browser

## Environment Setup

Configure the following variables in your `.env.local`:

### Required Variables

```bash
# OnchainKit Configuration
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key_here
NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME=x402 Mini App

# x402 Payment Configuration
RESOURCE_WALLET_ADDRESS=0x0000000000000000000000000000000000000000
NETWORK=base-sepolia

# CDP Wallet Configuration (required for x402 base mainnet settlements)
CDP_API_KEY_ID=your_cdp_api_key_id_here
CDP_API_KEY_SECRET=your_cdp_api_key_secret_here
CDP_WALLET_SECRET=your_cdp_wallet_secret_here
```

### Farcaster Frame Configuration

You can regenerate the FARCASTER Account Association environment variables by running `npx create-onchain --manifest` in your project directory.

The environment variables enable the following features:

- Frame metadata - Sets up the Frame Embed that will be shown when you cast your frame
- Account association - Allows users to add your frame to their account, enables notifications
- Redis API keys - Enable Webhooks and background notifications for your application by storing users notification details

```bash
# Shared/OnchainKit variables
NEXT_PUBLIC_URL=
NEXT_PUBLIC_ICON_URL=

# Frame metadata
FARCASTER_HEADER=
FARCASTER_PAYLOAD=
FARCASTER_SIGNATURE=
NEXT_PUBLIC_APP_ICON=
NEXT_PUBLIC_APP_SUBTITLE=
NEXT_PUBLIC_APP_DESCRIPTION=
NEXT_PUBLIC_APP_SPLASH_IMAGE=
NEXT_PUBLIC_SPLASH_BACKGROUND_COLOR=
NEXT_PUBLIC_APP_PRIMARY_CATEGORY=
NEXT_PUBLIC_APP_HERO_IMAGE=
NEXT_PUBLIC_APP_TAGLINE=
NEXT_PUBLIC_APP_OG_TITLE=
NEXT_PUBLIC_APP_OG_DESCRIPTION=
NEXT_PUBLIC_APP_OG_IMAGE=

# Redis config
REDIS_URL=
REDIS_TOKEN=
```

### Getting API Keys

1. **CDP API Keys**: Get from [Coinbase Developer Platform](https://portal.cdp.coinbase.com/projects/overview)
2. **OnchainKit API Key**: Get from [OnchainKit](https://onchainkit.xyz)
3. **Resource Wallet Address**: Your wallet address to receive payments
4. **Network**: Use `base-sepolia` for testing, `base` for production

## How It Works

### Farcaster Mini App Integration

The app uses the Farcaster Frame SDK to detect when it's running within a Mini App context:

```typescript
import { sdk } from "@farcaster/frame-sdk";

// Initialize and detect Mini App context
await sdk.actions.ready();
const isInMiniApp = await sdk.isInMiniApp();
```

### x402 Payment Protection

The `/api/protected` endpoint is protected using x402 middleware:

```typescript
// middleware.ts
export const middleware = paymentMiddleware(
  payTo,
  {
    "/api/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Protected route",
      },
    },
  },
  facilitator,
);
```

### Client-Side Payment Handling

The frontend uses `x402-fetch` to automatically handle payments when calling protected endpoints:

```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);
const response = await fetchWithPayment("/api/protected");
```

## Template Features

### Frame Configuration

- `.well-known/farcaster.json` endpoint configured for Frame metadata and account association
- Frame metadata automatically added to page headers in `layout.tsx`

### Background Notifications

- Redis-backed notification system using Upstash
- Ready-to-use notification endpoints in `api/notify` and `api/webhook`
- Notification client utilities in `lib/notification-client.ts`

### Theming

- Custom theme defined in `theme.css` with OnchainKit variables
- Pixel font integration with Pixelify Sans
- Dark/light mode support through OnchainKit

### MiniKit Provider

The app is wrapped with `MiniKitProvider` in `providers.tsx`, configured with:

- OnchainKit integration
- Access to Frames context
- Sets up Wagmi Connectors
- Sets up Frame SDK listeners
- Applies Safe Area Insets

## Example Flow

1. **User opens the Mini App** in Farcaster
2. **Connect wallet** using OnchainKit's Wallet component
3. **Call protected API** - the app automatically:
   - Detects payment requirement (402 response)
   - Creates and signs payment transaction
   - Retries request with payment header
   - Receives protected content

## Response Format

### Payment Required (402)

```json
{
  "error": "X-PAYMENT header is required",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "resource": "http://localhost:3000/api/protected",
    "description": "Protected route",
    "payTo": "0xYourAddress",
    "maxTimeoutSeconds": 60
  }
}
```

### Successful Response

```json
{
  "message": "Protected content accessed successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Extending the Example

### Adding More Protected Routes

Update the middleware configuration:

```typescript
export const middleware = paymentMiddleware(
  payTo,
  {
    "/api/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Protected route",
      },
    },
    "/api/premium": {
      price: "$0.10",
      network,
      config: {
        description: "Premium content access",
      },
    },
  },
  facilitator,
);

export const config = {
  matcher: ["/api/protected", "/api/premium"],
  runtime: "nodejs",
};
```

### Customizing for Your Mini App

1. **Remove the DemoComponents**:
   - Delete `components/DemoComponents.tsx`
   - Remove demo-related imports from `page.tsx`

2. **Start building your Frame**:
   - Modify `page.tsx` to create your Frame UI
   - Update theme variables in `theme.css`
   - Adjust MiniKit configuration in `providers.tsx`

3. **Update the project name** in environment variables
4. **Modify the UI** to match your app's branding
5. **Add your own protected endpoints** following the x402 pattern
6. **Integrate with Farcaster data** using the Frame SDK
7. **Deploy to your domain** for Mini App distribution

8. **Add your frame to your account**:
   - Cast your frame to see it in action
   - Share your frame with others to start building your community

## Publishing Your Mini App

1. **Deploy your app** to a public domain
2. **Submit to Farcaster** for Mini App discovery
3. **Configure your domain** in the Farcaster Mini App settings
4. **Test the full flow** in the Farcaster app

## Resources

- [Farcaster Mini Apps Documentation](https://miniapps.farcaster.xyz/)
- [x402 Protocol Documentation](https://x402.com)
- [OnchainKit Documentation](https://onchainkit.xyz)
- [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
- [MiniKit Documentation](https://docs.base.org/builderkits/minikit/overview)
- [OnchainKit Documentation](https://docs.base.org/builderkits/onchainkit/getting-started)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
