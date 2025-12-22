"""httpx e2e test client using x402 v2 SDK."""

import os
import json
import asyncio
from dotenv import load_dotenv
from eth_account import Account

# Import from new x402 package
from x402 import x402Client
from x402.http import decode_payment_response_header
from x402.http.clients import x402_httpx_transport
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact import register_exact_evm_client
import httpx

# Load environment variables
load_dotenv()

# Get environment variables
private_key = os.getenv("EVM_PRIVATE_KEY")
base_url = os.getenv("RESOURCE_SERVER_URL")
endpoint_path = os.getenv("ENDPOINT_PATH")

if not all([private_key, base_url, endpoint_path]):
    error_result = {"success": False, "error": "Missing required environment variables"}
    print(json.dumps(error_result))
    exit(1)

# Create eth_account from private key
account = Account.from_key(private_key)


async def main():
    # Create x402 client
    client = x402Client()

    # Create signer and register EVM exact scheme
    signer = EthAccountSigner(account)
    register_exact_evm_client(client, signer)

    # Create httpx client with x402 payment transport and increased timeout
    # Set timeout to 30 seconds to handle busy servers during test runs
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        transport=x402_httpx_transport(client),
    ) as http_client:
        # Make request
        try:
            response = await http_client.get(endpoint_path)

            # Read the response content
            content = response.content
            response_data = json.loads(content.decode())

            # Prepare result
            result = {
                "success": True,
                "data": response_data,
                "status_code": response.status_code,
                "payment_response": None,
            }

            # Check for payment response header
            if "X-Payment-Response" in response.headers:
                payment_response = decode_payment_response_header(
                    response.headers["X-Payment-Response"]
                )
                result["payment_response"] = payment_response.model_dump()

            # Output structured result as JSON for proxy to parse
            print(json.dumps(result))
            exit(0)

        except Exception as e:
            error_result = {
                "success": False,
                "error": str(e),
                "status_code": getattr(e, "response", {}).get("status_code", None)
                if hasattr(e, "response")
                else None,
            }
            print(json.dumps(error_result))
            exit(1)


if __name__ == "__main__":
    asyncio.run(main())
