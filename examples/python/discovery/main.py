import os
import json
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from x402.facilitator import FacilitatorClient, FacilitatorConfig
from cdp.x402 import create_facilitator_config

# Load environment variables
load_dotenv()

# Get configuration from environment
CDP_API_KEY_ID = os.getenv("CDP_API_KEY_ID")
CDP_API_KEY_SECRET = os.getenv("CDP_API_KEY_SECRET")

if not CDP_API_KEY_ID or not CDP_API_KEY_SECRET:
    raise ValueError(
        "Missing required environment variables: CDP_API_KEY_ID and CDP_API_KEY_SECRET"
    )

# Initialize facilitator client
facilitator_config = create_facilitator_config(CDP_API_KEY_ID, CDP_API_KEY_SECRET)
facilitator = FacilitatorClient(facilitator_config)


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
            print(
                f"  Last Updated: {datetime.fromisoformat(item_json['lastUpdated'].replace('Z', '+00:00')).strftime('%m/%d/%Y, %I:%M:%S %p')}"
            )
            print(f"  X402 Version: {item_json['x402Version']}")
            print(f"  Accepts: {json.dumps(item_json['accepts'], indent=2)}")
            if item_json.get("metadata"):
                print(f"  Metadata: {json.dumps(item_json['metadata'], indent=2)}")
            print("------------------------\n")

    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
