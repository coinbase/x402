# x402 Demo Site

This is a [Next.js](https://nextjs.org) project that demonstrates the x402 payment protocol in action and showcases ecosystem builders. The demo site includes a modern UI and a facilitator backend that handles payment verification and settlement.

## Overview

x402 is an open protocol for internet-native payments built around the HTTP 402 status code. This demo site showcases how to implement x402 in a real-world application, demonstrating:

- Payment-gated content access
- Real-time payment verification
- Payment settlement
- Integration with EVM-compatible blockchains
- Integration with BTC Lightning via an LND-backed demo facilitator

## Features

- **Payment Middleware**: Protect routes with a simple middleware configuration
- **Facilitator Backend**: Handle payment verification and settlement
- **Lightning Demo Facilitator (LND)**: Verify and settle BOLT11 invoices on supported BTC Lightning networks
- **Live Demo**: Try out the payment flow with a protected route

## Getting Started

### Prerequisites

- Node.js 20+
- A wallet with testnet USDC (for testing)
- (Optional) Access to an LND node (regtest, signet, or mainnet) if you want to run the Lightning demo

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Configure your environment variables in `.env`:

```bash
NEXT_PUBLIC_FACILITATOR_URL=your_facilitator_url
RESOURCE_WALLET_ADDRESS=your_wallet_address
NETWORK=sepolia
PRIVATE_KEY=your_private_key
```

For the optional BTC Lightning (LND) demo facilitator, also set:

```bash
# LND REST endpoint (not exposed publicly)
LND_REST_URL=https://127.0.0.1:8080

# Hex-encoded macaroon with at least invoice read permissions
LND_MACAROON_HEX=your_hex_encoded_invoice_or_admin_macaroon

# Lightning network identifier matching your PaymentRequirements
# e.g. btc-lightning-signet or btc-lightning-mainnet
LIGHTNING_NETWORK=btc-lightning-signet
```

> ⚠️ **Security note:** For real deployments, keep your LND REST endpoint and macaroons private and use the least-privileged macaroon possible (e.g. invoice-only). These values should never be exposed to the browser.

### Running the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `/app` - Next.js application code
  - `/facilitator` - Payment facilitator API routes
  - `/protected` - Example protected route
- `/middleware.ts` - x402 payment middleware configuration
- `/ecosystem` - Directory of ecosystem builders

## How It Works

1. When a user tries to access a protected route, the middleware checks for a valid payment
2. If no payment is found, the server responds with HTTP 402
3. The client can then make a payment and retry the request
4. The facilitator backend verifies the payment and allows access

For EVM-based payments, the facilitator talks to the configured on-chain backend (e.g. via CDP) to verify and settle transactions. For BTC Lightning payments, the demo facilitator uses an LND REST backend to:

- Decode BOLT11 invoices and validate the amount during `/verify`
- Check invoice settlement status and amount paid during `/settle`

### Lightning / LND Demo Facilitator

The demo site includes experimental support for the `exact` scheme on BTC Lightning networks using an LND backend.

When the facilitator receives an `X-PAYMENT` header with:

- `scheme: "exact"`
- `network: "btc-lightning-signet"` (or another supported Lightning network)

it will:

1. Decode the BOLT11 invoice using LND (`/v1/payreq`)
2. On `/verify`, check that the invoice amount matches `maxAmountRequired`
3. On `/settle`, query the invoice status (`/v1/invoice/{payment_hash}`) and return success only when the invoice is fully settled and the amount paid is sufficient

This Lightning integration is intended as a demo and reference implementation. Production deployments should further harden configuration, logging, and error handling to match their security and reliability requirements.

## Adding Your Project to the Ecosystem

We welcome projects that are building with x402! To add your project to our ecosystem page, follow these steps:

1. Fork the repository
2. Create a new directory in `app/ecosystem/partners-data/[your-project-slug]`
3. Add your logo to `public/logos/`
4. Add your project's metadata in `metadata.json`:

```json
{
  "name": "Your Project Name",
  "description": "A brief description of your project and how it uses x402",
  "logoUrl": "/logos/your-logo.png",
  "websiteUrl": "https://your-project.com", // ideally pointing to somehwere to learn more about the x402 integration
  "category": "Client-Side Integrations" // Must match one of our categories: - `Client-Side Integrations`, `Services/Endpoints`, `Infrastructure & Tooling`, `Learning & Community Resources`
}
```

**For Facilitators, use this JSON template:**

```json
{
  "name": "Your Facilitator Name",
  "description": "A brief description of your facilitator service and supported networks",
  "logoUrl": "/logos/your-logo.png",
  "websiteUrl": "https://your-facilitator.com",
  "category": "Facilitators",
  "facilitator": {
    "baseUrl": "https://your-facilitator.com",
    "networks": ["base", "base-sepolia", "polygon", "solana"],
    "schemes": ["exact"],
    "assets": ["ERC20"],
    "supports": {
      "verify": true,
      "settle": true,
      "supported": true,
      "list": false
    }
  }
}
```

5. Submit a pull request

### Requirements by Category

#### Client-Side Integrations

- Must demonstrate a working integration with x402
- Should include a link to documentation, quickstart, or code examples
- Must be actively maintained

#### Services/Endpoints

- Must have a working mainnet integration
- Should include API documentation
- Should maintain 99% uptime

#### Infrastructure & Tooling

- Should include comprehensive documentation
- Should demonstrate clear value to the x402 ecosystem

#### Learning & Community Resources

- Must include a GitHub template or starter kit
- Should be shared on social media (Twitter/X, Discord, etc.)
- Must include clear setup instructions
- Should demonstrate a practical use case

#### Facilitators

- Must implement the x402 facilitator API specification
- Should support at least one payment scheme (e.g., "exact")
- Must provide working verify and/or settle endpoints
- Should maintain high uptime and reliability
- Must include comprehensive API documentation

### Review Process

1. Our team will review your submission within 5 business days
2. We may request additional information or changes
3. Once approved, your project will be added to the ecosystem page, and we'd love to do some co-marketing around your use case!

## Learn More

To learn more about the technologies used in this project:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [x402 Protocol Documentation](https://github.com/coinbase/x402) - learn about the x402 payment protocol
- [EVM Documentation](https://ethereum.org/en/developers/docs/) - learn about Ethereum Virtual Machine

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://github.com/coinbase/x402/blob/main/CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/coinbase/x402/blob/main/LICENSE) file for details.
