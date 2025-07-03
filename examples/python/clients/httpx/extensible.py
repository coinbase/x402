import os
import asyncio
from dotenv import load_dotenv
from eth_account import Account
from x402.clients.httpx import x402_payment_hooks
from x402.clients.base import decode_x_payment_response
import httpx

# Load environment variables
load_dotenv()

# Get environment variables
private_key = os.getenv("PRIVATE_KEY")
base_url = os.getenv("RESOURCE_SERVER_URL")
endpoint_path = os.getenv("ENDPOINT_PATH")

if not all([private_key, base_url, endpoint_path]):
    print("Error: Missing required environment variables")
    exit(1)

# Create eth_account from private key
account = Account.from_key(private_key)
print(f"Initialized account: {account.address}")


async def main():
    # Create httpx client with x402 payment hooks
    async with httpx.AsyncClient(base_url=base_url) as client:
        # Add payment hooks directly to client.event_hooks
        client.event_hooks = x402_payment_hooks(account)

        # Make request
        try:
            print(f"Making request to {endpoint_path}")
            response = await client.get(endpoint_path)

            # Read the response content
            content = await response.aread()
            print(f"Response: {content.decode()}")

            # Check for payment response header
            if "X-Payment-Response" in response.headers:
                payment_response = decode_x_payment_response(
                    response.headers["X-Payment-Response"]
                )
                print(
                    f"Payment response transaction hash: {payment_response['transaction']}"
                )
            else:
                print("Warning: No payment response header found")

        except Exception as e:
            print(f"Error occurred: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
