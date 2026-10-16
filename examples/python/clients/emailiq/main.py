"""Pay EmailIQ (live x402 seller) with the Python httpx client.

Factual target (Base mainnet):
  POST https://emailiq.dev/email/intelligence
  Price: 0.01 USDC · scheme exact · CDP Facilitator / Bazaar-indexed

This example does not claim volume, rankings, or partnership — only that the
public endpoint returns HTTP 402 without payment and JSON intelligence after a
valid x402 settlement.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

load_dotenv()


def validate_environment() -> tuple[str, str, str, str]:
    evm_private_key = os.getenv("EVM_PRIVATE_KEY")
    base_url = os.getenv("RESOURCE_SERVER_URL", "https://emailiq.dev").rstrip("/")
    endpoint_path = os.getenv("ENDPOINT_PATH", "/email/intelligence")
    email = os.getenv("EMAIL", "signup@example.com")

    if not evm_private_key:
        print("Error: Missing EVM_PRIVATE_KEY (Base wallet with USDC for 0.01 settle).")
        print("Copy .env-local to .env and set EVM_PRIVATE_KEY.")
        sys.exit(1)

    return evm_private_key, base_url, endpoint_path, email


async def main() -> None:
    evm_private_key, base_url, endpoint_path, email = validate_environment()

    # Cap well above EmailIQ's 0.01 USDC price; still a safety rail.
    client = x402Client().set_spend_controls({"max_amount_per_payment": "$0.10"})

    account = Account.from_key(evm_private_key)
    register_exact_evm_client(client, EthAccountSigner(account))
    print(f"Initialized EVM account: {account.address}")

    http_client = x402HTTPClient(client)
    url = f"{base_url}{endpoint_path}"
    payload = {"email": email}
    print(f"POST {url}")
    print(f"body: {json.dumps(payload)}\n")

    async with x402HttpxClient(client) as http:
        response = await http.post(url, json=payload)
        await response.aread()

        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")

        try:
            settle_response = http_client.get_payment_settle_response(
                lambda name: response.headers.get(name)
            )
            print(f"\nPayment response: {settle_response.model_dump_json(indent=2)}")
        except ValueError:
            print("\nNo payment response header found")


if __name__ == "__main__":
    asyncio.run(main())
