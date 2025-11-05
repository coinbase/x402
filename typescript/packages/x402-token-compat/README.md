# @b3dotfun/anyspend-x402-token-compat

TypeScript/JavaScript client for checking ERC-20 token compatibility with EIP-2612 (Permit) and EIP-3009 (TransferWithAuthorization) standards.

## Features

- ✅ Check EIP-2612 (Permit) support for gasless approvals
- ✅ Check EIP-3009 (TransferWithAuthorization) support for gasless transfers
- ✅ Fetch complete token metadata (name, symbol, decimals, logo)
- ✅ List tokens by chain with filtering support
- ✅ Multi-chain support (Ethereum, Base, Polygon, Arbitrum, Optimism, BSC, Avalanche, B3, Abstract)
- ✅ TypeScript-first with full type safety
- ✅ Works in Node.js and browser environments
- ✅ Zero dependencies (except `zod` for validation)

## Installation

```bash
npm install @b3dotfun/anyspend-x402-token-compat
```

```bash
pnpm add @b3dotfun/anyspend-x402-token-compat
```

```bash
yarn add @b3dotfun/anyspend-x402-token-compat
```

## Quick Start

```typescript
import { TokenCompatClient } from "@b3dotfun/anyspend-x402-token-compat";

const client = new TokenCompatClient();

// Check if USDC on Base supports EIP-2612 (Permit)
const supportsPermit = await client.supportsEip2612(
  "base",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);

console.log("USDC supports Permit:", supportsPermit); // true

// Get full token metadata
const metadata = await client.getTokenMetadata(
  "base",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);

console.log(metadata);
// {
//   chainId: 8453,
//   tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
//   name: "USD Coin",
//   symbol: "USDC",
//   decimals: 6,
//   logoUrl: "https://...",
//   supportsEip2612: true,
//   supportsEip3009: true
// }
```

## API Reference

### TokenCompatClient

The main client for interacting with the token metadata API.

#### Constructor

```typescript
new TokenCompatClient(options?: TokenCompatOptions)
```

**Options:**

- `apiBaseUrl?: string` - Base URL for the API (default: `"https://tokens.anyspend.com"`)
- `timeout?: number` - Request timeout in milliseconds (default: `10000`)
- `fetch?: typeof fetch` - Custom fetch implementation (useful for Node.js < 18)

**Example:**

```typescript
const client = new TokenCompatClient({
  apiBaseUrl: "https://custom-api.example.com",
  timeout: 5000,
});
```

### Methods

#### getTokenMetadata

Fetch complete token metadata including EIP support information.

```typescript
getTokenMetadata(
  chain: ChainName | number,
  tokenAddress: string
): Promise<TokenMetadata>
```

**Parameters:**

- `chain` - Chain name (`"base"`, `"ethereum"`, etc.) or chain ID (`8453`, `1`, etc.)
- `tokenAddress` - Token contract address

**Returns:** `Promise<TokenMetadata>`

**Example:**

```typescript
const metadata = await client.getTokenMetadata(
  "base",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);

// Using chain ID
const metadata2 = await client.getTokenMetadata(
  8453,
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);
```

#### supportsEip2612

Check if a token supports EIP-2612 (Permit) for gasless approvals.

```typescript
supportsEip2612(
  chain: ChainName | number,
  tokenAddress: string
): Promise<boolean>
```

**Example:**

```typescript
const hasPermit = await client.supportsEip2612(
  "base",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);

if (hasPermit) {
  console.log("Token supports gasless approvals!");
}
```

#### supportsEip3009

Check if a token supports EIP-3009 (TransferWithAuthorization) for gasless transfers.

```typescript
supportsEip3009(
  chain: ChainName | number,
  tokenAddress: string
): Promise<boolean>
```

**Example:**

```typescript
const hasTransferAuth = await client.supportsEip3009(
  "base",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);

if (hasTransferAuth) {
  console.log("Token supports gasless transfers!");
}
```

#### getEipSupport

Get both EIP-2612 and EIP-3009 support status in a single call.

```typescript
getEipSupport(
  chain: ChainName | number,
  tokenAddress: string
): Promise<{
  supportsEip2612: boolean;
  supportsEip3009: boolean;
}>
```

