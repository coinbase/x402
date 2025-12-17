# Bazaar (Discovery Layer)

The x402 Bazaar is the discovery layer for the x402 ecosystem - a machine-readable catalog that helps developers and AI agents find and integrate with x402-compatible API endpoints. Think of it as a search index for payable APIs, enabling the autonomous discovery and consumption of services.

The x402 Bazaar is in early development. While our vision is to build the "Google for agentic endpoints," we're currently more like "Yahoo search" - functional but evolving. Features and APIs may change as we gather feedback and expand capabilities.

### Overview

The Bazaar solves a critical problem in the x402 ecosystem: **discoverability**. Without it, x402-compatible endpoints are like hidden stalls in a vast market. The Bazaar provides:

* **For Buyers (API Consumers)**: Programmatically discover available x402-enabled services, understand their capabilities, pricing, and schemas
* **For Sellers (API Providers)**: Automatic visibility for your x402-enabled services to a global audience of developers and AI agents
* **For AI Agents**: Dynamic service discovery without pre-baked integrations - query, find, pay, and use

### How It Works

The Bazaar currently provides a simple `/list` endpoint that returns all x402-compatible services registered with the CDP facilitator. Services are automatically opted-in when they use the CDP facilitator, making discovery frictionless for sellers.

**Note:** While a discovery layer is live today for the CDP Facilitator, the spec for the marketplace items is open and part of the x402 scheme, meaning any facilitator can create their own discovery layer.&#x20;

#### Basic Flow

1. **Discovery**: Clients query the `/list` endpoint to find available services
2. **Selection**: Choose a service based on price, capabilities, and requirements
3. **Execution**: Use x402 to pay for and access the selected service
4. **No Manual Setup**: No API keys, no account creation, just discover and pay

### API Reference

#### List Endpoint

Retrieve all available x402-compatible endpoints:

```bash
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources
```

**Note**: the recommended way to use this endpoint is to use the `useFacilitator` hook as described below.

**Response Schema**

Each endpoint in the list contains the following fields:

```json
{
      "accepts": [
        {
          "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // ERC-20 token contract address accepted for payment (here, USDC on Base)
          "description": "", // Optional description of the accepted payment
          "extra": {
            "name": "USD Coin", // Human-readable name of the asset
            "version": "2" // Version of the asset, if applicable
          },
          "maxAmountRequired": "200", // Maximum amount (in atomic units, e.g USDC has 6 decimals) required for the service
          "maxTimeoutSeconds": 60, // Maximum time (in seconds) the service will wait for payment before expiring
          "mimeType": "", // Expected MIME type for the response (optional/empty if not specified)
          "network": "base", // network where payment is accepted (e.g., 'base' for Base L2)
          "outputSchema": {
            "input": {
              "method": "GET", // HTTP method to use when calling the resource
              "type": "http" // Type of resource (e.g., 'http' endpoint)
            },
            "output": null // Output schema (null if not specified)
          },
          "payTo": "0xa2477E16dCB42E2AD80f03FE97D7F1a1646cd1c0", // Address to which payment should be sent
          "resource": "https://api.example.com/x402/last_sold", // The actual API endpoint/resource URL
          "scheme": "exact" // Payment scheme (e.g., 'exact' means exact amount required)
        }
      ],
      "lastUpdated": "2025-08-09T01:07:04.005Z", 
      "metadata": {}, // Additional metadata about the service (empty object if none)
      "resource": "https://api.prixe.io/x402/last_sold", // The main resource URL for this service
      "type": "http", 
      "x402Version": 1 // Version of the x402 protocol supported
    },
```

### Quickstart for Buyers

