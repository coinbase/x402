"""Tests for ExactHypercoreScheme server."""

from x402.mechanisms.hypercore import NETWORK_MAINNET
from x402.mechanisms.hypercore.exact import ExactHypercoreServerScheme
from x402.schemas import PaymentRequirements, SupportedKind


class TestExactHypercoreSchemeConstructor:
    """Test ExactHypercoreScheme server constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        """Should create instance with correct scheme."""
        server = ExactHypercoreServerScheme()

        assert server.scheme == "exact"


class TestParsePrice:
    """Test parse_price method."""

    def test_should_parse_dollar_string(self):
        """Should parse dollar string to AssetAmount."""
        server = ExactHypercoreServerScheme()

        result = server.parse_price("$0.01", NETWORK_MAINNET)

        assert result.amount == "1000000"
        assert result.asset == "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"

    def test_should_parse_numeric_string(self):
        """Should parse numeric string to AssetAmount."""
        server = ExactHypercoreServerScheme()

        result = server.parse_price("0.05", NETWORK_MAINNET)

        assert result.amount == "5000000"
        assert result.asset == "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"

    def test_should_parse_float(self):
        """Should parse float to AssetAmount."""
        server = ExactHypercoreServerScheme()

        result = server.parse_price(0.1, NETWORK_MAINNET)

        assert result.amount == "10000000"
        assert result.asset == "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"

    def test_should_return_asset_amount_unchanged(self):
        """Should return AssetAmount unchanged."""
        server = ExactHypercoreServerScheme()

        asset_amount = {"amount": "123456", "asset": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"}
        result = server.parse_price(asset_amount, NETWORK_MAINNET)

        assert result.amount == asset_amount["amount"]
        assert result.asset == asset_amount["asset"]

    def test_should_raise_on_invalid_format(self):
        """Should raise ValueError on invalid format."""
        server = ExactHypercoreServerScheme()

        try:
            server.parse_price("invalid", NETWORK_MAINNET)
            raise AssertionError("Should have raised ValueError")
        except ValueError as e:
            assert "Invalid money format" in str(e)


class TestEnhancePaymentRequirements:
    """Test enhance_payment_requirements method."""

    def test_should_add_signature_chain_id(self):
        """Should add signatureChainId to extra."""
        server = ExactHypercoreServerScheme()

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            amount="100000",
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        supported_kind = SupportedKind(
            x402_version=2,
            scheme="exact",
            network=NETWORK_MAINNET,
        )

        result = server.enhance_payment_requirements(requirements, supported_kind, [])

        assert result.extra["signatureChainId"] == 999
        assert result.extra["isMainnet"] is True

    def test_should_detect_testnet(self):
        """Should detect testnet network."""
        server = ExactHypercoreServerScheme()

        requirements = PaymentRequirements(
            scheme="exact",
            network="hypercore:testnet",
            amount="100000",
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        supported_kind = SupportedKind(
            x402_version=2,
            scheme="exact",
            network="hypercore:testnet",
        )

        result = server.enhance_payment_requirements(requirements, supported_kind, [])

        assert result.extra["signatureChainId"] == 999
        assert result.extra["isMainnet"] is False

    def test_should_preserve_existing_extra(self):
        """Should preserve existing extra fields."""
        server = ExactHypercoreServerScheme()

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            amount="100000",
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={"customField": "customValue"},
        )

        supported_kind = SupportedKind(
            x402_version=2,
            scheme="exact",
            network=NETWORK_MAINNET,
        )

        result = server.enhance_payment_requirements(requirements, supported_kind, [])

        assert result.extra["customField"] == "customValue"
        assert result.extra["signatureChainId"] == 999
        assert result.extra["isMainnet"] is True
