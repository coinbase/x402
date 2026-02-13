"""Tests for ExactHypercoreScheme client."""

import time
from unittest.mock import Mock

from x402.mechanisms.hypercore import NETWORK_MAINNET, NETWORK_TESTNET
from x402.mechanisms.hypercore.exact import ExactHypercoreClientScheme
from x402.schemas import PaymentRequirements


class MockSigner:
    """Mock Hyperliquid signer for testing."""

    def __init__(self):
        """Initialize mock signer."""
        self.sign_send_asset = Mock(
            return_value={
                "r": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                "s": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
                "v": 27,
            }
        )

    def get_address(self):
        """Get signer address."""
        return "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def make_requirements(**overrides):
    """Create PaymentRequirements with defaults."""
    defaults = {
        "scheme": "exact",
        "network": NETWORK_MAINNET,
        "pay_to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "amount": "1000000",
        "asset": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        "max_timeout_seconds": 3600,
    }
    defaults.update(overrides)
    return PaymentRequirements(**defaults)


class TestExactHypercoreSchemeConstructor:
    """Test ExactHypercoreScheme client constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        """Should create instance with correct scheme."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        assert client.scheme == "exact"

    def test_should_store_signer_reference(self):
        """Should store signer reference."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        assert client.signer is signer


class TestCreatePaymentPayload:
    """Test create_payment_payload method."""

    def test_should_create_payload_with_correct_structure(self):
        """Should create payment payload with correct structure."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        result = client.create_payment_payload(make_requirements())

        assert "action" in result
        assert "signature" in result
        assert "nonce" in result

    def test_should_format_amount_correctly_with_8_decimals(self):
        """Should format amount with 8 decimals."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        result = client.create_payment_payload(make_requirements())

        assert result["action"]["amount"] == "0.01000000"

    def test_should_use_mainnet_chain_for_mainnet_network(self):
        """Should use Mainnet chain for mainnet network."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        result = client.create_payment_payload(make_requirements())

        assert result["action"]["hyperliquidChain"] == "Mainnet"

    def test_should_use_testnet_chain_for_testnet_network(self):
        """Should use Testnet chain for testnet network."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        result = client.create_payment_payload(
            make_requirements(
                network=NETWORK_TESTNET,
                extra={"isMainnet": False},
            )
        )

        assert result["action"]["hyperliquidChain"] == "Testnet"

    def test_should_normalize_destination_address_to_lowercase(self):
        """Should normalize destination address to lowercase."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        result = client.create_payment_payload(
            make_requirements(pay_to="0xAbCdEf0123456789AbCdEf0123456789AbCdEf01")
        )

        assert result["action"]["destination"] == "0xabcdef0123456789abcdef0123456789abcdef01"

    def test_should_generate_timestamp_based_nonce(self):
        """Should generate timestamp-based nonce."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        before = int(time.time() * 1000)
        result = client.create_payment_payload(make_requirements())
        after = int(time.time() * 1000)

        nonce = result["nonce"]
        assert nonce >= before
        assert nonce <= after

    def test_should_call_signer_with_correct_action(self):
        """Should call signer with correct action."""
        sign_spy = Mock(
            return_value={
                "r": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                "s": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
                "v": 27,
            }
        )

        signer = Mock()
        signer.sign_send_asset = sign_spy

        client = ExactHypercoreClientScheme(signer)
        client.create_payment_payload(make_requirements())

        # Verify signer was called once
        assert sign_spy.call_count == 1

        # Verify action structure
        called_action = sign_spy.call_args[0][0]
        assert called_action["type"] == "sendAsset"
        assert called_action["destination"] == "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
        assert called_action["token"] == "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"
        assert called_action["amount"] == "0.01000000"

    def test_should_set_correct_action_fields(self):
        """Should set all required action fields correctly."""
        signer = MockSigner()
        client = ExactHypercoreClientScheme(signer)

        result = client.create_payment_payload(make_requirements(amount="10000000"))

        action = result["action"]
        assert action["type"] == "sendAsset"
        assert action["signatureChainId"] == "0x3e7"
        assert action["sourceDex"] == "spot"
        assert action["destinationDex"] == "spot"
        assert action["fromSubAccount"] == ""
        assert "nonce" in action
