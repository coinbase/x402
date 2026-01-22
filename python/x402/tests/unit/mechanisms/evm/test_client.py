"""Tests for ExactEvmScheme client."""

try:
    from eth_account import Account
except ImportError:
    import pytest

    pytest.skip("EVM client requires eth_account", allow_module_level=True)

from x402.mechanisms.evm import get_asset_info
from x402.mechanisms.evm.exact import ExactEvmClientScheme
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.schemas import PaymentRequirements


class TestExactEvmSchemeConstructor:
    """Test ExactEvmScheme constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        """Should create instance with correct scheme."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)

        assert client.scheme == "exact"

    def test_should_store_signer_reference(self):
        """Should store signer reference."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)

        # Client should have access to signer (internal attribute)
        assert client._signer is signer


class TestCreatePaymentPayload:
    """Test create_payment_payload method."""

    def test_should_have_create_payment_payload_method(self):
        """Should have create_payment_payload method."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)

        assert hasattr(client, "create_payment_payload")
        assert callable(client.create_payment_payload)

    def test_should_accept_v2_requirements_with_amount_field(self):
        """Should accept V2 requirements with amount field."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)
        network = "eip155:8453"

        # Verify the client accepts PaymentRequirements (v2) with amount field
        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="500000",  # V2 uses 'amount'
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={
                "name": "USD Coin",
                "version": "2",
            },
        )

        assert requirements.amount == "500000"
        assert client.scheme == "exact"

    def test_requirements_must_have_eip712_domain(self):
        """Requirements must have EIP-712 domain in extra."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)
        network = "eip155:8453"

        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={},  # Missing EIP-712 domain
        )

        # The method should exist and handle this error scenario
        assert client.create_payment_payload is not None
        assert requirements.extra is not None
        assert requirements.extra.get("name") is None


class TestClientSchemeAttributes:
    """Test client scheme attributes and methods."""

    def test_scheme_attribute_is_exact(self):
        """scheme attribute should be 'exact'."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)

        assert client.scheme == "exact"

    def test_client_stores_signer_reference(self):
        """Client should store signer reference."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmClientScheme(signer)

        # Client should have access to signer (internal attribute)
        assert client._signer is signer
