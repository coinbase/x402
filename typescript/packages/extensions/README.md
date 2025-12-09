# @x402/extensions

x402 Payment Protocol Extensions. This package provides optional extensions that enhance the x402 payment protocol with additional functionality like resource discovery and cataloging.

## Installation

```bash
pnpm install @x402/extensions
```

## Overview

Extensions are optional features that can be added to x402 payment flows. They allow servers to provide additional metadata and enable facilitators to offer enhanced services like resource discovery and cataloging.

Currently, this package includes:
- **Bazaar Discovery Extension**: Enables automatic cataloging and indexing of x402-enabled resources

## Bazaar Discovery Extension

The Bazaar Discovery Extension enables facilitators to automatically catalog and index x402-enabled resources by following server-declared discovery instructions. This allows users to discover paid APIs and services through facilitator catalogs.

### How It Works

1. **Servers** declare discovery metadata when configuring their payment endpoints
2. The HTTP method is automatically inferred from the route definition (e.g., `"GET /weather"`)
3. **Facilitators** extract this metadata from payment requests
4. **Users** can browse and discover available paid resources through facilitator catalogs

### For Resource Servers

Declare endpoint discovery metadata in your payment middleware configuration. This helps facilitators understand how to call your endpoints and what they return.

> **Note:** The HTTP method is automatically inferred from the route key (e.g., `"GET /weather"` → GET method). You don't need to specify it in `declareDiscoveryExtension`.

#### Basic Example: GET Endpoint with Query Parameters

```typescript
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const resources = {
  "GET /weather": {
    accepts: { 
      scheme: "exact", 
      price: "$0.001", 
      network: "eip155:84532", 
      payTo: "0xYourAddress" 
    },
    extensions: {
      ...declareDiscoveryExtension({
        input: { city: "San Francisco" },
        inputSchema: {
          properties: { 
            city: { type: "string" },
            units: { type: "string", enum: ["celsius", "fahrenheit"] }
          },
          required: ["city"]
        },
        output: { 
          example: { 
            city: "San Francisco", 
            weather: "foggy",
            temperature: 15,
            humidity: 85
          } 
        },
      }),
    },
  },
};
```

#### Example: POST Endpoint with JSON Body

For POST, PUT, and PATCH endpoints, specify `bodyType` to indicate the request body format:

```typescript
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const resources = {
  "POST /api/translate": {
    accepts: { 
      scheme: "exact", 
      price: "$0.01", 
      network: "eip155:84532", 
      payTo: "0xYourAddress" 
    },
    extensions: {
      ...declareDiscoveryExtension({
        input: { 
          text: "Hello, world!",
          targetLanguage: "es"
        },
        inputSchema: {
          properties: {
            text: { type: "string" },
            targetLanguage: { type: "string", pattern: "^[a-z]{2}$" }
          },
          required: ["text", "targetLanguage"]
        },
        bodyType: "json",
        output: {
          example: {
            translatedText: "¡Hola, mundo!",
            sourceLanguage: "en",
            targetLanguage: "es"
          }
        },
      }),
    },
  },
};
```

#### Example: PUT Endpoint with Form Data

```typescript
const resources = {
  "PUT /api/user/profile": {
    accepts: { 
      scheme: "exact", 
      price: "$0.05", 
      network: "eip155:84532", 
      payTo: "0xYourAddress" 
    },
    extensions: {
      ...declareDiscoveryExtension({
        input: { 
          name: "John Doe",
          email: "john@example.com",
          bio: "Software developer"
        },
        inputSchema: {
          properties: {
            name: { type: "string", minLength: 1 },
            email: { type: "string", format: "email" },
            bio: { type: "string", maxLength: 500 }
          },
          required: ["name", "email"]
        },
        bodyType: "form-data",
        output: {
          example: {
            success: true,
            userId: "123",
            updatedAt: "2024-01-01T00:00:00Z"
          }
        },
      }),
    },
  },
};
```

#### Example: DELETE Endpoint

