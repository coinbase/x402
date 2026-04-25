"""Unit tests for SVM utility functions (pure, no Solana network I/O)."""

import pytest

from x402.mechanisms.svm.constants import (
    SOLANA_DEVNET_CAIP2,
    SOLANA_MAINNET_CAIP2,
    SOLANA_TESTNET_CAIP2,
    USDC_DEVNET_ADDRESS,
    USDC_MAINNET_ADDRESS,
    USDC_TESTNET_ADDRESS,
)
from x402.mechanisms.svm.utils import (
    format_amount,
    get_asset_info,
    get_network_config,
    parse_amount,
    parse_money_to_decimal,
)


class TestGetNetworkConfig:
    """Test get_network_config function."""

    def test_should_return_config_for_mainnet(self):
        """Should return full config for Solana mainnet."""
        config = get_network_config(SOLANA_MAINNET_CAIP2)

        assert config is not None
        assert "default_asset" in config
        assert config["default_asset"]["address"] == USDC_MAINNET_ADDRESS
        assert config["default_asset"]["decimals"] == 6

    def test_should_return_config_for_devnet(self):
        """Should return full config for Solana devnet."""
        config = get_network_config(SOLANA_DEVNET_CAIP2)

        assert config is not None
        assert "default_asset" in config
        assert config["default_asset"]["address"] == USDC_DEVNET_ADDRESS

    def test_should_return_config_for_testnet(self):
        """Should return full config for Solana testnet."""
        config = get_network_config(SOLANA_TESTNET_CAIP2)

        assert config is not None
        assert "default_asset" in config
        assert config["default_asset"]["address"] == USDC_TESTNET_ADDRESS

    def test_should_accept_v1_network_names(self):
        """Should accept legacy V1 network names via normalize_network."""
        config = get_network_config("solana")
        assert config["default_asset"]["address"] == USDC_MAINNET_ADDRESS

        config = get_network_config("solana-devnet")
        assert config["default_asset"]["address"] == USDC_DEVNET_ADDRESS

        config = get_network_config("solana-testnet")
        assert config["default_asset"]["address"] == USDC_TESTNET_ADDRESS

    def test_should_raise_for_unsupported_network(self):
        """Should raise ValueError for unsupported network identifiers."""
        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_network_config("ethereum")

        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_network_config("solana:unknown")

        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_network_config("eip155:8453")


class TestGetAssetInfo:
    """Test get_asset_info function."""

    def test_should_return_default_asset_when_no_address_given(self):
        """Should return default asset when asset_address is None."""
        asset = get_asset_info(SOLANA_MAINNET_CAIP2)

        assert asset["address"] == USDC_MAINNET_ADDRESS
        assert asset["decimals"] == 6

    def test_should_return_asset_info_for_matching_address(self):
        """Should return asset info when address matches the default asset."""
        asset = get_asset_info(SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS)

        assert asset["address"] == USDC_MAINNET_ADDRESS
        assert asset["decimals"] == 6
        assert "name" in asset

    def test_should_return_devnet_asset_info(self):
        """Should return devnet USDC asset info."""
        asset = get_asset_info(SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS)

        assert asset["address"] == USDC_DEVNET_ADDRESS

    def test_should_raise_for_unregistered_asset_address(self):
        """Should raise ValueError for an address that does not match the default asset."""
        unknown_address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        with pytest.raises(ValueError, match="not a registered asset"):
            get_asset_info(SOLANA_MAINNET_CAIP2, unknown_address)

    def test_should_raise_for_unsupported_network(self):
        """Should raise ValueError when network is not supported."""
        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_asset_info("solana:unsupported", USDC_MAINNET_ADDRESS)


