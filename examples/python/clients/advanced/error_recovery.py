"""Advanced error recovery example.

Demonstrates sophisticated error handling strategies:
- Automatic recovery from payment creation failures
- Custom error classification
- Fallback payment methods
- Detailed error logging and metrics
"""

import asyncio
import os
import sys
from dataclasses import dataclass, field
from enum import Enum

from dotenv import load_dotenv
from eth_account import Account

from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.schemas import (
    PaymentCreatedContext,
    PaymentCreationContext,
    PaymentCreationFailureContext,
)

load_dotenv()


class ErrorType(Enum):
    """Classification of payment creation errors."""

    NETWORK = "network"
    INSUFFICIENT_BALANCE = "insufficient_balance"
    SIGNING_ERROR = "signing_error"
    VALIDATION_ERROR = "validation_error"
    UNKNOWN = "unknown"


@dataclass
class ErrorStatistics:
    """Track error recovery statistics."""

    recovery_attempts: int = 0
    successful_recoveries: int = 0
    errors_by_type: dict[ErrorType, int] = field(default_factory=dict)

    def record_error(self, error_type: ErrorType) -> None:
        """Record an error occurrence."""
        self.recovery_attempts += 1
        self.errors_by_type[error_type] = self.errors_by_type.get(error_type, 0) + 1

    def record_recovery(self) -> None:
        """Record a successful recovery."""
        self.successful_recoveries += 1

    def print_summary(self) -> None:
        """Print error statistics summary."""
        print("\n📊 Error Recovery Statistics:")
        print(f"   Total recovery attempts: {self.recovery_attempts}")
        print(f"   Successful recoveries: {self.successful_recoveries}")
        if self.errors_by_type:
            print("   Errors by type:")
            for error_type, count in self.errors_by_type.items():
                print(f"     - {error_type.value}: {count}")


def classify_error(error: Exception) -> ErrorType:
    """Categorize errors for targeted recovery strategies.

    Args:
        error: The exception to classify.

    Returns:
        The error type classification.
    """
    error_msg = str(error).lower()

    if any(kw in error_msg for kw in ["network", "timeout", "connection", "unreachable"]):
        return ErrorType.NETWORK
    elif any(kw in error_msg for kw in ["balance", "funds", "insufficient"]):
        return ErrorType.INSUFFICIENT_BALANCE
    elif any(kw in error_msg for kw in ["sign", "signature", "private key"]):
        return ErrorType.SIGNING_ERROR
    elif any(kw in error_msg for kw in ["invalid", "malformed", "validation"]):
        return ErrorType.VALIDATION_ERROR
    else:
        return ErrorType.UNKNOWN


def create_error_recovery_hooks(
    stats: ErrorStatistics,
) -> tuple:
    """Create hooks with error recovery logic.

    Args:
        stats: Statistics tracker for recording errors.

    Returns:
        Tuple of (before_hook, after_hook, failure_hook).
    """

    def before_hook(context: PaymentCreationContext) -> None:
        """Pre-flight validation before payment creation."""
        print("🔍 [Pre-flight] Validating payment requirements...")
        print(f"   Network: {context.selected_requirements.network}")
        print(f"   Scheme: {context.selected_requirements.scheme}")
        print()
        return None

    def after_hook(context: PaymentCreatedContext) -> None:
        """Success logging after payment creation."""
        print("✅ [Success] Payment created")
        if stats.recovery_attempts > 0:
            print(f"   Recovered after {stats.recovery_attempts} attempts")
        return None

    def failure_hook(context: PaymentCreationFailureContext) -> None:
        """Advanced error recovery handler."""
        error_type = classify_error(context.error)
        stats.record_error(error_type)

        print(f"❌ [Error Recovery] Payment creation failed (attempt {stats.recovery_attempts})")
        print(f"   Error: {context.error}")
        print(f"   Network: {context.selected_requirements.network}")
        print(f"   Scheme: {context.selected_requirements.scheme}")
        print(f"   Error type: {error_type.value}")

        # Recovery strategy based on error type
        if error_type == ErrorType.NETWORK:
            print("   🔄 Network error - will retry automatically")
            stats.record_recovery()
            return None  # Let retry logic handle it

        elif error_type == ErrorType.INSUFFICIENT_BALANCE:
            print("   💰 Insufficient balance - cannot recover")
            # Could switch to a different wallet or notify user
            return None  # Propagate error

        elif error_type == ErrorType.SIGNING_ERROR:
            print("   🔑 Signing error - attempting recovery...")
            # In a real scenario, you might try with a different signer
            stats.record_recovery()
            return None

        elif error_type == ErrorType.VALIDATION_ERROR:
            print("   ⚠️  Validation error - check payment requirements")
            return None

        else:
            print("   ⚠️  Unknown error - will not recover")
            return None

    return before_hook, after_hook, failure_hook


async def run_error_recovery_example(private_key: str, url: str) -> None:
    """Run the error recovery example.

    Args:
        private_key: EVM private key for signing.
        url: URL to make the request to.
    """
    print("🛡️  Creating client with advanced error recovery...\n")

    account = Account.from_key(private_key)
    print(f"Wallet address: {account.address}\n")

    # Create statistics tracker
    stats = ErrorStatistics()

    # Create hooks with error recovery logic
    before_hook, after_hook, failure_hook = create_error_recovery_hooks(stats)

    # Create client with error recovery hooks
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))

    client.on_before_payment_creation(before_hook)
    client.on_after_payment_creation(after_hook)
    client.on_payment_creation_failure(failure_hook)

    # Create HTTP client helper for payment response extraction
    http_client = x402HTTPClient(client)

    print(f"🌐 Making request to: {url}\n")

    try:
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

    except Exception as e:
        print(f"\n❌ Request failed after recovery attempts: {e}")

    finally:
        # Print statistics regardless of success/failure
        stats.print_summary()


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
    await run_error_recovery_example(private_key, url)


if __name__ == "__main__":
    asyncio.run(main())
