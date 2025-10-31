# @b3dotfun/anyspend-x402-fetch

AnySpend-enhanced fetch client for the x402 Payment Protocol. This package extends the native `fetch` API to automatically handle 402 Payment Required responses with multi-token and cross-chain payment support through the AnySpend facilitator.

## Installation

```bash
npm install @b3dotfun/anyspend-x402-fetch
```

## Quick Start

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@b3dotfun/anyspend-x402-fetch";
import { baseSepolia } from "viem/chains";

// Create a wallet client
const account = privateKeyToAccount("0xYourPrivateKey");
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});

// Wrap the fetch function with payment handling
const fetchWithPay = wrapFetchWithPayment(fetch, client);

// Make a request that may require payment
const response = await fetchWithPay("https://api.example.com/paid-endpoint", {
  method: "GET",
});

const data = await response.json();
```

## What Makes AnySpend Different?

Unlike standard x402 implementations, AnySpend x402 enables:

- ✨ **Multi-token payments** - Pay with various ERC-20 tokens, not just USDC
- 🌉 **Cross-chain payments** - Pay on one network while the server receives on another
- 🔄 **Automatic conversion** - Token swaps and bridging handled seamlessly by the facilitator
- 🎯 **Standard compatibility** - Works with standard x402 servers (no custom server code needed)

## API

### `wrapFetchWithPayment(fetch, walletClient, maxValue?, paymentRequirementsSelector?, config?, preferences?)`

Wraps the native fetch API to handle 402 Payment Required responses automatically.

#### Parameters

- `fetch`: The fetch function to wrap (typically `globalThis.fetch`)
- `walletClient`: The wallet client used to sign payment messages (must implement the x402 wallet interface)
- `maxValue`: Optional maximum allowed payment amount in base units (defaults to 0.1 USDC)
- `paymentRequirementsSelector`: Optional function to select payment requirements from the response (defaults to `selectPaymentRequirements`)
- `config`: Optional X402 configuration (e.g., custom RPC URLs)
- `preferences`: Optional payment preferences to specify preferred token and network

#### Returns

A wrapped fetch function that automatically handles 402 responses by:
1. Making the initial request (with optional payment preferences)
2. If a 402 response is received, parsing the payment requirements
3. Verifying the payment amount is within the allowed maximum
4. Creating a payment header using the provided wallet client
5. Retrying the request with the payment header

### Payment Preferences

You can specify which token and network you want to pay with:

```typescript
import { wrapFetchWithPayment, createSigner, type PaymentPreferences } from "@b3dotfun/anyspend-x402-fetch";

const signer = await createSigner("base-sepolia", privateKey);

// Pay with WETH instead of USDC
const preferences: PaymentPreferences = {
  preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
  preferredNetwork: "base-sepolia"
};

const fetchWithPayment = wrapFetchWithPayment(
  fetch,
  signer,
  undefined, // maxValue
  undefined, // paymentRequirementsSelector
  undefined, // config
  preferences
);

await fetchWithPayment('https://api.example.com/data');
```

### Supported Networks

AnySpend facilitator supports multiple networks:

- Base / Base Sepolia
- Ethereum / Ethereum Sepolia
- Arbitrum / Arbitrum Sepolia
- Optimism / Optimism Sepolia
- Polygon / Polygon Amoy

**Primary Settlement Token**: USDC across all supported networks

For the latest list of supported tokens and networks, query: `https://mainnet.anyspend.com/x402/supported`

## Example

```typescript
import { config } from "dotenv";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@b3dotfun/anyspend-x402-fetch";
import { baseSepolia } from "viem/chains";

config();

const { PRIVATE_KEY, API_URL } = process.env;

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});

const fetchWithPay = wrapFetchWithPayment(fetch, client);

// Make a request to a paid API endpoint
fetchWithPay(API_URL, {
  method: "GET",
})
  .then(async response => {
    const data = await response.json();
    console.log(data);
  })
  .catch(error => {
    console.error(error);
  });
```

## Related Packages

- [@b3dotfun/anyspend-x402](https://www.npmjs.com/package/@b3dotfun/anyspend-x402) - AnySpend facilitator configuration
- [@b3dotfun/anyspend-x402-express](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-express) - AnySpend Express middleware
- [x402](https://www.npmjs.com/package/x402) - Core x402 protocol implementation
- [x402-express](https://www.npmjs.com/package/x402-express) - Standard Coinbase x402 Express middleware
- [x402-hono](https://www.npmjs.com/package/x402-hono) - Hono middleware
- [x402-next](https://www.npmjs.com/package/x402-next) - Next.js middleware
- [x402-fetch](https://www.npmjs.com/package/x402-fetch) - Standard Coinbase x402 Fetch client
- [x402-axios](https://www.npmjs.com/package/x402-axios) - Client for Axios

## About x402

The x402 protocol is an open standard for HTTP-native payments. It enables:

- **Low fees**: No percentage-based fees, just network costs
- **Instant settlement**: ~2 second finality on supported networks
- **Micro-payments**: Accept payments as low as $0.001
- **Chain agnostic**: Works across multiple blockchain networks
- **Easy integration**: One line of code for servers, one function for clients

Learn more at [x402.org](https://x402.org)

## Resources

- [x402 Protocol](https://x402.org)
- [AnySpend GitHub](https://github.com/b3-fun/anyspend-x402)
- [AnySpend Facilitator](https://mainnet.anyspend.com/x402)
- [CDP Documentation](https://docs.cdp.coinbase.com)
- [CDP Discord](https://discord.com/invite/cdp)

## License

Apache-2.0

## Contributing

Contributions are welcome! This is an extended version of the Coinbase x402-fetch client with AnySpend ecosystem integration.

