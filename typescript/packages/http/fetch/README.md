# x402-fetch

A utility package that extends the native `fetch` API to automatically handle 402 Payment Required responses using the x402 payment protocol v2. This package enables seamless integration of payment functionality into your applications when making HTTP requests.

## Installation

```bash
npm install @x402/fetch
```

## Quick Start

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmClient } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

// Create an account
const account = privateKeyToAccount("0xYourPrivateKey");

// Wrap the fetch function with payment handling
const fetchWithPayment = wrapFetchWithPayment(fetch, {
  schemes: [
    {
      network: "eip155:8453", // Base Sepolia
      client: new ExactEvmClient(account),
    },
  ],
});

// Make a request that may require payment
const response = await fetchWithPayment("https://api.example.com/paid-endpoint", {
  method: "GET",
});

const data = await response.json();
```

## API

### `wrapFetchWithPayment(fetch, config)`

Wraps the native fetch API to handle 402 Payment Required responses automatically.

#### Parameters

- `fetch`: The fetch function to wrap (typically `globalThis.fetch`)
- `config`: Configuration object with the following properties:
  - `schemes`: Array of scheme registrations, each containing:
    - `network`: Network identifier (e.g., 'eip155:8453', 'solana:mainnet', 'eip155:*' for wildcards)
    - `client`: The scheme client implementation (e.g., `ExactEvmClient`, `SolanaExactScheme`)
    - `x402Version`: Optional protocol version (defaults to 2, set to 1 for legacy support)
  - `paymentRequirementsSelector`: Optional function to select payment requirements from multiple options

#### Returns

A wrapped fetch function that automatically handles 402 responses by:
1. Making the initial request
2. If a 402 response is received, parsing the payment requirements
3. Creating a payment header using the configured scheme client
4. Retrying the request with the payment header

## Examples

### Basic Usage with EVM

```typescript
import { config } from "dotenv";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmClient } from "@x402/evm";

config();

const { EVM_PRIVATE_KEY, API_URL } = process.env;

const account = privateKeyToAccount(EVM_PRIVATE_KEY as `0x${string}`);

const fetchWithPayment = wrapFetchWithPayment(fetch, {
  schemes: [
    {
      network: "eip155:*", // Support all EVM chains
      client: new ExactEvmClient(account),
    },
  ],
});

// Make a request to a paid API endpoint
fetchWithPayment(API_URL, {
  method: "GET",
})
  .then(async response => {
    const data = await response.json();
    
    // Optionally decode the payment response header
    const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
    if (paymentResponse) {
      const decoded = decodePaymentResponseHeader(paymentResponse);
      console.log("Payment details:", decoded);
    }
    
    console.log("Response data:", data);
  })
  .catch(error => {
    console.error(error);
  });
```

### Multi-Chain Support

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmClient } from "@x402/evm";
import { SolanaExactScheme } from "@x402/solana";

const fetchWithPayment = wrapFetchWithPayment(fetch, {
  schemes: [
    // EVM chains
    {
      network: "eip155:8453", // Base Sepolia
      client: new ExactEvmClient(evmAccount),
    },
    {
      network: "eip155:1", // Ethereum Mainnet with v1 protocol
      client: new ExactEvmClient(evmAccount),
      x402Version: 1, // Use legacy v1 protocol
    },
    // Solana
    {
      network: "solana:mainnet",
      client: new SolanaExactScheme(solanaWallet),
    },
  ],
});
```

### Custom Payment Requirements Selector

```typescript
import { wrapFetchWithPayment, type SelectPaymentRequirements } from "@x402/fetch";

// Custom selector that prefers the cheapest option
const selectCheapestOption: SelectPaymentRequirements = (version, accepts) => {
  if (!accepts || accepts.length === 0) {
    throw new Error("No payment options available");
  }
  
  // Sort by value and return the cheapest
  const sorted = [...accepts].sort((a, b) => 
    BigInt(a.value) - BigInt(b.value)
  );
  
  return sorted[0];
};

const fetchWithPayment = wrapFetchWithPayment(fetch, {
  schemes: [
    {
      network: "eip155:8453",
      client: new ExactEvmClient(account),
    },
  ],
  paymentRequirementsSelector: selectCheapestOption,
});
```