**Example:**

```typescript
const support = await client.getEipSupport(
  "base",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);

console.log("EIP-2612:", support.supportsEip2612);
console.log("EIP-3009:", support.supportsEip3009);
```

#### listTokens

List tokens on a specific chain with optional filtering and pagination.

```typescript
listTokens(
  chain: ChainName | number,
  options?: TokenListOptions
): Promise<TokenListResponse>
```

**Options:**

- `limit?: number` - Number of tokens to return (default: `100`, max: `1000`)
- `offset?: number` - Number of tokens to skip (default: `0`)
- `eip2612?: boolean` - Filter for EIP-2612 compatible tokens
- `eip3009?: boolean` - Filter for EIP-3009 compatible tokens

**Example:**

```typescript
// Get first 50 tokens
const response = await client.listTokens("base", { limit: 50 });

console.log(`Found ${response.pagination.total} total tokens`);
console.log(`Returned ${response.pagination.returned} tokens`);

response.tokens.forEach((token) => {
  console.log(`${token.symbol}: ${token.name}`);
});

// Get next page
if (response.pagination.hasMore) {
  const nextPage = await client.listTokens("base", {
    limit: 50,
    offset: 50,
  });
}
```

#### listEip2612Tokens

List all tokens that support EIP-2612 (Permit) on a specific chain.

```typescript
listEip2612Tokens(
  chain: ChainName | number,
  options?: Omit<TokenListOptions, "eip2612" | "eip3009">
): Promise<TokenListResponse>
```

**Example:**

```typescript
// Get all tokens with Permit support on Base
const permitTokens = await client.listEip2612Tokens("base");

console.log(
  `Found ${permitTokens.pagination.total} tokens with Permit support`
);
```

#### listEip3009Tokens

List all tokens that support EIP-3009 (TransferWithAuthorization) on a specific chain.

```typescript
listEip3009Tokens(
  chain: ChainName | number,
  options?: Omit<TokenListOptions, "eip2612" | "eip3009">
): Promise<TokenListResponse>
```

**Example:**

```typescript
// Get all tokens with TransferWithAuthorization support
const transferAuthTokens = await client.listEip3009Tokens("base");
```

#### listFullyCompatibleTokens

List all tokens that support **both** EIP-2612 and EIP-3009 on a specific chain.

```typescript
listFullyCompatibleTokens(
  chain: ChainName | number,
  options?: Omit<TokenListOptions, "eip2612" | "eip3009">
): Promise<TokenListResponse>
```

**Example:**

```typescript
// Get all tokens that support both standards
const fullyCompatible = await client.listFullyCompatibleTokens("base");

fullyCompatible.tokens.forEach((token) => {
  console.log(
    `${token.symbol} supports both Permit and TransferWithAuthorization`
  );
});
```

#### getSupportedChains

Get list of all supported blockchain networks.

```typescript
getSupportedChains(): Promise<ChainInfo[]>
```

**Example:**

```typescript
const chains = await client.getSupportedChains();

chains.forEach((chain) => {
  console.log(`${chain.fullName} (${chain.name}): Chain ID ${chain.chainId}`);
  console.log(`  RPC Configured: ${chain.rpcConfigured}`);
});
```

### Static Methods

#### getChainName

Convert chain ID to chain name.

```typescript
static getChainName(chainId: number): ChainName | undefined
```

**Example:**

```typescript
const name = TokenCompatClient.getChainName(8453);
console.log(name); // "base"
```

#### getChainId

Convert chain name to chain ID.

```typescript
static getChainId(chainName: ChainName): number
```

**Example:**

```typescript
const id = TokenCompatClient.getChainId("base");
console.log(id); // 8453
```

## Types

### ChainName

Supported blockchain networks:

```typescript
type ChainName =
  | "ethereum"
  | "bsc"
  | "polygon"
  | "base"
  | "arbitrum"
  | "optimism"
  | "avalanche"
  | "b3"
  | "abstract";
```

### TokenMetadata

```typescript
interface TokenMetadata {
  chainId: number;
  tokenAddress: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
  supportsEip2612: boolean;
  supportsEip3009: boolean;
}
```