```typescript
const resources = {
  "DELETE /api/data/:id": {
    accepts: { 
      scheme: "exact", 
      price: "$0.001", 
      network: "eip155:84532", 
      payTo: "0xYourAddress" 
    },
    extensions: {
      ...declareDiscoveryExtension({
        input: { id: "123" },
        inputSchema: {
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        },
        output: {
          example: {
            success: true,
            deletedId: "123"
          }
        },
      }),
    },
  },
};
```

#### Using with Next.js Middleware

```typescript
import { paymentProxy, x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const facilitatorClient = new HTTPFacilitatorClient({ url: "https://facilitator.x402.org" });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme());

export const proxy = paymentProxy(
  {
    "/api/weather": {
      accepts: {
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",
        payTo: "0xYourAddress",
      },
      extensions: {
        ...declareDiscoveryExtension({
          input: { city: "San Francisco" },
          inputSchema: {
            properties: { city: { type: "string" } },
            required: ["city"],
          },
          output: {
            example: { city: "San Francisco", weather: "foggy" }
          },
        }),
      },
    },
  },
  resourceServer,
);
```

### For Facilitators

Extract discovery information from incoming payment requests to catalog resources in the Bazaar.

#### Basic Usage

```typescript
import { extractDiscoveryInfo } from "@x402/extensions/bazaar";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

async function handlePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
) {
  // Extract discovery info from the payment
  const discovered = extractDiscoveryInfo(paymentPayload, paymentRequirements);

  if (discovered) {
    // discovered contains:
    // {
    //   resourceUrl: "https://api.example.com/weather",
    //   method: "GET",
    //   x402Version: 2,
    //   discoveryInfo: {
    //     input: { type: "http", method: "GET", queryParams: { city: "..." } },
    //     output: { type: "json", example: { ... } }
    //   }
    // }

    // Catalog the resource in your Bazaar
    await catalogResource({
      url: discovered.resourceUrl,
      method: discovered.method,
      inputSchema: discovered.discoveryInfo.input,
      outputExample: discovered.discoveryInfo.output?.example,
    });
  }
}
```

#### Validating Discovery Extensions

```typescript
import { validateDiscoveryExtension, extractDiscoveryInfo } from "@x402/extensions/bazaar";

function processPayment(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements) {
  const discovered = extractDiscoveryInfo(paymentPayload, paymentRequirements);
  
  if (discovered && paymentPayload.extensions?.bazaar) {
    // Validate the extension schema
    const validation = validateDiscoveryExtension(paymentPayload.extensions.bazaar);
    
    if (!validation.valid) {
      console.warn("Invalid discovery extension:", validation.errors);
      // Handle invalid extension (log, reject, etc.)
      return;
    }
    
    // Extension is valid, proceed with cataloging
    catalogResource(discovered);
  }
}
```

#### Using with Server Extension Helper

The `bazaarResourceServerExtension` automatically enriches discovery extensions with HTTP method information from the request context:

```typescript
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { x402ResourceServer } from "@x402/core/server";

// The extension helper automatically extracts discovery info
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .useExtension(bazaarResourceServerExtension);
```

## API Reference

### `declareDiscoveryExtension(config)`

Creates a discovery extension object for resource servers.

**Parameters:**
- `config.input` (optional): Example input values (query params for GET/HEAD/DELETE, body for POST/PUT/PATCH)
- `config.inputSchema` (optional): JSON Schema for input validation
- `config.bodyType` (optional): For POST/PUT/PATCH, specify `"json"`, `"form-data"`, or `"text"` (default: `"json"`)
- `config.output` (optional): Output specification
  - `output.example`: Example output data
  - `output.schema`: JSON Schema for output validation

> **Note:** The HTTP method is NOT passed to this function. It is automatically inferred from the route key (e.g., `"GET /weather"`) or enriched by `bazaarResourceServerExtension` at runtime.

**Returns:** An object with a `bazaar` key containing the discovery extension.

**Example:**
```typescript
const extension = declareDiscoveryExtension({
  input: { query: "search term" },
  inputSchema: {
    properties: { query: { type: "string" } },
    required: ["query"]
  },
  output: {
    example: { results: [] }
  }
});
// Returns: { bazaar: { info: {...}, schema: {...} } }
```

### `extractDiscoveryInfo(paymentPayload, paymentRequirements, validate?)`

