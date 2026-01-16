"""Async payment lifecycle hooks example.

Demonstrates how to register async hooks for payment creation lifecycle events.
The x402Client supports both sync and async hooks (auto-detected).

Async hooks allow you to add custom logic at different stages:
- on_before_payment_creation: Called before payment creation starts, can abort
- on_after_payment_creation: Called after successful payment creation
- on_payment_creation_failure: Called when payment creation fails, can recover

Using async hooks is useful when you need to perform I/O operations like:
- Checking external rate limits or quotas
- Validating against remote services
- Sending metrics to external monitoring systems
- Logging to remote services or databases
- Triggering webhooks or notifications
"""

import asyncio
import os
import sys
import time

from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.schemas import (
    AbortResult,
    PaymentCreatedContext,
    PaymentCreationContext,
    PaymentCreationFailureContext,
)

load_dotenv()


# =============================================================================
# Simulated async services (replace with real implementations)
# =============================================================================


async def check_rate_limit(network: str) -> bool:
    """Simulate checking rate limits against an external service.

    In production, this could be a call to Redis, a rate limiting API, etc.
    """
    await asyncio.sleep(0.05)  # Simulate network latency
    print(f"   ⏱️  Rate limit check for {network}: OK")
    return True


async def send_metrics(event: str, data: dict) -> None:
    """Simulate sending metrics to an external monitoring service.

    In production, this could be a call to Datadog, Prometheus, etc.
    """
    await asyncio.sleep(0.03)  # Simulate network latency
    print(f"   📊 Metrics sent: {event}")


async def log_to_remote(level: str, message: str, context: dict) -> None:
    """Simulate logging to a remote logging service.

    In production, this could be a call to Elasticsearch, Splunk, etc.
    """
    await asyncio.sleep(0.02)  # Simulate network latency
    print(f"   📝 Remote log [{level}]: {message}")


async def before_payment_creation_hook(
    context: PaymentCreationContext,
) -> AbortResult | None:
    """Async hook called before payment creation.

    This hook receives context about the payment being created.
    Return AbortResult to abort the payment, or None to continue.

    Being async allows you to perform I/O operations like:
    - Checking external rate limits or quotas
    - Validating against a remote service
    - Logging to external systems
    """
    start = time.perf_counter()
    print("🔍 [BeforePaymentCreation] Creating payment for:")
    print(f"   Network: {context.selected_requirements.network}")
    print(f"   Scheme: {context.selected_requirements.scheme}")
    print(f"   Amount: {context.selected_requirements.get_amount()}")

    # Actually perform async operations
    await check_rate_limit(context.selected_requirements.network)

    elapsed = (time.perf_counter() - start) * 1000
    print(f"   ✓ Hook completed in {elapsed:.1f}ms")
    print()

    # Example: Abort payments over a certain amount
    # amount = int(context.selected_requirements.get_amount())
    # if amount > 1_000_000_000:  # 1000 USDC (6 decimals)
    #     return AbortResult(reason="Payment amount exceeds limit")

    return None  # Continue with payment creation


async def after_payment_creation_hook(context: PaymentCreatedContext) -> None:
    """Async hook called after successful payment creation.

    Use this for logging, metrics, or other side effects.
    Errors here are logged but don't fail the payment.

    Being async allows you to perform I/O operations like:
    - Sending metrics to external monitoring systems
    - Logging to remote services
    - Triggering webhooks
    """
    start = time.perf_counter()
    print("✅ [AfterPaymentCreation] Payment created successfully")
    print(f"   Version: {context.payment_payload.x402_version}")
    print(f"   Network: {context.selected_requirements.network}")
    print(f"   Scheme: {context.selected_requirements.scheme}")

    # Actually send metrics asynchronously
    await send_metrics(
        "payment_created",
        {
            "network": context.selected_requirements.network,
            "scheme": context.selected_requirements.scheme,
        },
    )

    elapsed = (time.perf_counter() - start) * 1000
    print(f"   ✓ Hook completed in {elapsed:.1f}ms")
    print()


async def payment_creation_failure_hook(
    context: PaymentCreationFailureContext,
) -> None:
    """Async hook called when payment creation fails.

    You could attempt to recover by returning RecoveredPayloadResult
    with an alternative payload.

    Being async allows you to:
    - Fetch cached payloads from external storage
    - Log errors to remote systems
    - Trigger alerting webhooks
    """
    start = time.perf_counter()
    print(f"❌ [OnPaymentCreationFailure] Payment creation failed: {context.error}")
    print(f"   Network: {context.selected_requirements.network}")
    print(f"   Scheme: {context.selected_requirements.scheme}")

    # Actually log error to remote service asynchronously
    await log_to_remote(
        "error",
        f"Payment creation failed: {context.error}",
        {
            "network": context.selected_requirements.network,
            "scheme": context.selected_requirements.scheme,
        },
    )

    elapsed = (time.perf_counter() - start) * 1000
    print(f"   ✓ Hook completed in {elapsed:.1f}ms")
    print()

    # Example: Fetch a cached payload from Redis
    # cached = await fetch_cached_payload(context.selected_requirements.network)
    # if cached:
    #     return RecoveredPayloadResult(payload=cached)

    return None  # Don't recover, let it fail


async def run_hooks_example(private_key: str, url: str) -> None:
    """Run the hooks example.

    Args:
        private_key: EVM private key for signing.
        url: URL to make the request to.
    """
    print("🔧 Creating client with payment lifecycle hooks...\n")

    account = Account.from_key(private_key)
    print(f"Wallet address: {account.address}\n")

    # Create client with hooks registered via builder pattern
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))

    # Register lifecycle hooks
    client.on_before_payment_creation(before_payment_creation_hook)
    client.on_after_payment_creation(after_payment_creation_hook)
    client.on_payment_creation_failure(payment_creation_failure_hook)

    # Create HTTP client helper for payment response extraction
    http_client = x402HTTPClient(client)

    print(f"🌐 Making request to: {url}\n")

    async with x402HttpxClient(client) as http:
        response = await http.get(url)
        await response.aread()

        print(f"Response status: {response.status_code}")
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
    await run_hooks_example(private_key, url)


if __name__ == "__main__":
    asyncio.run(main())
