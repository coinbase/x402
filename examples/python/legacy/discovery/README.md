# x402 Discovery Example

This example demonstrates how to use the x402 discovery feature to find and list available x402-protected resources across the network.

## Prerequisites

- Python 3.10+
- uv package manager (install via [uv.dev](https://uv.dev))

## Setup

1. Install and build all packages from the python examples root:
```bash
cd ../../
uv sync
cd examples/python/discovery
```

2. Start the discovery example:
```bash
uv run python main.py
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

```python
import json
import asyncio
from datetime import datetime
from x402.facilitator import FacilitatorClient
from cdp.x402 import create_facilitator_config

# Initialize facilitator client (no API keys required for discovery)
facilitator = FacilitatorClient(create_facilitator_config())

async def main():
    try:
        # Get the list of resources
        response = await facilitator.list()
        
        print("\nDiscovered X402 Resources:")
        print("========================\n")
        
        # Print each resource in a formatted way
        for index, item in enumerate(response.items, 1):
            print(f"Resource {index}:")
            # Convert the item to JSON with proper formatting
            item_json = json.loads(item.model_dump_json(by_alias=True))
            print(f"  Resource URL: {item_json['resource']}")
            print(f"  Type: {item_json['type']}")
            print(f"  Last Updated: {datetime.fromisoformat(item_json['lastUpdated'].replace('Z', '+00:00')).strftime('%m/%d/%Y, %I:%M:%S %p')}")
            print(f"  X402 Version: {item_json['x402Version']}")
            print(f"  Accepts: {json.dumps(item_json['accepts'], indent=2)}")
            if item_json.get("metadata"):
                print(f"  Metadata: {json.dumps(item_json['metadata'], indent=2)}")
            print("------------------------\n")

    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
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
  Accepts: [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000000",
      "resource": "https://api.example.com/x402/endpoint",
      "description": "Example protected endpoint",
      "mimeType": "application/json",
      "payTo": "0x1234...",
      "maxTimeoutSeconds": 300,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    }
  ]
------------------------
```
