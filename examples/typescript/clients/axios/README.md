# x402-axios Example Client

This is an example client that demonstrates how to use the `x402-axios` package to make HTTP requests to endpoints protected by the x402 payment protocol.

## Prerequisites

- Node.js (v20 or higher)
- A valid x402 facilitator (you can use the example express server at `examples/typescript/facilitator`)
- A valid x402 server (you can use the example express server at `examples/typescript/servers/express`)
- A valid Ethereum private key for making payments

## Setup

1. First, start the facilitator:

```bash
cd ../facilitator
# Ensure .env is setup
pnpm install
pnpm dev
```

2. First, start the example express server:
```bash
cd ../../servers/express
# Ensure .env is setup
pnpm install
pnpm dev
```
The server will run on http://localhost:3001

3. Create a `.env` file in the root directory with the following variables:
```env
RESOURCE_SERVER_URL=http://localhost:3001
PRIVATE_KEY=0xYourPrivateKey
ENDPOINT_PATH=/weather
```

4. In a new terminal, install and start the example client:
```bash
pnpm install
pnpm dev
```

## How It Works

The example demonstrates how to:
1. Create a wallet client using viem
2. Create an Axios instance with x402 payment handling
3. Make a request to a paid endpoint
4. Handle the response or any errors

## Example Code

```typescript
import { config } from "dotenv";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor } from "x402-axios";
import axios from "axios";
import { baseSepolia } from "viem/chains";

config();

const { RESOURCE_SERVER_URL, PRIVATE_KEY, ENDPOINT_PATH } = process.env;

// Create wallet client
const account = privateKeyToAccount(PRIVATE_KEY as "0x${string}");
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
}).extend(publicActions);

// Create Axios instance with payment handling
const api = withPaymentInterceptor(
  axios.create({
    baseURL: RESOURCE_SERVER_URL,
  }),
  client
);

// Make request to paid endpoint
api
  .get(ENDPOINT_PATH)
  .then(response => {
    console.log(response.headers);
    console.log(response.data);
  })
  .catch(error => {
    console.error(error.response?.data?.error);
  });
```
