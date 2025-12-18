import os
import asyncio
import base64
import json
from dotenv import load_dotenv
from eth_account import Account
from x402.clients.httpx import x402HttpxClient

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
try:
    account = Account.from_key(private_key)
    print(f"Initialized account: {account.address}")
except Exception as e:
    print(f"Error initializing account: {e}")
    exit(1)


async def main():
    # Create x402HttpxClient with built-in payment handling
    # Wraps httpx.AsyncClient
    async with x402HttpxClient(account=account, base_url=base_url) as client:
        try:
            print(f"Making request to {endpoint_path}")
            response = await client.get(endpoint_path)

            # Read the response content
            content = response.content
            print(f"Response: {content.decode()}")

            # Check for payment response header (V2 only)
            if "PAYMENT-RESPONSE" in response.headers:
                header_val = response.headers["PAYMENT-RESPONSE"]
                try:
                    decoded = json.loads(base64.b64decode(header_val).decode("utf-8"))
                    print(f"Settlement Header (V2): {decoded}")
                    if "transaction" in decoded:
                        print(f"Transaction Hash: {decoded['transaction']}")
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    print(f"Error decoding PAYMENT-RESPONSE: {e}")
                    print(f"Settlement Header (Raw): {header_val}")
            else:
                print(
                    "Warning: No PAYMENT-RESPONSE header found (Response might not be settled yet)"
                )

        except Exception as e:
            print(f"Error occurred: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