Extracts discovery information from a payment request (for facilitators).

**Parameters:**
- `paymentPayload`: The payment payload from the client
- `paymentRequirements`: The payment requirements from the server
- `validate` (optional): Whether to validate the extension (default: `true`)

**Returns:** `DiscoveredResource` object or `null` if not found.

```typescript
interface DiscoveredResource {
  resourceUrl: string;
  method: string;
  x402Version: number;
  discoveryInfo: DiscoveryInfo;
}
```

**Example:**
```typescript
const info = extractDiscoveryInfo(paymentPayload, paymentRequirements);
if (info) {
  console.log(info.resourceUrl); // "https://api.example.com/endpoint"
  console.log(info.method);       // "GET"
  console.log(info.discoveryInfo); // { input: {...}, output: {...} }
}
```

### `validateDiscoveryExtension(extension)`

Validates a discovery extension's info against its schema.

**Parameters:**
- `extension`: A discovery extension object

**Returns:** `{ valid: boolean, errors?: string[] }`

**Example:**
```typescript
const result = validateDiscoveryExtension(extension);
if (!result.valid) {
  console.error("Validation errors:", result.errors);
}
```

### `validateAndExtract(extension)`

Validates and extracts discovery info in one step.

**Parameters:**
- `extension`: A discovery extension object

**Returns:** `{ valid: boolean, info?: DiscoveryInfo, errors?: string[] }`

**Example:**
```typescript
const { valid, info, errors } = validateAndExtract(extension);
if (valid && info) {
  // Use info
}
```

### `bazaarResourceServerExtension`

A server extension that automatically enriches discovery extensions with HTTP method information from the request context.

**Usage:**
```typescript
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";

const resourceServer = new x402ResourceServer(facilitatorClient)
  .useExtension(bazaarResourceServerExtension);
```

### `BAZAAR`

The extension identifier constant (`"bazaar"`).

```typescript
import { BAZAAR } from "@x402/extensions/bazaar";
// BAZAAR === "bazaar"
```

## Use Cases

### 1. API Marketplace Discovery
Enable users to discover paid APIs through facilitator catalogs. Servers declare their endpoints, and facilitators index them for easy discovery.

### 2. Developer Tools
Build tools that automatically generate API documentation or client SDKs from discovery metadata.

### 3. Resource Cataloging
Facilitators can maintain catalogs of available paid resources, making it easier for users to find services.

### 4. Testing and Validation
Use discovery schemas to validate API requests and responses during development.

## Troubleshooting

### Extension Not Being Extracted

**Problem:** `extractDiscoveryInfo` returns `null`.

**Solutions:**
- Ensure the server has declared the extension using `declareDiscoveryExtension`
- Check that `paymentPayload.extensions.bazaar` exists
- Verify you're using x402 v2 (v1 uses a different format in `outputSchema`)

### Schema Validation Fails

**Problem:** `validateDiscoveryExtension` returns `valid: false`.

**Solutions:**
- Ensure `inputSchema` matches the structure of `input`
- Check that required fields are marked in `inputSchema.required`
- Verify JSON Schema syntax is correct

### Missing Discovery Info

**Problem:** Discovery info is incomplete.

**Solutions:**
- Ensure both `input` and `inputSchema` are provided
- For POST/PUT/PATCH, include `bodyType` in the config
- Check that `output.example` is provided if you want output documentation

### Method Not Being Detected

**Problem:** The HTTP method is missing from discovery info.

**Solutions:**
- Use `bazaarResourceServerExtension` which automatically injects the method
- Ensure the route key follows the format `"METHOD /path"` (e.g., `"GET /weather"`)

## Related Resources

- [x402 Core Package](../core/README.md) - Core x402 protocol implementation
- [x402 Specification](../../../specs/x402-specification.md) - Full protocol specification

## Version Support

This package supports both x402 v1 and v2:
- **v2**: Extensions are in `PaymentPayload.extensions` and `PaymentRequired.extensions`
- **v1**: Discovery info is in `PaymentRequirements.outputSchema` (automatically converted)

The `extractDiscoveryInfo` function automatically handles both versions.
