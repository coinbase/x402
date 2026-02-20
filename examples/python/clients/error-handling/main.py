"""Comprehensive x402 Python error handling example.

This example demonstrates robust error handling patterns for x402 payments including:
- Network connectivity issues
- Payment verification failures
- Facilitator communication errors
- Timeout handling with exponential backoff
- Batch operation error isolation
- Configuration validation
- Graceful shutdown and cleanup

Run with: python main.py
"""

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from eth_account import Account
from pydantic import BaseModel, ValidationError

from x402 import x402Client
from x402.exceptions import (
    NetworkError,
    PaymentError,
    PaymentExpiredError,
    PaymentInvalidError,
    PaymentVerificationError,
    ResourceError,
    SettlementError,
    ValidationError as X402ValidationError,
)
from x402.http import x402HTTPClient
from x402.http.clients import x402_httpx
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mechanisms.svm import KeypairSigner
from x402.mechanisms.svm.exact.register import register_exact_svm_client

# Load environment variables
load_dotenv()


class PaymentErrorType(Enum):
    """Categorization of payment errors for handling strategies."""

    NETWORK_ERROR = "network_error"  # Retry with backoff
    PAYMENT_INVALID = "payment_invalid"  # Don't retry, likely user error
    PAYMENT_EXPIRED = "payment_expired"  # Retry with new payment
    VERIFICATION_FAILED = "verification_failed"  # Retry with backoff
    SETTLEMENT_FAILED = "settlement_failed"  # Retry with backoff
    RESOURCE_ERROR = "resource_error"  # Don't retry, server issue
    CONFIGURATION_ERROR = "configuration_error"  # Don't retry, fix config
    UNKNOWN_ERROR = "unknown_error"  # Retry with caution


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_attempts: int = 3
    initial_delay: float = 1.0
    max_delay: float = 60.0
    backoff_multiplier: float = 2.0
    jitter: bool = True


@dataclass
class ErrorContext:
    """Context information for error analysis."""

    timestamp: datetime
    url: str
    error_type: PaymentErrorType
    error_message: str
    attempt: int
    total_attempts: int
    retry_delay: Optional[float] = None


class ConfigValidationModel(BaseModel):
    """Pydantic model for environment configuration validation."""

    evm_private_key: Optional[str] = None
    svm_private_key: Optional[str] = None
    resource_server_url: str
    endpoint_path: str = "/api/data"
    facilitator_url: Optional[str] = None
    request_timeout: float = 30.0
    max_retries: int = 3


