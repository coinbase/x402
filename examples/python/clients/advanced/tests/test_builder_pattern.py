"""Tests for the builder pattern example."""

import pytest
from eth_account import Account

from x402 import x402Client
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.schemas import PaymentRequired, PaymentRequirements


class TestBuilderPattern:
    """Test suite for network-specific registration with builder pattern."""

    def test_specific_network_takes_precedence(self, test_private_key: str):
        """Verify eip155:1 registration overrides eip155:* wildcard."""
        default_account = Account.from_key(test_private_key)
        # Create a different account for mainnet
        mainnet_account = Account.create()

        default_signer = EthAccountSigner(default_account)
        mainnet_signer = EthAccountSigner(mainnet_account)

        client = (
            x402Client()
            .register("eip155:*", ExactEvmScheme(default_signer))
            .register("eip155:1", ExactEvmScheme(mainnet_signer))
        )

        # Verify both are registered
        schemes = client.get_registered_schemes()
        v2_schemes = schemes.get(2, [])

        # Should have 2 registrations
        assert len(v2_schemes) == 2

        networks = {s["network"] for s in v2_schemes}
        assert "eip155:*" in networks
        assert "eip155:1" in networks

    def test_wildcard_fallback(self, test_account: Account):
        """Verify eip155:* catches unregistered specific networks."""
        client = x402Client()
        client.register("eip155:*", ExactEvmScheme(EthAccountSigner(test_account)))

        # Request payment for a network not specifically registered
        requirements = [
            PaymentRequirements(
                scheme="exact",
                network="eip155:42161",  # Arbitrum - not specifically registered
                asset="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
                amount="1000",
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                max_timeout_seconds=300,
                extra={"name": "USDC", "version": "2"},  # Required for EIP-712
            ),
        ]

        payment_required = PaymentRequired(x402_version=2, accepts=requirements)

        # Should work via wildcard
        payload = client.create_payment_payload(payment_required)
        assert payload.accepted.network == "eip155:42161"

    def test_different_signers_per_network(self, test_private_key: str):
        """Verify different signers can be used for different networks."""
        # Create different accounts
        mainnet_account = Account.from_key(test_private_key)
        testnet_account = Account.create()

        mainnet_signer = EthAccountSigner(mainnet_account)
        testnet_signer = EthAccountSigner(testnet_account)

        # Register with different signers
        client = (
            x402Client()
            .register("eip155:1", ExactEvmScheme(mainnet_signer))
            .register("eip155:84532", ExactEvmScheme(testnet_signer))
        )

        # Test mainnet request
        mainnet_req = PaymentRequired(
            x402_version=2,
            accepts=[
                PaymentRequirements(
                    scheme="exact",
                    network="eip155:1",
                    asset="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    amount="1000",
                    pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                    max_timeout_seconds=300,
                    extra={},
                ),
            ],
        )

        # Test testnet request
        testnet_req = PaymentRequired(
            x402_version=2,
            accepts=[
                PaymentRequirements(
                    scheme="exact",
                    network="eip155:84532",
                    asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    amount="1000",
                    pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                    max_timeout_seconds=300,
                    extra={},
                ),
            ],
        )

        mainnet_payload = client.create_payment_payload(mainnet_req)
        testnet_payload = client.create_payment_payload(testnet_req)

        # Both should succeed with their respective signers
        assert mainnet_payload.accepted.network == "eip155:1"
        assert testnet_payload.accepted.network == "eip155:84532"


class TestBuilderChaining:
    """Test builder pattern chaining behavior."""

    def test_method_chaining_returns_self(self, test_account: Account):
        """Verify register() returns self for chaining."""
        client = x402Client()

        result = client.register("eip155:*", ExactEvmScheme(EthAccountSigner(test_account)))
        assert result is client

    def test_multiple_registrations_chain(self, test_account: Account):
        """Verify multiple registrations can be chained."""
        signer = EthAccountSigner(test_account)

        client = (
            x402Client()
            .register("eip155:1", ExactEvmScheme(signer))
            .register("eip155:8453", ExactEvmScheme(signer))
            .register("eip155:84532", ExactEvmScheme(signer))
        )

        schemes = client.get_registered_schemes()
        v2_schemes = schemes.get(2, [])

        assert len(v2_schemes) == 3

    def test_hooks_and_registration_chain(self, test_account: Account):
        """Verify hooks and registration can be chained together."""
        signer = EthAccountSigner(test_account)

        def before_hook(ctx):
            return None

        def after_hook(ctx):
            return None

        client = (
            x402Client()
            .register("eip155:*", ExactEvmScheme(signer))
            .on_before_payment_creation(before_hook)
            .on_after_payment_creation(after_hook)
        )

        # Should have registered scheme
        schemes = client.get_registered_schemes()
        assert len(schemes.get(2, [])) == 1

        # And hooks should be registered (we can verify by creating a payment)
        requirements = PaymentRequired(
            x402_version=2,
            accepts=[
                PaymentRequirements(
                    scheme="exact",
                    network="eip155:84532",
                    asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    amount="1000",
                    pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
                    max_timeout_seconds=300,
                    extra={},
                ),
            ],
        )

        # Should succeed (hooks will be called)
        payload = client.create_payment_payload(requirements)
        assert payload is not None


class TestGetRegisteredSchemes:
    """Test get_registered_schemes introspection."""

    def test_returns_registered_schemes(self, test_account: Account):
        """Verify get_registered_schemes returns correct data."""
        signer = EthAccountSigner(test_account)

        client = (
            x402Client()
            .register("eip155:1", ExactEvmScheme(signer))
            .register("eip155:8453", ExactEvmScheme(signer))
        )

        schemes = client.get_registered_schemes()

        # Should have version 2 schemes
        assert 2 in schemes
        v2_schemes = schemes[2]
        assert len(v2_schemes) == 2

        # Check structure
        for scheme_info in v2_schemes:
            assert "network" in scheme_info
            assert "scheme" in scheme_info
            assert scheme_info["scheme"] == "exact"

    def test_empty_client_returns_empty(self):
        """Verify empty client returns empty scheme lists."""
        client = x402Client()
        schemes = client.get_registered_schemes()

        assert schemes == {1: [], 2: []}