See the full example here for [Python](https://github.com/coinbase/x402/tree/main/examples/python/discovery) and [Node.js](https://github.com/coinbase/x402/tree/main/examples/typescript/discovery).

#### Step 1: Discover Available Services

Fetch the list of available x402 services using the facilitator client:

Typescript:

```typescript
import { useFacilitator } from "x402/verify";
import { facilitator } from "@coinbase/x402";


const { list } = useFacilitator(facilitator);

// Fetch all available services
const services = await list();

// NOTE: in an MCP context, you can see the full list then decide which service to use

// Find services under $0.10
const usdcAsset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const maxPrice = 100000;

const affordableServices = services.items.filter(item => item.accepts.find(paymentRequirements => paymentRequirements.asset == usdcAsset && Number(paymentRequirements.maxAmountRequired) < maxPrice));
```

Python:

```python
from x402.facilitator import FacilitatorClient, FacilitatorConfig
from cdp.x402 import create_facilitator_config

# Set up facilitator client
facilitator_config = create_facilitator_config()
facilitator = FacilitatorClient(facilitator_config)

# Fetch all available services
services = await facilitator.list()

# NOTE: in an MCP context, you can see the full list then decide which service to use

# Find services under $0.10
usdc_asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
max_price = 100000

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

#### Step 2: Call a Discovered Service

Once you've found a suitable service, use an x402 client to call it:

Typescript:

```typescript
import { withPaymentInterceptor } from 'x402-axios'; 
import axios from 'axios'; 
import { privateKeyToAccount } from 'viem/accounts';

// Set up your payment account
const account = privateKeyToAccount('0xYourPrivateKey');

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
  params: { location: 'San Francisco' } // Based on inputSchema
});

console.log('Response data:', response.data);
```

Python:&#x20;

```python
from x402.client import X402Client
from eth_account import Account

# Set up your payment account
account = Account.from_key('0xYourPrivateKey')
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
    params={ "location": "San Francisco" } # Based on input_schema
})

print(f"Response data: {response}")
```

### Quickstart for Sellers

#### Automatic Listing with Discoverable Flag

If your API uses the latest version of the CDP facilitator for x402 payments, it's **ingested in the bazaar if you make the `discoverable` flag true in the input schema (see below).**

#### Adding Metadata

To enhance your listing with descriptions and schemas, include them when setting up your x402 middleware. **You should include descriptions for each parameter to make it clear for the agent to call your endpoints**:

Typescript:&#x20;

<pre><code>// Next.js / Express / Hono
 
import { require402Payment } from 'x402-express';
<strong>
</strong><strong>app.use(require402Payment({
</strong>  routes: {
    "/api/weather": {
      price: "$0.001",
      network: "base",
      config: {
        discoverable: true, // make your endpoint discoverable
        description: "Get current weather data for any location",
        inputSchema: { 
          queryParams: { 
            location: { 
              type: string, 
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
}));
</code></pre>

Python &#x20;

<pre><code># FastAPI / Flask

from x402 import require_payment

<strong>app.middleware("http")(
</strong>    require_payment(
        path="/weather",
        price="$0.001",
        pay_to_address=WALLET_ADDRESS,
        network="base",
        description="Get current weather data for any location",
        discoverable=true, # make your endpoint discoverable &#x3C;----
        input_schema={
            "queryParams": {
                "location": {
                    "type": string,
                    "description": "City name or coordinates",
                    "required": true
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
)
```
</code></pre>

### Coming Soon

The x402 Bazaar is rapidly evolving, and your feedback helps us prioritize features.

### Support

* **GitHub**: [github.com/coinbase/x402](https://github.com/coinbase/x402)
* **Discord**: [Join #x402 channel](https://discord.com/invite/cdp)
* **Documentation**: x402 Overview

### FAQ

**Q: How do I get my service listed?** A: If you're using the CDP facilitator, your service is listed once you include the discoverable flag

**Q: How can I make endpoint calls more accurate?** Include descriptions clearly stating what each parameter does and how to call your endpoint, but do so as succinctly as possible.

**Q: How does pricing work?** A: Listing is free. Services set their own prices per API call, paid via x402.

**Q: What networks are supported?** A: Currently Base (mainnet) with USDC payments.

**Q: Can I list non-x402 services?** A: No, only x402-compatible endpoints can be listed. See our seller quickstart to make your API x402-compatible.
