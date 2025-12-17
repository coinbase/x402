# Bazaar Discovery Extension

The x402 Bazaar is the discovery layer for the x402 ecosystem - a machine-readable catalog that helps developers and AI agents find and integrate with x402-compatible API endpoints. Think of it as a search index for payable APIs, enabling the autonomous discovery and consumption of services.

> **Early Development Notice**
>
> The x402 Bazaar is in early development. While our vision is to build the "Google for agentic endpoints," we're currently more like "Yahoo search" - functional but evolving. Features and APIs may change as we gather feedback and expand capabilities.

---

## Overview

The Bazaar solves a critical problem in the x402 ecosystem: **discoverability**. Without it, x402-compatible endpoints are like hidden stalls in a vast market. The Bazaar provides:

* **For Buyers (API Consumers)**: Programmatically discover available x402-enabled services, understand their capabilities, pricing, and schemas
* **For Sellers (API Providers)**: Automatic visibility for your x402-enabled services to a global audience of developers and AI agents
* **For AI Agents**: Dynamic service discovery without pre-baked integrations - query, find, pay, and use

---

## How It Works

The Bazaar currently provides a simple `/list` endpoint that returns all x402-compatible services registered with the CDP facilitator. Services are automatically opted-in when they use the CDP facilitator and enable the bazaar extension, making discovery frictionless for sellers.

**Note:** While a discovery layer is live today for the CDP Facilitator, the spec for the marketplace items is open and part of the x402 scheme, meaning any facilitator can create their own discovery layer.

### Basic Flow

1. **Discovery**: Clients query the `/list` endpoint to find available services
2. **Selection**: Choose a service based on price, capabilities, and requirements
3. **Execution**: Use x402 to pay for and access the selected service
4. **No Manual Setup**: No API keys, no account creation, just discover and pay

---

## Extension Configuration

The Bazaar is implemented as an x402 extension, which means it's opt-in and configurable. You can enable it globally or per-route.

### Global Configuration

Apply bazaar discovery to all routes:

```typescript
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar } from "@x402/extensions";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  facilitator: { url: "https://x402.org/facilitator" },
  extensions: [
    bazaar({
      discoverable: true,
      category: "weather"
    })
  ],
  routes: {
    "/api/weather": {
      network: "eip155:84532",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
```

### Per-Route Configuration

Override settings for specific routes:

```typescript
routes: {
  "/api/weather": {
    network: "eip155:84532",
    scheme: exact({ amount: "$0.001" }),
    extensions: {
      bazaar: {
        description: "Current weather data for any location",
        inputSchema: {
          queryParams: {
            location: {
              type: "string",
              description: "City name or coordinates",
              required: true
            }
          }
        },
        outputSchema: {
          type: "object",
          properties: {
            temperature: { type: "number" },
            conditions: { type: "string" },
            humidity: { type: "number" }
          }
        }
      }
    }
  }
}
```

### Configuration Options

```typescript
interface BazaarExtensionOptions {
  /** Enable discovery for this endpoint */
  discoverable?: boolean;
  
  /** Human-readable description of the service */
  description?: string;
  
  /** Category for grouping similar services */
  category?: string;
  
  /** JSON schema describing expected inputs */
  inputSchema?: {
    queryParams?: Record<string, SchemaProperty>;
    bodyParams?: Record<string, SchemaProperty>;
    headers?: Record<string, SchemaProperty>;
  };
  
  /** JSON schema describing response format */
  outputSchema?: JSONSchema;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}
```

---

## API Reference

### List Endpoint

Retrieve all available x402-compatible endpoints:

```bash
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources
```

**Note**: The recommended way to use this endpoint is to use the `useFacilitator` hook as described in the Quickstart for Buyers section below.

### Response Schema

Each endpoint in the list contains the following fields:

```json
{
  "accepts": [
    {
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "description": "",
      "extra": {
        "name": "USD Coin",
        "version": "2"
      },
      "maxAmountRequired": "200",
      "maxTimeoutSeconds": 60,
      "mimeType": "",
      "network": "eip155:8453",
      "outputSchema": {
        "input": {
          "method": "GET",
          "type": "http"
        },
        "output": null
      },
      "payTo": "0xa2477E16dCB42E2AD80f03FE97D7F1a1646cd1c0",
      "resource": "https://api.example.com/x402/weather",
      "scheme": "exact"
    }
  ],
  "lastUpdated": "2025-08-09T01:07:04.005Z",
  "metadata": {},
  "resource": "https://api.example.com/x402/weather",
  "type": "http",
  "x402Version": 2
}
```

