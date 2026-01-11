"""Custom network preference selector example.

Demonstrates how to configure client-side payment option preferences.
The client can specify which network/scheme it prefers, with automatic
fallback to other supported options if the preferred one isn't available.

Use cases:
- Prefer specific networks or chains (e.g., prefer L2 over L1)
- User preference settings in a wallet UI
- Cost optimization (prefer cheaper networks)
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.schemas import PaymentRequirements, PaymentRequirementsV1

load_dotenv()

# Type alias for requirements
RequirementsView = PaymentRequirements | PaymentRequirementsV1

# Define network preference order (most preferred first)
NETWORK_PREFERENCES = [
    "eip155:8453",   # Base mainnet (preferred - low fees)
    "eip155:42161",  # Arbitrum One
    "eip155:10",     # Optimism
    "eip155:1",      # Ethereum mainnet (fallback)
    "eip155:84532",  # Base Sepolia (testnet)
]


def preferred_network_selector(
    version: int,
    options: list[RequirementsView],
) -> RequirementsView:
    """Custom selector that picks payment options based on preference order.

    NOTE: By the time this selector is called, `options` has already been
    filtered to only include options that BOTH the server offers AND the
    client has registered support for. So fallback to options[0] means
    "first mutually-supported option" (which preserves server's preference order).

    Args:
        version: The x402 protocol version.
        options: Array of mutually supported payment options.

    Returns:
        The selected payment requirement based on network preference.
    """
    print("📋 Mutually supported payment options (server offers + client supports):")
    for i, opt in enumerate(options):
        print(f"   {i + 1}. {opt.network} ({opt.scheme})")
    print()

    # Try each preference in order
    for preference in NETWORK_PREFERENCES:
        for opt in options:
            if opt.network == preference or opt.network.startswith(preference.split(":")[0] + ":"):
                print(f"✨ Selected preferred network: {opt.network}")
                return opt

    # Fallback to first mutually-supported option (server's top preference among what we support)
    print(f"⚠️  No preferred network available, falling back to: {options[0].network}")
    return options[0]


async def run_preferred_network_example(private_key: str, url: str) -> None:
    """Run the preferred network example.

    Args:
        private_key: EVM private key for signing.
        url: URL to make the request to.
    """
    print("🎯 Creating client with preferred network selection...\n")

    account = Account.from_key(private_key)
    print(f"Wallet address: {account.address}")
    print(f"Network preferences: {', '.join(NETWORK_PREFERENCES)}\n")

    # Create client with custom selector
    client = x402Client(payment_requirements_selector=preferred_network_selector)
    register_exact_evm_client(client, EthAccountSigner(account))

    # Create HTTP client helper for payment response extraction
    http_client = x402HTTPClient(client)

    print(f"🌐 Making request to: {url}\n")

    async with x402HttpxClient(client) as http:
        response = await http.get(url)
        await response.aread()

        print(f"\nResponse status: {response.status_code}")
        print(f"Response body: {response.text}")

        if response.is_success:
            try:
                settle_response = http_client.get_payment_settle_response(
                    lambda name: response.headers.get(name)
                )
                print(f"\n💰 Payment Details: {settle_response.model_dump_json(indent=2)}")
            except ValueError:
                print("\nNo payment response header found")


async def main() -> None:
    """Main entry point."""
    private_key = os.getenv("PRIVATE_KEY")
    base_url = os.getenv("RESOURCE_SERVER_URL", "http://localhost:4021")
    endpoint_path = os.getenv("ENDPOINT_PATH", "/weather")

    if not private_key:
        print("Error: PRIVATE_KEY environment variable is required")
        print("Please copy .env-local to .env and fill in the values.")
        sys.exit(1)

    url = f"{base_url}{endpoint_path}"
    await run_preferred_network_example(private_key, url)


if __name__ == "__main__":
    asyncio.run(main())
