"""Test client for x402 FastAPI server.

Demonstrates how to use the x402 Python client with httpx to make payments
and access protected endpoints.

Usage:
    1. Set PRIVATE_KEY environment variable (wallet with Base Sepolia USDC)
    2. Start server: uv run python main.py
    3. Run test: uv run python test_client.py

Environment Variables:
    PRIVATE_KEY: Ethereum private key for signing payments
    SERVER_URL: Server URL (default: http://localhost:4021)
"""

import asyncio
import os

from dotenv import load_dotenv
from eth_account import Account
from httpx import AsyncClient

from x402 import x402Client
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm.exact import register_exact_evm_client
from x402.mechanisms.evm.signers import EthAccountSigner

load_dotenv()

SERVER_URL = os.getenv("SERVER_URL", "http://localhost:4021")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")

if not PRIVATE_KEY:
    raise ValueError("PRIVATE_KEY environment variable required")


def create_x402_client() -> x402Client:
    """Create an x402 client with EVM payment support.

    Returns:
        Configured x402Client instance.
    """
    account = Account.from_key(PRIVATE_KEY)
    signer = EthAccountSigner(account)
    print(f"Wallet address: {signer.address}")

    client = x402Client()
    register_exact_evm_client(client, signer)

    return client


async def test_health(client: AsyncClient) -> None:
    """Test /health endpoint (no payment required)."""
    print("\n--- Testing /health (no payment) ---")
    response = await client.get(f"{SERVER_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Body: {response.json()}")


async def test_weather(client: AsyncClient) -> None:
    """Test /weather endpoint (payment required)."""
    print("\n--- Testing /weather (requires payment) ---")
    response = await client.get(f"{SERVER_URL}/weather")
    print(f"Status: {response.status_code}")
    print(f"Body: {response.json()}")


async def test_premium_content(client: AsyncClient) -> None:
    """Test /premium/content endpoint (payment required)."""
    print("\n--- Testing /premium/content (requires payment) ---")
    try:
        response = await client.get(f"{SERVER_URL}/premium/content")
        print(f"Status: {response.status_code}")
        print(f"Body: {response.json()}")
        if response.status_code == 402:
            header = response.headers.get("payment-required", "N/A")
            print(f"Payment-Required header: {header[:100]}...")
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")


async def main() -> None:
    """Run all endpoint tests.

    Expected results:
        /health         -> 200 OK (no payment required)
        /weather        -> 200 OK (payment auto-handled)
        /premium/content -> 200 OK (payment auto-handled)
    """
    x402_client = create_x402_client()

    async with x402HttpxClient(x402_client) as client:
        await test_health(client)
        await test_weather(client)
        await test_premium_content(client)


if __name__ == "__main__":
    asyncio.run(main())
