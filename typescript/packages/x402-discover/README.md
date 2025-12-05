# x402-discover

Discovery API and CLI for finding x402-enabled tools and APIs.

Agents need a way to discover x402 tools programmatically. This service queries facilitators directly and exposes a simple HTTP API.

## Quick Start

```bash
# Install
npm install

# Run the API server
npm run serve

# Or use the CLI
npx tsx src/cli.ts list
```

## API Endpoints

```
GET /                       API info
GET /search?q=<query>       Search tools by keyword
GET /tools                  List all tools (?network=, ?limit=, ?offset=)
GET /price?url=<url>        Get pricing for a specific endpoint
GET /facilitators           List known facilitators
GET /health                 Health check
```

### Example: Search for tools

```bash
curl "http://localhost:3402/search?q=weather"
```

```json
{
  "query": "weather",
  "count": 1,
  "tools": [
    {
      "url": "https://436e0xdu.nx.link/forecast",
      "description": "Zeus - GET Get weather forecast",
      "price": "$0.003",
      "network": "base",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xB469Ff156592B1C964C526db01ee17812680fE66"
    }
  ]
}
```

## CLI Usage

```bash
# Search for tools by keyword
npx tsx src/cli.ts search "trading"

# List all available tools (with facilitator status)
npx tsx src/cli.ts list -v

# Filter by network
npx tsx src/cli.ts list --network base

# Get pricing for a specific endpoint
npx tsx src/cli.ts price https://example.com/api/endpoint

# List known facilitators
npx tsx src/cli.ts facilitators
```

## Programmatic Usage

```typescript
import { searchTools, fetchAllResources, fetchPricing } from "x402-discover";

// Search for tools
const tools = await searchTools("twitter");

// Get all tools with status
const { tools, status } = await fetchAllResources();

// Get pricing for a specific endpoint
const pricing = await fetchPricing("https://example.com/api");
```

## How it works

x402-discover queries known x402 facilitators for their registered resources. Facilitators maintain registries of x402-enabled endpoints through their `/discovery/resources` endpoints.

Features:
- **Pagination** - Fetches all tools from facilitators (up to 1000 per facilitator)
- **Caching** - 5 minute TTL to avoid hammering facilitators
- **Network normalization** - Converts `eip155:8453` to `base`
- **Facilitator status** - Reports which facilitators are healthy

## Adding facilitators

Edit `src/facilitators.ts`:

```typescript
{
  id: "your-facilitator",
  name: "Your Facilitator",
  url: "https://your-facilitator.com",
  status: "unknown",
}
```
