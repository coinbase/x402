# @x402/core

Core implementation of the x402 payment protocol for TypeScript/JavaScript applications. This package provides transport-agnostic client, server, and facilitator components for implementing 402 Payment Required responses with digital payments.

## Installation

```bash
npm install @x402/core
```

## Overview

The x402 protocol enables micropayments for HTTP resources using cryptocurrency. This core package provides:

- **Client Components**: For making payment-enabled requests
- **Server Components**: For protecting resources with payment requirements  
- **Facilitator Integration**: For payment verification and settlement
- **HTTP Utilities**: For encoding/decoding payment headers
- **Type Definitions**: Full TypeScript support for v1 and v2 protocols

## Features

- 🚀 **Protocol v2 Support**: Latest x402 protocol with header-based payments
- 🔄 **Backwards Compatible**: Full support for v1 protocol
- 🎯 **Transport Agnostic**: Core logic separated from HTTP framework specifics
- 🔌 **Extensible**: Register custom payment schemes and networks
- 💼 **Multi-Facilitator**: Support for multiple facilitator services
- 📦 **Type Safe**: Complete TypeScript definitions

## Quick Start

### Client Usage

```typescript
import { x402HTTPClient } from '@x402/core/client';
import { EVMExactScheme } from '@x402/evm'; // Implementation package

// Create and configure client
const client = new x402HTTPClient();

// Register payment schemes for networks you support
client.registerScheme('eip155:8453', new EVMExactScheme({
  signer: wallet, // Your wallet/signer
}));

// Make a payment-enabled request
const response = await fetch('https://api.example.com/protected', {
  headers: {
    ...otherHeaders,
  }
});

if (response.status === 402) {
  // Extract payment requirements using getHeader function
  const paymentRequired = client.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    await response.json()
  );
  
  // Create payment payload
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  
  // Retry with payment
  const paidResponse = await fetch('https://api.example.com/protected', {
    headers: {
      ...otherHeaders,
      ...client.encodePaymentSignatureHeader(paymentPayload),
    }
  });
  
  // Get settlement confirmation
  const settleResponse = client.getPaymentSettleResponse((name) => paidResponse.headers.get(name));
  console.log('Payment settled:', settleResponse.transaction);
}
```

### Server Usage

```typescript
import { x402HTTPResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { EVMExactScheme } from '@x402/evm';

// Configure routes with payment requirements
const routes = {
  'GET /api/data': {
    scheme: 'exact',
    network: 'eip155:8453', // Base network
    payTo: '0xYourAddress',
    price: '$0.01', // or { amount: '10000', asset: 'USDC' }
    description: 'Premium data access',
    mimeType: 'application/json',
  },
  'POST /api/*': {
    scheme: 'exact',
    network: 'eip155:8453',
    payTo: '0xYourAddress', 
    price: '$0.05',
    maxTimeoutSeconds: 600,
  }
};

// Create server with facilitator
const facilitator = new HTTPFacilitatorClient({
  url: 'https://x402.org/facilitator',
});

const server = new x402HTTPResourceServer(routes, facilitator);

// Register supported schemes
server.registerScheme('eip155:8453', new EVMExactScheme());

// Initialize to fetch supported kinds from facilitator
await server.initialize();

// Process requests (framework-agnostic)
async function handleRequest(req: Request): Promise<Response> {
  const context = {
    adapter: createAdapter(req), // Your HTTP adapter
    path: req.path,
    method: req.method,
  };
  
  // Check if payment is required
  const paymentResponse = await server.processHTTPRequest(context);
  
  if (paymentResponse) {
    // Payment required - return 402 response
    return new Response(paymentResponse.body, {
      status: paymentResponse.status,
      headers: paymentResponse.headers,
    });
  }
  
  // Payment valid or not required - proceed with request
  const response = await handleProtectedResource(req);
  
  // Process settlement after successful response
  const settlementHeaders = await server.processSettlement(context, response.status);
  
  if (settlementHeaders) {
    Object.entries(settlementHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
  
  return response;
}
```

### Facilitator Usage

```typescript
import { x402Facilitator } from '@x402/core/facilitator';
import { EVMExactFacilitator } from '@x402/evm';

// Create facilitator instance
const facilitator = new x402Facilitator();

// Register scheme implementations
facilitator.registerScheme('eip155:8453', new EVMExactFacilitator({
  rpcUrl: 'https://base.infura.io/v3/YOUR_KEY',
}));

// Verify payment
const verifyResult = await facilitator.verify(
  client,
  paymentPayload,
  paymentRequirements
);

if (verifyResult.isValid) {
  // Settle payment
  const settleResult = await facilitator.settle(
    signer,
    paymentPayload,
    paymentRequirements
  );
  
  console.log('Transaction:', settleResult.transaction);
}
```

## API Reference

### Client Classes

#### `x402Client`

Base client for creating and managing payments.

**Methods:**
- `registerScheme(network: Network, client: SchemeNetworkClient)`: Register a payment scheme
- `registerSchemeV1(network: Network, client: SchemeNetworkClient)`: Register v1 scheme
- `selectPaymentRequirements(x402Version: number, requirements: PaymentRequirements[])`: Choose payment method
- `createPaymentPayload(x402Version: number, requirements: PaymentRequirements)`: Create payment