### TokenListResponse

```typescript
interface TokenListResponse {
  chain: string;
  chainId: number;
  filters: {
    eip2612?: boolean;
    eip3009?: boolean;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    hasMore: boolean;
  };
  tokens: TokenMetadata[];
}
```

### ChainInfo

```typescript
interface ChainInfo {
  name: string;
  chainId: number;
  fullName: string;
  rpcConfigured: boolean;
}
```

## Supported Chains

| Chain Name | Chain ID | Full Name         |
| ---------- | -------- | ----------------- |
| ethereum   | 1        | Ethereum          |
| bsc        | 56       | BNB Smart Chain   |
| polygon    | 137      | Polygon           |
| base       | 8453     | Base              |
| arbitrum   | 42161    | Arbitrum One      |
| optimism   | 10       | Optimism          |
| avalanche  | 43114    | Avalanche C-Chain |
| b3         | 1113     | B3                |
| abstract   | 2741     | Abstract          |

## Use Cases

### Gasless Approval Flow (EIP-2612)

```typescript
import { TokenCompatClient } from "@b3dotfun/anyspend-x402-token-compat";

async function setupGaslessApproval(tokenAddress: string) {
  const client = new TokenCompatClient();

  // Check if token supports Permit
  const hasPermit = await client.supportsEip2612("base", tokenAddress);

  if (hasPermit) {
    // Use permit() instead of approve()
    console.log("Using gasless permit signature");
    // ... implement permit logic
  } else {
    // Fall back to standard approval
    console.log("Using standard approve transaction");
    // ... implement approve logic
  }
}
```

### Gasless Transfer Flow (EIP-3009)

```typescript
async function setupGaslessTransfer(tokenAddress: string) {
  const client = new TokenCompatClient();

  const support = await client.getEipSupport("base", tokenAddress);

  if (support.supportsEip3009) {
    // Use transferWithAuthorization
    console.log("Using gasless transfer");
    // ... implement transfer with authorization
  } else {
    // Fall back to standard transfer
    console.log("Using standard transfer");
    // ... implement transfer logic
  }
}
```

### Token Discovery

```typescript
// Find all tokens that support gasless operations
const client = new TokenCompatClient();

// Get all fully compatible tokens
const tokens = await client.listFullyCompatibleTokens("base");

console.log(`Found ${tokens.pagination.total} fully compatible tokens`);

// Display token options to user
tokens.tokens.forEach((token) => {
  console.log(`${token.symbol} - ${token.name}`);
  console.log(`  Address: ${token.tokenAddress}`);
  console.log(`  Supports Permit: ✅`);
  console.log(`  Supports Transfer Auth: ✅`);
});
```

## Error Handling

The client throws `TokenCompatError` for all errors:

```typescript
import {
  TokenCompatClient,
  TokenCompatError,
} from "@b3dotfun/anyspend-x402-token-compat";

const client = new TokenCompatClient();

try {
  const metadata = await client.getTokenMetadata("base", "0x123");
} catch (error) {
  if (error instanceof TokenCompatError) {
    console.error("API Error:", error.message);
    console.error("Status Code:", error.statusCode);
    console.error("Response:", error.responseBody);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Node.js < 18 Support

For Node.js versions before 18, you need to provide a fetch implementation:

```typescript
import fetch from "node-fetch";
import { TokenCompatClient } from "@b3dotfun/anyspend-x402-token-compat";

const client = new TokenCompatClient({
  fetch: fetch as any,
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Apache-2.0

## Links

- [GitHub Repository](https://github.com/b3-fun/anyspend-x402)
- [Issue Tracker](https://github.com/b3-fun/anyspend-x402/issues)
- [NPM Package](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-token-compat)

## Related Packages

- [@b3dotfun/anyspend-x402](https://www.npmjs.com/package/@b3dotfun/anyspend-x402) - Core x402 protocol implementation
- [@b3dotfun/anyspend-x402-axios](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-axios) - Axios integration
- [@b3dotfun/anyspend-x402-fetch](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-fetch) - Fetch API integration
- [@b3dotfun/anyspend-x402-next](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-next) - Next.js integration
