#!/usr/bin/env python3
"""Advanced x402 client examples - main entry point.

This module provides a CLI to run different advanced examples demonstrating
various x402 client features including hooks, custom selectors, builder patterns,
error recovery, and custom HTTP transports.

Usage:
    python index.py [example_name]

Examples:
    python index.py hooks              # Payment lifecycle hooks
    python index.py preferred_network  # Custom network selection
    python index.py builder_pattern    # Network-specific registration
    python index.py error_recovery     # Error classification and recovery
    python index.py custom_transport   # Custom httpx transport
    python index.py all                # Run all examples
"""

import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


EXAMPLES = {
    "hooks": "Payment lifecycle hooks - before, after, failure callbacks",
    "preferred_network": "Custom network preference selector",
    "builder_pattern": "Network-specific registration with builder pattern",
    "error_recovery": "Error classification and recovery strategies",
    "custom_transport": "Custom httpx transport with retry/timing",
}


def validate_environment() -> tuple[str, str]:
    """Validate required environment variables.

    Returns:
        Tuple of (private_key, url).

    Raises:
        SystemExit: If required environment variables are missing.
    """
    private_key = os.getenv("PRIVATE_KEY")
    base_url = os.getenv("RESOURCE_SERVER_URL", "http://localhost:4021")
    endpoint_path = os.getenv("ENDPOINT_PATH", "/weather")

    if not private_key:
        print("Error: PRIVATE_KEY environment variable is required")
        print("Please copy .env-local to .env and fill in your private key.")
        sys.exit(1)

    return private_key, f"{base_url}{endpoint_path}"


async def run_hooks_example(private_key: str, url: str) -> None:
    """Run the hooks example."""
    from hooks import run_hooks_example
    await run_hooks_example(private_key, url)


async def run_preferred_network_example(private_key: str, url: str) -> None:
    """Run the preferred network example."""
    from preferred_network import run_preferred_network_example
    await run_preferred_network_example(private_key, url)


async def run_builder_pattern_example(private_key: str, url: str) -> None:
    """Run the builder pattern example."""
    from builder_pattern import run_builder_pattern_example
    await run_builder_pattern_example(private_key, url)


async def run_error_recovery_example(private_key: str, url: str) -> None:
    """Run the error recovery example."""
    from error_recovery import run_error_recovery_example
    await run_error_recovery_example(private_key, url)


async def run_custom_transport_example(private_key: str, url: str) -> None:
    """Run the custom transport example."""
    from custom_transport import run_custom_transport_example
    await run_custom_transport_example(private_key, url)


EXAMPLE_RUNNERS = {
    "hooks": run_hooks_example,
    "preferred_network": run_preferred_network_example,
    "builder_pattern": run_builder_pattern_example,
    "error_recovery": run_error_recovery_example,
    "custom_transport": run_custom_transport_example,
}


async def run_example(name: str, private_key: str, url: str) -> None:
    """Run a specific example.

    Args:
        name: Name of the example to run.
        private_key: EVM private key for signing.
        url: URL to make the request to.
    """
    print(f"\n{'='*60}")
    print(f"Running: {name}")
    print(f"Description: {EXAMPLES[name]}")
    print(f"{'='*60}\n")

    runner = EXAMPLE_RUNNERS[name]
    await runner(private_key, url)


async def run_all_examples(private_key: str, url: str) -> None:
    """Run all examples sequentially.

    Args:
        private_key: EVM private key for signing.
        url: URL to make the request to.
    """
    for name in EXAMPLES:
        try:
            await run_example(name, private_key, url)
        except Exception as e:
            print(f"\n❌ Example '{name}' failed: {e}")
        print()


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Advanced x402 client examples",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Available examples:
  hooks              Payment lifecycle hooks (before, after, failure)
  preferred_network  Custom network preference selector
  builder_pattern    Network-specific registration with builder pattern
  error_recovery     Error classification and recovery strategies
  custom_transport   Custom httpx transport with retry/timing
  all                Run all examples sequentially
""",
    )
    parser.add_argument(
        "example",
        nargs="?",
        default="hooks",
        choices=[*EXAMPLES.keys(), "all"],
        help="Example to run (default: hooks)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available examples",
    )

    args = parser.parse_args()

    if args.list:
        print("Available examples:\n")
        for name, desc in EXAMPLES.items():
            print(f"  {name:20} {desc}")
        print(f"\n  {'all':20} Run all examples sequentially")
        return

    private_key, url = validate_environment()

    if args.example == "all":
        asyncio.run(run_all_examples(private_key, url))
    else:
        asyncio.run(run_example(args.example, private_key, url))


if __name__ == "__main__":
    main()