#### `x402HTTPClient` 

HTTP-specific client extending base client.

**Methods:**
- `encodePaymentSignatureHeader(payload: PaymentPayload)`: Create payment header
- `getPaymentRequiredResponse(getHeader: (name: string) => string | null | undefined, body?: PaymentRequired)`: Parse 402 response
- `getPaymentSettleResponse(getHeader: (name: string) => string | null | undefined)`: Extract settlement info

### Server Classes

#### `x402ResourceServer`

Core server for protecting resources with payments.

**Methods:**
- `registerScheme(network: Network, server: SchemeNetworkServer)`: Register scheme handler
- `initialize()`: Fetch supported payment types from facilitators
- `buildPaymentRequirements(config: ResourceConfig)`: Create payment requirements
- `verifyPayment(payload: PaymentPayload, requirements: PaymentRequirements)`: Verify payment
- `settlePayment(payload: PaymentPayload, requirements: PaymentRequirements)`: Settle payment

#### `x402HTTPResourceServer`

HTTP-enhanced server with routing and transport handling.

**Constructor:**
```typescript
new x402HTTPResourceServer(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[]
)
```

**Methods:**
- `processHTTPRequest(context: HTTPRequestContext, paywallConfig?: PaywallConfig)`: Handle HTTP request
- `processSettlement(context: HTTPRequestContext, responseStatus: number)`: Process settlement

### Facilitator Classes

#### `x402Facilitator`

Local facilitator for payment verification and settlement.

**Methods:**
- `registerScheme(network: Network, facilitator: SchemeNetworkFacilitator)`: Register handler
- `verify(client: any, payload: PaymentPayload, requirements: PaymentRequirements)`: Verify payment
- `settle(signer: any, payload: PaymentPayload, requirements: PaymentRequirements)`: Settle payment

#### `HTTPFacilitatorClient`

HTTP client for remote facilitator services.

**Constructor:**
```typescript
new HTTPFacilitatorClient({
  url?: string, // Default: https://x402.org/facilitator
  createAuthHeaders?: () => Promise<AuthHeaders>
})
```

### Types

#### Core Types

```typescript
type Network = `${string}:${string}`; // e.g., "eip155:8453"

type Price = string | number | {
  amount: string;
  asset: string;
  extra?: Record<string, any>;
};

type PaymentRequirements = {
  scheme: string;
  network: Network;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, any>;
};

type PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: Network;
  payload: Record<string, any>;
  accepted: PaymentRequirements;
  extensions?: Record<string, any>;
};

type PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: PaymentRequirements[];
  extensions?: Record<string, any>;
};
```

#### Implementation Interfaces

Implement these interfaces to add support for new payment schemes:

```typescript
interface SchemeNetworkClient {
  readonly scheme: string;
  createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements
  ): Promise<PaymentPayload>;
}

interface SchemeNetworkServer {
  readonly scheme: string;
  parsePrice(price: Price, network: Network): AssetAmount;
  enhancePaymentRequirements(
    requirements: PaymentRequirements,
    supportedKind: any,
    facilitatorExtensions: string[]
  ): Promise<PaymentRequirements>;
}

interface SchemeNetworkFacilitator {
  readonly scheme: string;
  verify(
    client: any,
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse>;
  settle(
    signer: any,
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse>;
}
```

## HTTP Headers

### v2 Protocol (Current)

- `PAYMENT-SIGNATURE`: Base64-encoded payment payload
- `PAYMENT-REQUIRED`: Base64-encoded payment requirements  
- `PAYMENT-RESPONSE`: Base64-encoded settlement response

### v1 Protocol (Legacy)

- `X-PAYMENT`: Base64-encoded payment payload
- `X-PAYMENT-RESPONSE`: Base64-encoded settlement response
- Payment requirements sent in response body

## Utilities

### HTTP Encoding/Decoding

```typescript
import {
  encodePaymentSignatureHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  decodePaymentResponseHeader
} from '@x402/core/http';
```

### Network Pattern Matching

The package supports network pattern matching for multi-chain support:

```typescript
// Register handler for all EIP-155 (EVM) networks
server.registerScheme('eip155:*', evmHandler);

// Specific network takes precedence
server.registerScheme('eip155:8453', baseHandler);
```

## Framework Integration

This core package is transport-agnostic. For framework-specific integrations, use:

- `@x402/express` - Express.js middleware
- `@x402/hono` - Hono middleware  
- `@x402/next` - Next.js integration
- `@x402/axios` - Axios interceptor
- `@x402/fetch` - Fetch wrapper

## Implementation Packages

For blockchain-specific implementations:

- `@x402/evm` - Ethereum and EVM-compatible chains
- `@x402/solana` - Solana blockchain

## Examples

See the [examples directory](https://github.com/coinbase/x402/tree/main/examples) for complete examples including:

- Basic client/server setup
- Multi-chain support
- Custom facilitator implementation
- Framework integrations
- Browser paywall UI

## Contributing

Contributions are welcome! Please see our [Contributing Guide](https://github.com/coinbase/x402/blob/main/CONTRIBUTING.md).

## Support

- [Documentation](https://x402.org/docs)
- [GitHub Issues](https://github.com/coinbase/x402/issues)
- [Discord Community](https://discord.gg/x402)
