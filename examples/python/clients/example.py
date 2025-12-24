"""Simple x402 client example - works with both httpx and requests."""

import asyncio
import os

from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http.clients.httpx import x402HttpxClient
from x402.http.clients.requests import x402_requests
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mechanisms.evm.signers import EthAccountSigner

load_dotenv()


async def httpx_example():
    """Example using httpx (async)."""
    # Setup
    account = Account.from_key(os.getenv("EVM_PRIVATE_KEY"))
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))

    # Make request
    async with x402HttpxClient(client) as http:
        response = await http.get(os.getenv("SERVER_URL", "http://localhost:4021/weather"))
        await response.aread()
        print(f"Status: {response.status_code}")
        print(f"Body: {response.text}")


def requests_example():
    """Example using requests (sync)."""
    # Setup
    account = Account.from_key(os.getenv("EVM_PRIVATE_KEY"))
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))

    # Make request
    session = x402_requests(client)
    response = session.get(os.getenv("SERVER_URL", "http://localhost:4021/weather"))
    print(f"Status: {response.status_code}")
    print(f"Body: {response.text}")
    session.close()


if __name__ == "__main__":
    # Run async example
    asyncio.run(httpx_example())

    # Or run sync example
    # requests_example()
