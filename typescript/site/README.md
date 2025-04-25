# x402 Demo Site

This is a [Next.js](https://nextjs.org) project that demonstrates the x402 payment protocol in action. The demo site includes a modern UI and a facilitator backend that handles payment verification and settlement.

## Overview

x402 is an open protocol for internet-native payments built around the HTTP 402 status code. This demo site showcases how to implement x402 in a real-world application, demonstrating:

- Payment-gated content access
- Real-time payment verification
- Payment settlement
- Integration with EVM-compatible blockchains

## Features

- **Payment Middleware**: Protect routes with a simple middleware configuration
- **Facilitator Backend**: Handle payment verification and settlement
- **Live Demo**: Try out the payment flow with a protected route

## Getting Started

### Prerequisites

- Node.js 20+
- A wallet with testnet USDC (for testing)

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Configure your environment variables:
```bash
# In .env
NEXT_PUBLIC_FACILITATOR_URL=your_facilitator_url
RESOURCE_WALLET_ADDRESS=your_wallet_address
NETWORK=sepolia
PRIVATE_KEY=your_private_key
```

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

## How It Works

1. When a user tries to access a protected route, the middleware checks for a valid payment
2. If no payment is found, the server responds with HTTP 402
3. The client can then make a payment and retry the request
4. The facilitator backend verifies the payment and allows access

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

This project is licensed under the MIT License - see the [LICENSE.md](https://github.com/coinbase/x402/blob/main/LICENSE.md) file for details.