**Field Descriptions:**

* **asset**: ERC-20 token contract address accepted for payment (e.g., USDC on Base)
* **description**: Optional description of the accepted payment
* **extra**: Additional asset information (name, version)
* **maxAmountRequired**: Maximum amount in atomic units (USDC has 6 decimals)
* **maxTimeoutSeconds**: Maximum time the service will wait for payment
* **mimeType**: Expected MIME type for the response
* **network**: CAIP-2 network identifier (e.g., `eip155:8453` for Base)
* **outputSchema**: JSON schema for input/output
* **payTo**: Address to which payment should be sent
* **resource**: The actual API endpoint URL
* **scheme**: Payment scheme (e.g., `exact` means exact amount required)

---

## Quickstart for Buyers

See the full example here for [Python](https://github.com/coinbase/x402/tree/main/examples/python/discovery) and [Node.js](https://github.com/coinbase/x402/tree/main/examples/typescript/discovery).

### Step 1: Discover Available Services

Fetch the list of available x402 services using the facilitator client:

**TypeScript:**

```typescript
import { useFacilitator } from "@x402/core";
import { cdpFacilitator } from "@x402/facilitators";

const { list } = useFacilitator(cdpFacilitator);

// Fetch all available services
const services = await list();

// NOTE: in an MCP context, you can see the full list then decide which service to use

// Find services under $0.10
const usdcAsset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const maxPrice = 100000; // $0.10 in USDC atomic units (6 decimals)

const affordableServices = services.items.filter(item =>
  item.accepts.find(paymentRequirements =>
    paymentRequirements.asset === usdcAsset &&
    Number(paymentRequirements.maxAmountRequired) < maxPrice
  )
);
```

**Python:**

```python
from x402.core import FacilitatorClient, FacilitatorConfig
from x402.facilitators import create_cdp_facilitator_config

# Set up facilitator client
facilitator_config = create_cdp_facilitator_config()
facilitator = FacilitatorClient(facilitator_config)

# Fetch all available services
services = await facilitator.list()

# NOTE: in an MCP context, you can see the full list then decide which service to use

# Find services under $0.10
usdc_asset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
max_price = 100000  # $0.10 in USDC atomic units (6 decimals)

affordable_services = [
  item
  for item in services.items
  if any(
    payment_req.asset == usdc_asset
    and int(payment_req.max_amount_required) < max_price
    for payment_req in item.accepts
  )
]
```

### Step 2: Call a Discovered Service

Once you've found a suitable service, use an x402 client to call it:

**TypeScript:**

```typescript
import { withPaymentInterceptor } from "@x402/axios";
import axios from "axios";
import { privateKeyToAccount } from "viem/accounts";

// Set up your payment account
const account = privateKeyToAccount("0xYourPrivateKey");

// Select a service from discovery
const selectedService = affordableServices[0];

// Create a payment-enabled client for that service
const client = withPaymentInterceptor(
  axios.create({ baseURL: selectedService.endpoint }),
  account
);

// Select the payment method of your choice
const selectedPaymentRequirements = selectedService.accepts[0];
const inputSchema = selectedPaymentRequirements.outputSchema.input;

// Build the request using the service's schema
const response = await client.request({
  method: inputSchema.method,
  url: inputSchema.resource,
  params: { location: "San Francisco" } // Based on inputSchema
});

console.log("Response data:", response.data);
```

**Python:**

```python
from x402.client import X402Client
from eth_account import Account

# Set up your payment account
account = Account.from_key("0xYourPrivateKey")
client = X402Client(account)

# Select a service from discovery
selected_service = affordable_services[0]

# Select the payment method of your choice
selected_payment_requirements = selected_service.accepts[0]
input_schema = selected_payment_requirements.output_schema.input

# Make the request
response = client.request({
    method=input_schema.method,
    url=input_schema.resource,
    params={"location": "San Francisco"}  # Based on input_schema
})

print(f"Response data: {response}")
```

---

## Quickstart for Sellers

### Automatic Listing with Bazaar Extension

If your API uses the latest version of the CDP facilitator for x402 payments, it's **ingested in the bazaar when you enable the bazaar extension**.

### Adding Metadata

To enhance your listing with descriptions and schemas, include them when setting up your x402 middleware. **You should include descriptions for each parameter to make it clear for agents to call your endpoints**:

**TypeScript (Express/Next.js/Hono):**

```typescript
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar } from "@x402/extensions";
import { cdpFacilitator } from "@x402/facilitators";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  facilitator: cdpFacilitator,
  extensions: [
    bazaar({
      discoverable: true,
      description: "Get current weather data for any location",
      inputSchema: {
        queryParams: {
          location: {
            type: "string",
            description: "City name or coordinates",
            required: true
          }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          temperature: { type: "number" },
          conditions: { type: "string" },
          humidity: { type: "number" }
        }
      }
    })
  ],
  routes: {
    "/api/weather": {
      network: "eip155:8453",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
```

**Python (FastAPI/Flask):**

```python
from x402.middleware.fastapi import create_payment_middleware
from x402.extensions import bazaar
from x402.facilitators import cdp_facilitator

app.middleware("http")(
    create_payment_middleware(
        recipient="0xYourAddress",
        facilitator=cdp_facilitator,
        extensions=[
            bazaar(
                discoverable=True,
                description="Get current weather data for any location",
                input_schema={
                    "queryParams": {
                        "location": {
                            "type": "string",
                            "description": "City name or coordinates",
                            "required": True
                        }
                    }
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "temperature": {"type": "number"},
                        "conditions": {"type": "string"},
                        "humidity": {"type": "number"}
                    }
                }
            )
        ],
        routes={
            "/weather": {
                "network": "eip155:8453",
                "scheme": "exact",
                "amount": "$0.001"
            }
        }
    )
)
```

---

## Schema Best Practices

### Input Schema Guidelines

1. **Be Specific**: Clearly describe what each parameter does
2. **Include Examples**: Show valid input formats
3. **Mark Required Fields**: Use `required: true` for mandatory parameters
4. **Use Standard Types**: Stick to JSON schema types (string, number, boolean, object, array)

**Good Example:**

```typescript
inputSchema: {
  queryParams: {
    location: {
      type: "string",
      description: "City name (e.g., 'San Francisco') or coordinates (e.g., '37.7749,-122.4194')",
      required: true,
      examples: ["San Francisco", "37.7749,-122.4194"]
    },
    units: {
      type: "string",
      description: "Temperature units: 'celsius' or 'fahrenheit'",
      enum: ["celsius", "fahrenheit"],
      default: "celsius"
    }
  }
}
```

### Output Schema Guidelines

1. **Document Response Structure**: Show the shape of successful responses
2. **Include Field Descriptions**: Explain what each field contains
3. **Specify Types**: Use precise JSON schema types

**Good Example:**

```typescript
outputSchema: {
  type: "object",
  properties: {
    temperature: {
      type: "number",
      description: "Current temperature in specified units"
    },
    conditions: {
      type: "string",
      description: "Weather conditions (e.g., 'sunny', 'cloudy', 'rainy')"
    },
    humidity: {
      type: "number",
      description: "Relative humidity percentage (0-100)"
    },
    timestamp: {
      type: "string",
      format: "date-time",
      description: "ISO 8601 timestamp of the weather reading"
    }
  },
  required: ["temperature", "conditions"]
}
```

---

## Migration from V1 to V2

If you're migrating from x402 V1, here's how the Bazaar configuration has changed:

### V1 (Inline Config):

```typescript
import { paymentMiddleware } from "x402-express";

app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/api/weather": {
      price: "$0.001",
      network: "base",
      config: {
        discoverable: true,
        description: "Get weather data",
        inputSchema: { /* ... */ }
      }
    }
  },
  { url: "https://x402.org/facilitator" }
));
```

### V2 (Extension Pattern):

```typescript
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar } from "@x402/extensions";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  facilitator: { url: "https://x402.org/facilitator" },
  extensions: [
    bazaar({
      discoverable: true,
      description: "Get weather data",
      inputSchema: { /* ... */ }
    })
  ],
  routes: {
    "/api/weather": {
      network: "eip155:8453",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
```

**Key Changes:**

1. **Package Names**: `x402-express` → `@x402/express`
2. **Function Names**: `paymentMiddleware()` → `createPaymentMiddleware()`
3. **Network Identifiers**: `"base"` → `"eip155:8453"` (CAIP-2 format)
4. **Scheme Functions**: `price: "$0.001"` → `scheme: exact({ amount: "$0.001" })`
5. **Extension Pattern**: `config: { discoverable: true }` → `extensions: [bazaar({ discoverable: true })]`
6. **Facilitator Import**: `@coinbase/x402` → `@x402/facilitators`

---

## Integration with Extension System

The Bazaar extension integrates with x402's lifecycle hooks to automatically register and update service listings:

### Lifecycle Integration

```typescript
// The bazaar extension hooks into these lifecycle events:

beforeVerify: async (context) => {
  // Log discovery-related metrics
}

afterSettle: async (context, result) => {
  // Update service usage statistics
}

modifyPaymentRequirements: (requirements) => {
  // Add bazaar metadata to 402 responses
  return {
    ...requirements,
    metadata: {
      discoverable: true,
      inputSchema: { /* ... */ }
    }
  };
}
```

### Extension Composition

Combine bazaar with other extensions:

```typescript
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar, analytics } from "@x402/extensions";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  extensions: [
    bazaar({
      discoverable: true,
      description: "Weather API"
    }),
    analytics({
      trackRevenue: true,
      trackUsage: true
    })
  ],
  routes: {
    "/api/weather": {
      network: "eip155:84532",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
```

---

## Coming Soon

The x402 Bazaar is rapidly evolving, and your feedback helps us prioritize features:

* **Advanced Search**: Filter by price, category, network, and more
* **Reputation System**: Service ratings and reviews
* **Analytics Dashboard**: Track your service's discovery metrics
* **Custom Categories**: Define your own service categories
* **Version Management**: Support multiple API versions

---

## Support

* **GitHub**: [github.com/coinbase/x402](https://github.com/coinbase/x402)
* **Discord**: [Join #x402 channel](https://discord.com/invite/cdp)
* **Documentation**: [Extensions Overview](overview.md)

---

## FAQ

**Q: How do I get my service listed?**
A: If you're using the CDP facilitator, your service is listed once you enable the bazaar extension with `discoverable: true`.

**Q: How can I make endpoint calls more accurate?**
A: Include clear, concise descriptions for each parameter stating what it does and how to use it. Use examples and specify required fields.

**Q: How does pricing work?**
A: Listing is free. Services set their own prices per API call, paid via x402.

**Q: What networks are supported?**
A: Currently Base (`eip155:8453`) and Base Sepolia (`eip155:84532`) with USDC payments. More networks coming soon.

**Q: Can I list non-x402 services?**
A: No, only x402-compatible endpoints can be listed. See our [Quickstart for Sellers](../getting-started/quickstart-for-sellers.md) to make your API x402-compatible.

**Q: Can I use bazaar with other facilitators?**
A: Yes! The bazaar extension is facilitator-agnostic. Any facilitator can implement a discovery layer using the same schema.

**Q: How do I update my service listing?**
A: Simply update your middleware configuration and restart your server. The bazaar will automatically pick up the changes.

**Q: Can I make some routes discoverable and others private?**
A: Yes! Use per-route configuration to enable bazaar only for specific endpoints:

```typescript
routes: {
  "/api/public": {
    network: "eip155:8453",
    scheme: exact({ amount: "$0.001" }),
    extensions: {
      bazaar: { discoverable: true }
    }
  },
  "/api/private": {
    network: "eip155:8453",
    scheme: exact({ amount: "$0.01" })
    // No bazaar extension = not discoverable
  }
}
```

---

## Summary

The Bazaar Discovery Extension enables:

* **Automatic service discovery** for x402-compatible APIs
* **Machine-readable catalogs** for AI agents
* **Opt-in discoverability** via the extension system
* **Rich metadata** with input/output schemas
* **Facilitator-agnostic** discovery layer

**Next steps:**
- [Extensions Overview](overview.md) - Learn about the extension system
- [Quickstart for Sellers](../getting-started/quickstart-for-sellers.md) - Make your API discoverable
- [Protocol Layers](../core-concepts/protocol-layers.md) - Understand the architecture