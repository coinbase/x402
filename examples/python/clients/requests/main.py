"""x402 requests client example - sync HTTP with automatic payment handling."""

import os
import sys

from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http.clients.requests import x402_requests
from x402.http.x402_http_client import x402HTTPClient
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mechanisms.evm.signers import EthAccountSigner

# Load environment variables
load_dotenv()


def validate_environment() -> tuple[str, str, str]:
    """Validate required environment variables.

    Returns:
        Tuple of (private_key, base_url, endpoint_path).

    Raises:
        SystemExit: If required environment variables are missing.
    """
    private_key = os.getenv("PRIVATE_KEY")
    base_url = os.getenv("RESOURCE_SERVER_URL")
    endpoint_path = os.getenv("ENDPOINT_PATH")

    missing = []
    if not private_key:
        missing.append("PRIVATE_KEY")
    if not base_url:
        missing.append("RESOURCE_SERVER_URL")
    if not endpoint_path:
        missing.append("ENDPOINT_PATH")

    if missing:
        print(f"Error: Missing required environment variables: {', '.join(missing)}")
        print("Please copy .env-example to .env and fill in the values.")
        sys.exit(1)

    return private_key, base_url, endpoint_path


def main() -> None:
    """Main entry point demonstrating requests with x402 payments."""
    # Validate environment
    private_key, base_url, endpoint_path = validate_environment()

    # Create eth_account from private key
    account = Account.from_key(private_key)
    print(f"Initialized account: {account.address}")

    # Create x402 client and register EVM payment scheme
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))

    # Create HTTP client helper for payment response extraction
    http_client = x402HTTPClient(client)

    # Build full URL
    url = f"{base_url}{endpoint_path}"
    print(f"Making request to: {url}\n")

    # Make request using context manager for proper cleanup
    with x402_requests(client) as session:
        response = session.get(url)

        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")

        # Extract and print payment response if present
        if response.ok:  # requests uses .ok
            try:
                settle_response = http_client.get_payment_settle_response(
                    lambda name: response.headers.get(name)
                )
                print(f"\nPayment settled successfully!")
                print(f"  Transaction: {settle_response.transaction}")
                print(f"  Network: {settle_response.network}")
                print(f"  Payer: {settle_response.payer}")
            except ValueError:
                print("\nNo payment response header found")
        else:
            print(f"\nRequest failed (status: {response.status_code})")


if __name__ == "__main__":
    main()
