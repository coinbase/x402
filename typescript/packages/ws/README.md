# @x402/ws

WebSocket transport integration for the x402 payment protocol.

This package provides:

- `x402WSClient` for automatic payment handling over WebSocket requests
- `createWSPaymentWrapper` for server-side payment verification and settlement
- `x402WSServer` request dispatcher for `ws` servers

## Installation

```bash
npm install @x402/ws @x402/core ws
```

## Quick Start

### Server

```typescript
import { WebSocketServer } from "ws";
import { x402ResourceServer } from "@x402/core/server";
import { createWSPaymentWrapper, x402WSServer } from "@x402/ws";

const paidEcho = createWSPaymentWrapper(resourceServer, { accepts });

const wsServer = new WebSocketServer({ port: 4022 });
const app = new x402WSServer(wsServer)
  .registerHandler(
    "echo",
    paidEcho(async params => ({ message: params.message })),
  )
  .start();
```

### Client

```typescript
import WebSocket from "ws";
import { x402Client } from "@x402/core/client";
import { x402WSClient } from "@x402/ws";

const socket = new WebSocket("ws://localhost:4022");
const paymentClient = new x402Client().register("eip155:84532", schemeClient);
const client = new x402WSClient(socket, paymentClient, { autoPayment: true });

await client.waitForOpen();
const result = await client.call("echo", { message: "hello" });
```

## Real On-Chain Integration Tests

This package includes integration tests that perform real payment settlement over WebSocket transport:

- `test/integration/real-evm-payment.test.ts` (Base Sepolia, EVM)
- `test/integration/real-svm-payment.test.ts` (Solana Devnet, SVM)

### EVM test environment variables

- `X402_TEST_PRIVATE_KEY` - one shared private key used for both payer and facilitator (recommended for local testing)

or alternatively provide separate keys:

- `CLIENT_PRIVATE_KEY` - payer account private key (`0x...`)
- `FACILITATOR_PRIVATE_KEY` - facilitator signer private key (`0x...`)
- `BASE_SEPOLIA_RPC_URL` - optional custom Base Sepolia RPC URL

### SVM test environment variables

- `SVM_CLIENT_PRIVATE_KEY` - payer private key encoded as base58 bytes
- `SVM_FACILITATOR_PRIVATE_KEY` - facilitator private key encoded as base58 bytes
- `SVM_RESOURCE_SERVER_ADDRESS` - recipient Solana address that has a USDC Devnet ATA
- `SOLANA_DEVNET_RPC_URL` - optional custom Solana Devnet RPC URL

Run:

```bash
pnpm --filter @x402/ws test:integration
```

If required env vars are missing, the integration test is automatically skipped.
