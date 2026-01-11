"""End-to-end integration tests against a real x402 server.

These tests require:
1. A running x402 resource server (e.g., the FastAPI example)
2. A funded Ethereum account on Base Sepolia
3. RUN_E2E_TESTS=1 environment variable

To run:
    RUN_E2E_TESTS=1 uv run pytest tests/test_e2e_integration.py -v
"""

import asyncio
import os
import sys

import pytest

# Skip all tests in this module if RUN_E2E_TESTS is not set
pytestmark = pytest.mark.skipif(
    not os.getenv("RUN_E2E_TESTS"),
    reason="Set RUN_E2E_TESTS=1 to run E2E tests"
)

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def e2e_private_key() -> str:
    """Get private key from environment for E2E tests."""
    key = os.getenv("PRIVATE_KEY")
    if not key:
        pytest.skip("PRIVATE_KEY environment variable required for E2E tests")
    return key


@pytest.fixture
def e2e_url() -> str:
    """Get resource server URL for E2E tests."""
    base_url = os.getenv("RESOURCE_SERVER_URL", "http://localhost:4021")
    endpoint = os.getenv("ENDPOINT_PATH", "/weather")
    return f"{base_url}{endpoint}"


class TestHooksE2E:
    """E2E tests for hooks example."""

    @pytest.mark.asyncio
    async def test_hooks_e2e(self, e2e_private_key: str, e2e_url: str):
        """E2E: Complete payment flow with hooks on Base Sepolia."""
        from hooks import run_hooks_example

        # This will make a real request and trigger hooks
        await run_hooks_example(e2e_private_key, e2e_url)

    @pytest.mark.asyncio
    async def test_hooks_abort_flow(self, e2e_private_key: str, e2e_url: str):
        """E2E: Verify abort hook prevents payment."""
        from eth_account import Account
        from x402 import x402Client
        from x402.http.clients import x402HttpxClient
        from x402.mechanisms.evm import EthAccountSigner
        from x402.mechanisms.evm.exact.register import register_exact_evm_client
        from x402.schemas import AbortResult, PaymentAbortedError

        account = Account.from_key(e2e_private_key)
        client = x402Client()
        register_exact_evm_client(client, EthAccountSigner(account))

        # Register hook that aborts all payments
        client.on_before_payment_creation(
            lambda ctx: AbortResult(reason="E2E test abort")
        )

        async with x402HttpxClient(client) as http:
            # Should fail with PaymentAbortedError
            with pytest.raises(PaymentAbortedError):
                await http.get(e2e_url)


class TestPreferredNetworkE2E:
    """E2E tests for preferred network example."""

    @pytest.mark.asyncio
    async def test_preferred_network_e2e(self, e2e_private_key: str, e2e_url: str):
        """E2E: Payment with custom network selection."""
        from preferred_network import run_preferred_network_example

        await run_preferred_network_example(e2e_private_key, e2e_url)


class TestBuilderPatternE2E:
    """E2E tests for builder pattern example."""

    @pytest.mark.asyncio
    async def test_builder_pattern_e2e(self, e2e_private_key: str, e2e_url: str):
        """E2E: Payment using network-specific registration."""
        from builder_pattern import run_builder_pattern_example

        await run_builder_pattern_example(e2e_private_key, e2e_url)


class TestErrorRecoveryE2E:
    """E2E tests for error recovery example."""

    @pytest.mark.asyncio
    async def test_error_recovery_e2e(self, e2e_private_key: str, e2e_url: str):
        """E2E: Payment with error tracking and statistics."""
        from error_recovery import run_error_recovery_example

        await run_error_recovery_example(e2e_private_key, e2e_url)


class TestCustomTransportE2E:
    """E2E tests for custom transport example."""

    @pytest.mark.asyncio
    async def test_custom_transport_e2e(self, e2e_private_key: str, e2e_url: str):
        """E2E: Payment through custom transport with timing."""
        from custom_transport import run_custom_transport_example

        await run_custom_transport_example(e2e_private_key, e2e_url)


class TestAllExamplesE2E:
    """Run all examples in sequence."""

    @pytest.mark.asyncio
    async def test_all_examples_sequential(self, e2e_private_key: str, e2e_url: str):
        """E2E: Run all examples in sequence."""
        from hooks import run_hooks_example
        from preferred_network import run_preferred_network_example
        from builder_pattern import run_builder_pattern_example
        from error_recovery import run_error_recovery_example
        from custom_transport import run_custom_transport_example

        examples = [
            ("hooks", run_hooks_example),
            ("preferred_network", run_preferred_network_example),
            ("builder_pattern", run_builder_pattern_example),
            ("error_recovery", run_error_recovery_example),
            ("custom_transport", run_custom_transport_example),
        ]

        for name, run_fn in examples:
            print(f"\n{'='*60}")
            print(f"Running: {name}")
            print(f"{'='*60}\n")

            try:
                await run_fn(e2e_private_key, e2e_url)
            except Exception as e:
                pytest.fail(f"Example '{name}' failed: {e}")

            # Small delay between requests
            await asyncio.sleep(1)
