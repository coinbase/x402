"""
x402 MCP Service Marketplace — Agent Client Example

Demonstrates an AI agent autonomously:
1. Discovering available services via the x402 Bazaar
2. Paying per-call in USDC on Base (no API key, no signup)
3. Calling all 3 LogicNodes workers and printing results

Prerequisites:
  - CDP API key with an EVM wallet funded with USDC on Base
  - Or: set EVM_PRIVATE_KEY for a self-managed wallet

Usage:
  uv run client.py
  uv run client.py --testnet     # uses Base Sepolia + x402.org facilitator
"""

import os
import asyncio
import argparse
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL        = os.getenv("LOGICNODES_URL", "https://logicnodes.io")
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://api.cdp.coinbase.com/platform/v2/x402")
EVM_NETWORK     = os.getenv("EVM_NETWORK", "eip155:8453")


async def discover_services(session) -> list[dict]:
    """Query the Bazaar merchant endpoint to find all available services."""
    url = f"{BASE_URL}/discovery/resources?limit=10"
    async with session.get(url) as resp:
        data = await resp.json()
    items = data.get("items", [])
    print(f"[Bazaar] Discovered {data.get('total', len(items))} services at {BASE_URL}")
    for svc in items[:5]:
        print(f"  - {svc['name']} | {svc.get('price_usd', '?')} USDC | {svc['tier']}")
    return items


async def call_with_payment(fetch_with_payment, url: str, body: dict, label: str):
    """Make an x402-gated POST call. The payment wrapper handles 402 → pay → retry."""
    print(f"\n[Agent] Calling {label}...")
    import aiohttp
    response = await fetch_with_payment(
        url,
        method="POST",
        json=body,
        headers={"Content-Type": "application/json"},
    )
    result = await response.json()
    if response.status == 200:
        print(f"[✓] {label} — status: {result.get('status')}")
        inner = result.get("result", {})
        for k, v in inner.items():
            if k != "trust_hash":
                print(f"    {k}: {v}")
        print(f"    trust_hash: {inner.get('trust_hash', 'N/A')}")
    else:
        print(f"[✗] {label} failed — {response.status}: {result}")
    return result


async def main(testnet: bool = False):
    if testnet:
        global FACILITATOR_URL, EVM_NETWORK, BASE_URL
        FACILITATOR_URL = "https://x402.org/facilitator"
        EVM_NETWORK     = "eip155:84532"
        BASE_URL        = "http://localhost:8089"
        print("[Testnet mode] Using x402.org facilitator + Base Sepolia")

    # --- Wallet setup ---
    # Option A: CDP managed wallet (recommended)
    try:
        from coinbase.cdp_sdk import CdpClient
        cdp    = CdpClient()
        signer = await cdp.evm.get_or_create_account(name="logicnodes-agent")
        print(f"[Wallet] CDP wallet: {signer.address}")
    except ImportError:
        # Option B: raw private key via viem/eth_account
        from eth_account import Account
        pk     = os.getenv("EVM_PRIVATE_KEY")
        if not pk:
            raise ValueError("Set CDP credentials or EVM_PRIVATE_KEY in .env")
        signer = Account.from_key(pk)
        print(f"[Wallet] Private key wallet: {signer.address}")

    # --- x402 client setup ---
    try:
        from x402.client import x402Client
        from x402.mechanisms.evm.exact import ExactEvmClientScheme
        from x402.http import HTTPFacilitatorClient, FacilitatorConfig

        client = x402Client()
        client.register(
            EVM_NETWORK,
            ExactEvmClientScheme(signer=signer),
        )
        facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))

        # Wrap aiohttp session with x402 payment handling
        import aiohttp
        from x402.http.client.aiohttp import wrap_session_with_payment

        async with aiohttp.ClientSession() as session:
            fetch_with_payment = wrap_session_with_payment(session, client, facilitator)

            # 1. Discover services
            await discover_services(session)

            # 2. Call json_sanitizer
            await call_with_payment(
                fetch_with_payment,
                f"{BASE_URL}/call/json_sanitizer",
                {"messy_json": '{name: "Alice", age: 30, city: "Phoenix",}'},
                "JSON Sanitizer ($0.05 USDC)",
            )

            # 3. Call pii_scrubber
            await call_with_payment(
                fetch_with_payment,
                f"{BASE_URL}/call/pii_scrubber",
                {"text": "Please contact Jane Doe at jane.doe@example.com or call 602-555-9876"},
                "PII Scrubber ($0.05 USDC)",
            )

            # 4. Call rug_pull_detector
            await call_with_payment(
                fetch_with_payment,
                f"{BASE_URL}/call/rug_pull_detector",
                {"contract_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "chain": "base"},
                "Rug Pull Detector ($0.50 USDC)",
            )

    except ImportError as e:
        print(f"[Error] Missing dependency: {e}")
        print("Install with: uv add x402 aiohttp coinbase-cdp-sdk")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--testnet", action="store_true", help="Use testnet facilitator and Base Sepolia")
    args = parser.parse_args()
    asyncio.run(main(testnet=args.testnet))
