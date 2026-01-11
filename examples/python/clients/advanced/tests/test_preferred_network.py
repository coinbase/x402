"""Tests for the preferred network selector example."""

import pytest
from eth_account import Account

from x402 import x402Client
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.schemas import PaymentRequired, PaymentRequirements


class TestPreferredNetworkSelector:
    """Test suite for custom network preference selector."""

    def test_selects_preferred_network(self, test_account: Account):
        """Verify custom selector picks preferred network from options."""
        # Define preferences: Base > Ethereum
        preferences = ["eip155:8453", "eip155:1"]

        def preferred_selector(version, options):
            for pref in preferences:
                for opt in options:
                    if opt.network == pref:
                        return opt
            return options[0]

        client = x402Client(payment_requirements_selector=preferred_selector)

        # Register for all EVM networks
        client.register("eip155:*", ExactEvmScheme(EthAccountSigner(test_account)))

        # Create payment required with multiple options
        requirements = [
            PaymentRequirements(
                scheme="exact",
                network="eip155:1",  # Ethereum mainnet
                asset="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
            PaymentRequirements(
                scheme="exact",
                network="eip155:8453",  # Base mainnet (preferred)
                asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
        ]

        payment_required = PaymentRequired(x402_version=2, accepts=requirements)

        # Create payload - should select Base network
        payload = client.create_payment_payload(payment_required)
        assert payload.accepted.network == "eip155:8453"

    def test_falls_back_to_first_option(self, test_account: Account):
        """Verify fallback when preferred network not available."""
        # Preferences that won't match
        preferences = ["eip155:42161", "eip155:10"]

        def preferred_selector(version, options):
            for pref in preferences:
                for opt in options:
                    if opt.network == pref:
                        return opt
            # Fallback to first
            return options[0]

        client = x402Client(payment_requirements_selector=preferred_selector)
        client.register("eip155:*", ExactEvmScheme(EthAccountSigner(test_account)))

        requirements = [
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",  # Base Sepolia
                asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
        ]

        payment_required = PaymentRequired(x402_version=2, accepts=requirements)

        # Should fall back to first (only) option
        payload = client.create_payment_payload(payment_required)
        assert payload.accepted.network == "eip155:84532"

    def test_selector_receives_filtered_options(self, test_account: Account):
        """Verify selector only sees mutually-supported options."""
        received_options = []

        def capturing_selector(version, options):
            received_options.extend(options)
            return options[0]

        client = x402Client(payment_requirements_selector=capturing_selector)

        # Only register for Base networks
        client.register("eip155:84532", ExactEvmScheme(EthAccountSigner(test_account)))
        client.register("eip155:8453", ExactEvmScheme(EthAccountSigner(test_account)))

        # Server offers multiple networks, but only some are registered
        requirements = [
            PaymentRequirements(
                scheme="exact",
                network="eip155:1",  # Ethereum - NOT registered
                asset="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
            PaymentRequirements(
                scheme="exact",
                network="eip155:8453",  # Base mainnet - registered
                asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",  # Base Sepolia - registered
                asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
        ]

        payment_required = PaymentRequired(x402_version=2, accepts=requirements)
        client.create_payment_payload(payment_required)

        # Selector should only receive the 2 registered networks
        assert len(received_options) == 2
        networks = {opt.network for opt in received_options}
        assert networks == {"eip155:8453", "eip155:84532"}
        assert "eip155:1" not in networks


class TestNetworkPreferenceOrder:
    """Test network preference ordering logic."""

    def test_preference_order_maintained(self, test_account: Account):
        """Verify preferences are tried in order."""
        selected_networks = []

        def ordered_selector(version, options):
            preferences = ["eip155:8453", "eip155:84532", "eip155:1"]
            for pref in preferences:
                for opt in options:
                    if opt.network == pref:
                        selected_networks.append(opt.network)
                        return opt
            return options[0]

        client = x402Client(payment_requirements_selector=ordered_selector)
        client.register("eip155:*", ExactEvmScheme(EthAccountSigner(test_account)))

        # Offer networks in reverse preference order
        requirements = [
            PaymentRequirements(
                scheme="exact",
                network="eip155:1",
                asset="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={},
            ),
        ]

        payment_required = PaymentRequired(x402_version=2, accepts=requirements)
        payload = client.create_payment_payload(payment_required)

        # Should select Base Sepolia (second preference, since Base mainnet not available)
        assert payload.accepted.network == "eip155:84532"
        assert selected_networks == ["eip155:84532"]
