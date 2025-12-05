# @x402/extensions

x402 Payment Protocol Extensions.

## Installation

```bash
pnpm install @x402/extensions
```

## Bazaar Discovery Extension

Enables facilitators to catalog and index x402-enabled resources by following server-declared discovery instructions.

### For Resource Servers

Declare endpoint discovery metadata in your payment middleware.

```typescript
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

// In resource configuration
const resources = {
  "GET /weather": {
    accepts: { scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: address },
    extensions: {
      ...declareDiscoveryExtension({
        input: { city: "San Francisco" },
        inputSchema: {
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        output: { example: { city: "San Francisco", weather: "foggy" } },
      }),
    },
  },
};
```

### For Facilitators

Extract discovery info from incoming payments:

```typescript
import { extractDiscoveryInfo } from "@x402/extensions/bazaar";

const discovered = extractDiscoveryInfo(paymentPayload, paymentRequirements);

if (discovered) {
  // { resourceUrl, method, x402Version, discoveryInfo }
}
```