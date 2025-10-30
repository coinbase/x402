# x402 Discovery Example

This example demonstrates how to use the x402 discovery feature to find and list available x402-protected resources across the network.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd examples/typescript/discovery
```

2. Start the discovery example:
```bash
pnpm dev
```

## How It Works

The example demonstrates how to:
1. Use the x402 facilitator to discover available resources
2. List all x402-protected endpoints in the network
3. View detailed information about each resource including:
   - Resource URLs
   - Last update timestamps
   - Accepted payment methods
   - Resource metadata
   - Protocol versions

## Example Code

```typescript
import { useFacilitator } from "x402/verify";
import { facilitator } from "@coinbase/x402";

// No API keys required for discovery
const { list } = useFacilitator(facilitator);

list().then(response => {
  console.log('\nDiscovered X402 Resources:');
  console.log('========================\n');
  
  response.items.forEach((item, index) => {
    console.log(`Resource ${index + 1}:`);
    console.log(`  Resource URL: ${item.resource}`);
    console.log(`  Type: ${item.type}`);
    console.log(`  Last Updated: ${new Date(item.lastUpdated).toLocaleString()}`);
    console.log(`  X402 Version: ${item.x402Version}`);
    console.log(`  Accepts: ${JSON.stringify(item.accepts, null, 2)}`);
    if (item.metadata && Object.keys(item.metadata).length > 0) {
      console.log(`  Metadata: ${JSON.stringify(item.metadata, null, 2)}`);
    }
    console.log('------------------------\n');
  });
});
```

## Output Example

The script will output a formatted list of all discovered x402 resources, including their URLs, types, update times, and accepted payment methods. Example output:

```
Discovered X402 Resources:
========================

Resource 1:
  Resource URL: https://api.example.com/x402/endpoint
  Type: http
  Last Updated: 8/9/2025, 1:07:04 AM
  X402 Version: 1
  Accepts: [Payment Methods]
------------------------
```
