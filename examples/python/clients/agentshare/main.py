"""Buy AgentShare Meteora DLMM brief with x402 (USDC on Base mainnet).

AgentShare is a live Solana DeFi intelligence API. Unpaid calls return HTTP 402;
this example uses the official x402 httpx client to sign and retry automatically.

Seller discovery: https://agentshare.dev/.well-known/x402
x402scan: https://www.x402scan.com/server/65b3e822-068a-4e51-a8bb-2ade6d5f0b32
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


def validate_environment() -> tuple[str, str, str]:
    evm_private_key = (os.getenv("EVM_PRIVATE_KEY") or "").strip()
    base_url = (os.getenv("RESOURCE_SERVER_URL") or "https://agentshare.dev").rstrip("/")
    endpoint_path = (
        os.getenv("ENDPOINT_PATH") or "/api/v1/agent/defi/meteora/brief"
    ).strip()

    if not evm_private_key:
        print("Error: set EVM_PRIVATE_KEY (Base mainnet wallet with USDC).")
        print("Copy .env-local to .env and fill in values.")
        sys.exit(1)

    return evm_private_key, base_url, endpoint_path


async def main() -> None:
    evm_private_key, base_url, endpoint_path = validate_environment()

    client = x402Client()
    account = Account.from_key(evm_private_key)
    register_exact_evm_client(client, EthAccountSigner(account))
    http_helper = x402HTTPClient(client)

    url = f"{base_url}{endpoint_path}"
    body = {"limit": 3, "window": "5m", "format": "compact"}
    print(f"Buyer: {account.address}")
    print(f"POST {url}")
    print(f"Body: {body}\n")

    async with x402HttpxClient(client) as http:
        response = await http.post(url, json=body)
        await response.aread()

    print(f"Response status: {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=2, ensure_ascii=False)[:4000])
    except Exception:
        print(response.text[:4000])

    try:
        settle = http_helper.get_payment_settle_response(
            lambda name: response.headers.get(name)
        )
        print("\nPayment response:", settle.model_dump_json(indent=2))
    except ValueError:
        print("\nNo PAYMENT-RESPONSE header found")


if __name__ == "__main__":
    asyncio.run(main())
