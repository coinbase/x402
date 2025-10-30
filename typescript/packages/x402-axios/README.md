# x402-axios

A utility package that extends Axios to automatically handle 402 Payment Required responses using the x402 payment protocol. This package enables seamless integration of payment functionality into your applications when making HTTP requests with Axios.

## Installation

```bash
npm install x402-axios
```

## Quick Start

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor } from "x402-axios";
import axios from "axios";
import { baseSepolia } from "viem/chains";

// Create a wallet client
const account = privateKeyToAccount("0xYourPrivateKey");
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});

// Create an Axios instance with payment handling
const api = withPaymentInterceptor(
  axios.create({
    baseURL: "https://api.example.com",
  }),
  client
);

// Make a request that may require payment
const response = await api.get("/paid-endpoint");
console.log(response.data);
```

## Features

- Automatic handling of 402 Payment Required responses
- Automatic retry of requests with payment headers
- Payment verification and header generation
- Exposes payment response headers

## API

### `withPaymentInterceptor(axiosClient, walletClient, paymentRequirementsSelector?, config?, preferences?)`

Adds interceptors to an Axios instance to handle 402 Payment Required responses automatically.

#### Parameters

- `axiosClient`: The Axios instance to add the interceptor to
- `walletClient`: The wallet client used to sign payment messages (must implement the x402 wallet interface)
- `paymentRequirementsSelector`: Optional function to select payment requirements from the response
- `config`: Optional X402 configuration (e.g., custom RPC URLs)
- `preferences`: Optional payment preferences to specify preferred token and network

#### Returns

The modified Axios instance with payment interceptors that will:
1. Add payment preference headers to requests (if preferences specified)
2. Intercept 402 responses
3. Parse the payment requirements
4. Create a payment header using the provided wallet client
5. Retry the original request with the payment header
6. Expose the X-PAYMENT-RESPONSE header in the final response

### Payment Preferences

You can specify which token and network you want to pay with:

```typescript
import axios from "axios";
import { withPaymentInterceptor, createSigner, type PaymentPreferences } from "x402-axios";

const signer = await createSigner("base-sepolia", privateKey);

// Pay with WETH instead of USDC
const preferences: PaymentPreferences = {
  preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
  preferredNetwork: "base-sepolia"
};

const client = axios.create({ baseURL: "https://api.example.com" });
withPaymentInterceptor(client, signer, undefined, undefined, preferences);

// All requests with this client will use WETH
await client.get('/data');
```

See the [Anyspend Integration Guide](../../../ANYSPEND-INTEGRATION.md) for more details on multi-token and cross-chain payments.