class TestParseAmount:
    """Test parse_amount function."""

    def test_should_convert_decimal_to_smallest_unit_6_decimals(self):
        """Should correctly convert decimal amounts to integer token units (6 decimals)."""
        assert parse_amount("0.10", 6) == 100_000
        assert parse_amount("1.00", 6) == 1_000_000
        assert parse_amount("0.01", 6) == 10_000
        assert parse_amount("123.456789", 6) == 123_456_789

    def test_should_handle_whole_number_strings(self):
        """Should handle whole-number strings without a decimal point."""
        assert parse_amount("1", 6) == 1_000_000
        assert parse_amount("100", 6) == 100_000_000

    def test_should_handle_zero(self):
        """Should return 0 for an amount of '0'."""
        assert parse_amount("0", 6) == 0
        assert parse_amount("0.000000", 6) == 0

    def test_should_handle_different_decimal_precisions(self):
        """Should handle various decimal precisions."""
        assert parse_amount("1", 9) == 1_000_000_000   # 9 decimals (like SOL)
        assert parse_amount("1", 2) == 100               # 2 decimals
        assert parse_amount("1", 0) == 1                 # 0 decimals

    def test_should_truncate_subunit_remainder(self):
        """Should truncate fractional subunits (not round)."""
        # 0.1234567 with 6 decimals → 123456.7 → truncated to 123456
        assert parse_amount("0.1234567", 6) == 123_456


class TestFormatAmount:
    """Test format_amount function."""

    def test_should_convert_smallest_unit_to_decimal_string(self):
        """Should correctly convert integer token units to decimal strings."""
        assert format_amount(100_000, 6) == "0.1"
        assert format_amount(1_000_000, 6) == "1"
        assert format_amount(123_456_789, 6) == "123.456789"

    def test_should_format_zero(self):
        """Should format zero as '0'."""
        assert format_amount(0, 6) == "0"

    def test_should_handle_different_decimal_precisions(self):
        """Should handle various decimal precisions."""
        assert format_amount(1_000_000_000, 9) == "1"   # 9 decimals
        assert format_amount(100, 2) == "1"               # 2 decimals
        assert format_amount(1, 0) == "1"                 # 0 decimals

    def test_parse_and_format_roundtrip(self):
        """parse_amount followed by format_amount should be a lossless round-trip."""
        original = "42.123456"
        amount_int = parse_amount(original, 6)
        result = format_amount(amount_int, 6)
        assert result == original


class TestParseMoneyToDecimal:
    """Test parse_money_to_decimal function."""

    def test_should_parse_dollar_prefixed_strings(self):
        """Should strip the leading dollar sign and return a float."""
        assert parse_money_to_decimal("$1.50") == pytest.approx(1.5)
        assert parse_money_to_decimal("$0.10") == pytest.approx(0.1)
        assert parse_money_to_decimal("$100") == pytest.approx(100.0)

    def test_should_parse_plain_number_strings(self):
        """Should parse plain decimal strings without currency symbols."""
        assert parse_money_to_decimal("1.50") == pytest.approx(1.5)
        assert parse_money_to_decimal("0.10") == pytest.approx(0.1)
        assert parse_money_to_decimal("100") == pytest.approx(100.0)

    def test_should_pass_through_numeric_types(self):
        """Should return float as-is for int and float inputs."""
        assert parse_money_to_decimal(1.5) == pytest.approx(1.5)
        assert parse_money_to_decimal(100) == pytest.approx(100.0)
        assert parse_money_to_decimal(0) == pytest.approx(0.0)

    def test_should_strip_usd_and_usdc_suffixes(self):
        """Should strip trailing USD / USDC currency labels (case-insensitive)."""
        assert parse_money_to_decimal("1.50 USD") == pytest.approx(1.5)
        assert parse_money_to_decimal("1.50 USDC") == pytest.approx(1.5)
        assert parse_money_to_decimal("1.50 usd") == pytest.approx(1.5)
        assert parse_money_to_decimal("1.50 usdc") == pytest.approx(1.5)

    def test_should_raise_for_non_numeric_strings(self):
        """Should raise ValueError (via float()) for strings that cannot be parsed."""
        with pytest.raises(ValueError):
            parse_money_to_decimal("not-a-number")

        with pytest.raises(ValueError):
            parse_money_to_decimal("one dollar")
