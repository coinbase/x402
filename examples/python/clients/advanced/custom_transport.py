"""Custom HTTP transport with retry logic and timing example.

Demonstrates how to implement a custom HTTP transport that:
- Automatically retries failed requests
- Implements exponential backoff
- Sets custom timeouts
- Adds request timing/tracing
"""

import asyncio
import os
import sys
import time

import httpx
from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

load_dotenv()


class RetryTransport(httpx.AsyncHTTPTransport):
    """Custom transport with retry logic and exponential backoff.

    Wraps an httpx transport to automatically retry failed requests.
    Uses exponential backoff between retries.
    """

    def __init__(
        self,
        max_retries: int = 3,
        retry_delay: float = 0.1,
        **kwargs,
    ) -> None:
        """Initialize the retry transport.

        Args:
            max_retries: Maximum number of retry attempts.
            retry_delay: Initial delay between retries in seconds.
            **kwargs: Additional arguments passed to AsyncHTTPTransport.
        """
        super().__init__(**kwargs)
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        """Handle request with retry logic.

        Args:
            request: The HTTP request to send.

        Returns:
            The HTTP response.

        Raises:
            httpx.TransportError: If all retries are exhausted.
        """
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            if attempt > 0:
                # Exponential backoff: delay doubles each attempt
                delay = self.retry_delay * (2 ** (attempt - 1))
                print(f"⏳ Retry attempt {attempt} after {delay:.2f}s")
                await asyncio.sleep(delay)

            try:
                response = await super().handle_async_request(request)

                # Success or non-retryable status
                if response.status_code < 500:
                    return response

                # Server error - will retry
                print(f"⚠️  Server error {response.status_code} (attempt {attempt + 1}/{self.max_retries + 1})")
                last_error = httpx.HTTPStatusError(
                    f"Server returned {response.status_code}",
                    request=request,
                    response=response,
                )

            except httpx.TransportError as e:
                print(f"⚠️  Transport error (attempt {attempt + 1}/{self.max_retries + 1}): {e}")
                last_error = e

        # All retries exhausted
        raise httpx.TransportError(f"Max retries exceeded: {last_error}")


class TimingEventHooks:
    """Event hooks for timing HTTP requests."""

    def __init__(self) -> None:
        """Initialize timing hooks."""
        self._request_times: dict[int, float] = {}

    async def on_request(self, request: httpx.Request) -> None:
        """Record request start time."""
        self._request_times[id(request)] = time.perf_counter()
        print(f"📤 Starting request to {request.url.path}")

    async def on_response(self, response: httpx.Response) -> None:
        """Log request duration on response."""
        request_id = id(response.request)
        if request_id in self._request_times:
            duration = time.perf_counter() - self._request_times.pop(request_id)
            print(f"⏱️  Request to {response.url.path} took {duration:.3f}s (status: {response.status_code})")


async def run_custom_transport_example(private_key: str, url: str) -> None:
    """Run the custom transport example.

    Args:
        private_key: EVM private key for signing.
        url: URL to make the request to.
    """
    print("📦 Creating client with custom transport...\n")

    account = Account.from_key(private_key)
    print(f"Wallet address: {account.address}\n")

    # Create x402 client
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))

    # Create timing hooks
    timing_hooks = TimingEventHooks()

    # Create custom transport with retry logic
    custom_transport = RetryTransport(
        max_retries=3,
        retry_delay=0.1,
        # Configure connection pool
        limits=httpx.Limits(
            max_keepalive_connections=10,
            max_connections=100,
        ),
    )

    # Create HTTP client helper for payment response extraction
    http_client = x402HTTPClient(client)

    print(f"🌐 Making request to: {url}\n")
    print("Transport configuration:")
    print("  - Max retries: 3")
    print("  - Initial retry delay: 0.1s (exponential backoff)")
    print("  - Request timeout: 30s")
    print()

    # Create httpx client with custom transport and timing hooks
    async with httpx.AsyncClient(
        transport=custom_transport,
        timeout=httpx.Timeout(30.0),
        event_hooks={
            "request": [timing_hooks.on_request],
            "response": [timing_hooks.on_response],
        },
    ) as httpx_client:
        # Use x402HttpxClient with our custom httpx client
        async with x402HttpxClient(client, httpx_client=httpx_client) as http:
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
    await run_custom_transport_example(private_key, url)


if __name__ == "__main__":
    asyncio.run(main())