class X402ErrorHandler:
    """Centralized error handling for x402 operations."""

    def __init__(self, retry_config: RetryConfig = RetryConfig()):
        self.retry_config = retry_config
        self.error_history: List[ErrorContext] = []

    def categorize_error(self, error: Exception) -> PaymentErrorType:
        """Categorize error for appropriate handling strategy."""
        if isinstance(error, NetworkError):
            return PaymentErrorType.NETWORK_ERROR
        elif isinstance(error, PaymentInvalidError):
            return PaymentErrorType.PAYMENT_INVALID
        elif isinstance(error, PaymentExpiredError):
            return PaymentErrorType.PAYMENT_EXPIRED
        elif isinstance(error, PaymentVerificationError):
            return PaymentErrorType.VERIFICATION_FAILED
        elif isinstance(error, SettlementError):
            return PaymentErrorType.SETTLEMENT_FAILED
        elif isinstance(error, ResourceError):
            return PaymentErrorType.RESOURCE_ERROR
        elif isinstance(error, X402ValidationError):
            return PaymentErrorType.CONFIGURATION_ERROR
        elif isinstance(error, (httpx.TimeoutException, asyncio.TimeoutError)):
            return PaymentErrorType.NETWORK_ERROR
        elif isinstance(error, httpx.RequestError):
            return PaymentErrorType.NETWORK_ERROR
        else:
            return PaymentErrorType.UNKNOWN_ERROR

    def should_retry(self, error_type: PaymentErrorType, attempt: int) -> bool:
        """Determine if error should be retried."""
        if attempt >= self.retry_config.max_attempts:
            return False

        # Don't retry user/configuration errors
        if error_type in [
            PaymentErrorType.PAYMENT_INVALID,
            PaymentErrorType.RESOURCE_ERROR,
            PaymentErrorType.CONFIGURATION_ERROR,
        ]:
            return False

        return True

    def calculate_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay with jitter."""
        delay = min(
            self.retry_config.initial_delay
            * (self.retry_config.backoff_multiplier ** (attempt - 1)),
            self.retry_config.max_delay,
        )

        if self.retry_config.jitter:
            import random

            delay *= 0.5 + random.random()  # Add 0-50% jitter

        return delay

    def log_error(self, context: ErrorContext) -> None:
        """Log error with context for analysis."""
        self.error_history.append(context)

        retry_info = (
            f" (retrying in {context.retry_delay}s)"
            if context.retry_delay
            else " (not retrying)"
        )
        print(
            f"[{context.timestamp.isoformat()}] Error {context.attempt}/{context.total_attempts}: "
            f"{context.error_type.value} - {context.error_message}{retry_info}"
        )

    @asynccontextmanager
    async def with_retry(
        self, url: str, operation_name: str = "operation"
    ) -> AsyncGenerator[None, None]:
        """Context manager for operations with retry logic."""
        attempt = 0
        while attempt < self.retry_config.max_attempts:
            attempt += 1
            try:
                yield
                break  # Success, exit retry loop
            except Exception as e:
                error_type = self.categorize_error(e)
                context = ErrorContext(
                    timestamp=datetime.now(timezone.utc),
                    url=url,
                    error_type=error_type,
                    error_message=str(e),
                    attempt=attempt,
                    total_attempts=self.retry_config.max_attempts,
                )

                if self.should_retry(error_type, attempt):
                    delay = self.calculate_delay(attempt)
                    context.retry_delay = delay
                    self.log_error(context)
                    await asyncio.sleep(delay)
                    continue
                else:
                    self.log_error(context)
                    raise  # Re-raise the original exception


class BatchOperationResult:
    """Result of batch operation with error isolation."""

    def __init__(self):
        self.successful: List[Dict[str, Any]] = []
        self.failed: List[Dict[str, Any]] = []

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = len(self.successful) + len(self.failed)
        return len(self.successful) / total if total > 0 else 0.0

    def add_success(self, item: Dict[str, Any], result: Any) -> None:
        """Add successful operation."""
        self.successful.append(
            {"item": item, "result": result, "timestamp": datetime.now(timezone.utc)}
        )

    def add_failure(self, item: Dict[str, Any], error: Exception) -> None:
        """Add failed operation."""
        self.failed.append(
            {
                "item": item,
                "error": str(error),
                "error_type": type(error).__name__,
                "timestamp": datetime.now(timezone.utc),
            }
        )


def validate_configuration() -> ConfigValidationModel:
    """Validate environment configuration with clear error messages."""
    try:
        config = ConfigValidationModel(
            evm_private_key=os.getenv("EVM_PRIVATE_KEY"),
            svm_private_key=os.getenv("SVM_PRIVATE_KEY"),
            resource_server_url=os.getenv("RESOURCE_SERVER_URL", ""),
            endpoint_path=os.getenv("ENDPOINT_PATH", "/api/data"),
            facilitator_url=os.getenv("FACILITATOR_URL"),
            request_timeout=float(os.getenv("REQUEST_TIMEOUT", "30.0")),
            max_retries=int(os.getenv("MAX_RETRIES", "3")),
        )
    except (ValidationError, ValueError) as e:
        print(f"❌ Configuration validation failed: {e}")
        print("\nRequired environment variables:")
        print("  - RESOURCE_SERVER_URL (required)")
        print("  - EVM_PRIVATE_KEY or SVM_PRIVATE_KEY (at least one required)")
        print("\nOptional variables:")
        print("  - ENDPOINT_PATH (default: /api/data)")
        print("  - FACILITATOR_URL (uses default if not set)")
        print("  - REQUEST_TIMEOUT (default: 30.0)")
        print("  - MAX_RETRIES (default: 3)")
        sys.exit(1)

    if not config.evm_private_key and not config.svm_private_key:
        print("❌ At least one of EVM_PRIVATE_KEY or SVM_PRIVATE_KEY is required")
        sys.exit(1)

    return config


async def setup_x402_client(
    config: ConfigValidationModel, error_handler: X402ErrorHandler
) -> x402Client:
    """Initialize x402 client with comprehensive error handling."""
    print("🔧 Setting up x402 client...")

    try:
        client = x402Client()

        # Register EVM if configured
        if config.evm_private_key:
            try:
                account = Account.from_key(config.evm_private_key)
                register_exact_evm_client(client, EthAccountSigner(account))
                print(f"✅ EVM client registered: {account.address}")
            except Exception as e:
                print(f"❌ Failed to register EVM client: {e}")
                raise X402ValidationError(f"Invalid EVM private key: {e}")

        # Register SVM if configured
        if config.svm_private_key:
            try:
                signer = KeypairSigner.from_base58(config.svm_private_key)
                register_exact_svm_client(client, signer)
                print(f"✅ SVM client registered: {signer.address}")
            except Exception as e:
                print(f"❌ Failed to register SVM client: {e}")
                raise X402ValidationError(f"Invalid SVM private key: {e}")

        # Set facilitator if configured
        if config.facilitator_url:
            client.set_facilitator_url(config.facilitator_url)
            print(f"✅ Facilitator configured: {config.facilitator_url}")

        return client

    except Exception as e:
        print(f"❌ Client setup failed: {e}")
        raise


async def make_single_request(
    client: x402Client, url: str, error_handler: X402ErrorHandler, timeout: float = 30.0
) -> Dict[str, Any]:
    """Make a single x402 request with error handling."""
    async with error_handler.with_retry(url, "single_request"):
        async with x402_httpx(client, timeout=timeout) as session:
            response = await session.get(url)

            if response.status_code == 402:
                raise PaymentError(
                    "Payment required but not handled properly (status: 402)"
                )
            elif response.status_code >= 400:
                raise ResourceError(
                    f"Server error (status: {response.status_code}): {response.text}"
                )

            # Extract payment response if available
            http_client = x402HTTPClient(client)
            try:
                payment_response = http_client.get_payment_settle_response(
                    response.headers.get
                )
                return {
                    "status": response.status_code,
                    "body": response.text,
                    "payment_response": payment_response.model_dump()
                    if payment_response
                    else None,
                }
            except ValueError:
                return {
                    "status": response.status_code,
                    "body": response.text,
                    "payment_response": None,
                }


async def batch_requests_with_error_isolation(
    client: x402Client,
    urls: List[str],
    error_handler: X402ErrorHandler,
    timeout: float = 30.0,
    max_concurrent: int = 5,
) -> BatchOperationResult:
    """Perform batch requests with error isolation."""
    print(
        f"🔄 Processing {len(urls)} requests with concurrency limit of {max_concurrent}..."
    )

    result = BatchOperationResult()
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_url(url: str) -> None:
        async with semaphore:
            try:
                response_data = await make_single_request(
                    client, url, error_handler, timeout
                )
                result.add_success({"url": url}, response_data)
                print(f"✅ Success: {url}")
            except Exception as e:
                result.add_failure({"url": url}, e)
                print(f"❌ Failed: {url} - {e}")

    # Run all requests concurrently
    tasks = [process_url(url) for url in urls]
    await asyncio.gather(*tasks, return_exceptions=True)

    return result


def print_error_summary(error_handler: X402ErrorHandler) -> None:
    """Print summary of errors encountered."""
    if not error_handler.error_history:
        print("✅ No errors encountered!")
        return

    print(f"\n📊 Error Summary ({len(error_handler.error_history)} total errors):")

    # Group by error type
    error_counts = {}
    for error in error_handler.error_history:
        error_type = error.error_type.value
        error_counts[error_type] = error_counts.get(error_type, 0) + 1

    for error_type, count in sorted(error_counts.items()):
        print(f"  - {error_type}: {count}")

    # Show most recent errors
    print("\n🔍 Recent errors:")
    for error in error_handler.error_history[-3:]:
        print(f"  - [{error.timestamp.strftime('%H:%M:%S')}] {error.error_message}")


async def demonstrate_error_scenarios(
    client: x402Client, base_url: str, error_handler: X402ErrorHandler
) -> None:
    """Demonstrate various error scenarios and recovery."""
    print("\n🧪 Demonstrating error scenarios and recovery...")

    # Test URLs with various scenarios
    test_scenarios = [
        f"{base_url}/api/data",  # Normal protected endpoint
        f"{base_url}/api/nonexistent",  # 404 error
        f"{base_url}/api/slow",  # Timeout scenario (if server supports)
        "https://invalid-domain-x402-test.com/api/data",  # Network error
    ]

    # Process batch with error isolation
    batch_result = await batch_requests_with_error_isolation(
        client, test_scenarios, error_handler
    )

    print("\n📈 Batch Results:")
    print(f"  - Success rate: {batch_result.success_rate:.1%}")
    print(f"  - Successful: {len(batch_result.successful)}")
    print(f"  - Failed: {len(batch_result.failed)}")

    # Show successful responses
    for success in batch_result.successful:
        url = success["item"]["url"]
        status = success["result"]["status"]
        payment = success["result"]["payment_response"]
        payment_info = " (with payment)" if payment else " (no payment)"
        print(f"  ✅ {url} → {status}{payment_info}")

    # Show failed responses with error types
    for failure in batch_result.failed:
        url = failure["item"]["url"]
        error_type = failure["error_type"]
        print(f"  ❌ {url} → {error_type}")


@asynccontextmanager
async def graceful_shutdown():
    """Handle graceful shutdown of resources."""
    print("🚀 Starting x402 error handling demonstration...")
    try:
        yield
    except KeyboardInterrupt:
        print("\n⚠️ Received interrupt signal, shutting down gracefully...")
        # Cleanup code could go here
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        raise
    finally:
        print("🏁 Demonstration completed")


async def main() -> None:
    """Main demonstration of x402 error handling patterns."""
    # Validate configuration
    config = validate_configuration()

    # Initialize error handler
    retry_config = RetryConfig(
        max_attempts=config.max_retries,
        initial_delay=1.0,
        max_delay=30.0,
        backoff_multiplier=2.0,
        jitter=True,
    )
    error_handler = X402ErrorHandler(retry_config)

    async with graceful_shutdown():
        try:
            # Setup client
            client = await setup_x402_client(config, error_handler)

            # Build test URL
            url = f"{config.resource_server_url}{config.endpoint_path}"
            print(f"🎯 Target URL: {url}")

            # Demonstrate single request with retry
            print("\n📡 Making single request with error handling...")
            try:
                result = await make_single_request(
                    client, url, error_handler, config.request_timeout
                )
                print("✅ Single request successful:")
                print(f"   Status: {result['status']}")
                print(f"   Payment: {'Yes' if result['payment_response'] else 'No'}")
                if result["body"]:
                    # Truncate long responses
                    body = (
                        result["body"][:200] + "..."
                        if len(result["body"]) > 200
                        else result["body"]
                    )
                    print(f"   Body: {body}")
            except Exception as e:
                print(f"❌ Single request failed: {e}")

            # Demonstrate error scenarios
            await demonstrate_error_scenarios(
                client, config.resource_server_url, error_handler
            )

        finally:
            # Print error analysis
            print_error_summary(error_handler)


if __name__ == "__main__":
    asyncio.run(main())
