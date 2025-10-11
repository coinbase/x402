import os
import asyncio
from dotenv import load_dotenv
from cdp.evm_local_account import EvmLocalAccount
from x402.clients.httpx import x402HttpxClient
from x402.clients.base import decode_x_payment_response
from cdp import CdpClient

# Load environment variables
load_dotenv()

# Get environment variables
base_url = os.getenv("RESOURCE_SERVER_URL")
endpoint_path = os.getenv("ENDPOINT_PATH")

if not all([base_url, endpoint_path]):
    print("Error: Missing required environment variables")
    exit(1)


async def main():
    # Initialize CdpClient & create a server wallet
    async with CdpClient() as cdp:
        name = "x402-example"
        server_account = await cdp.evm.get_or_create_account(name)
        account = EvmLocalAccount(server_account)

        # Create x402HttpxClient with built-in payment handling
        async with x402HttpxClient(account=account, base_url=base_url) as client:
            # Make request - payment handling is automatic
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
