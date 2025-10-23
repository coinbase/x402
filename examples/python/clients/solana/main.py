"""Example x402 client for Solana payments using httpx."""

import asyncio
import os
from httpx import AsyncClient
from x402 import create_keypair_from_base58, x402Client
from x402.clients.httpx import x402_payment_hooks
from dotenv import load_dotenv

load_dotenv()


async def main():
    # Load Solana keypair from environment
    solana_private_key = os.getenv("SOLANA_PRIVATE_KEY")
    if not solana_private_key:
        print("Error: SOLANA_PRIVATE_KEY environment variable not set")
        print("Generate a keypair and fund it with devnet SOL and USDC")
        return

    # Create Solana keypair
    keypair = create_keypair_from_base58(solana_private_key)
    print(f"Using Solana address: {keypair.address}")

    # Create x402 client with SVM support
    x402_client = x402Client(svm_keypair=keypair)

    # Create httpx client with x402 payment hooks
    async with AsyncClient(event_hooks=x402_payment_hooks(keypair)) as client:
        # Make request to protected endpoint
        server_url = os.getenv("SERVER_URL", "http://localhost:4021")
        endpoint = f"{server_url}/protected-svm"

        print(f"Making request to {endpoint}...")

        try:
            response = await client.get(endpoint)

            if response.status_code == 200:
                print("✅ Success!")
                print(f"Response: {response.json()}")

                # Check for payment response header
                if "X-PAYMENT-RESPONSE" in response.headers:
                    from x402.clients.base import decode_x_payment_response

                    payment_response = decode_x_payment_response(
                        response.headers["X-PAYMENT-RESPONSE"]
                    )
                    print(f"Payment settled: {payment_response}")
            else:
                print(f"❌ Failed with status {response.status_code}")
                print(f"Response: {response.text}")

        except Exception as e:
            print(f"❌ Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())

