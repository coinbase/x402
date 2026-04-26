"""Tests for SVM utility functions — parse_amount, format_amount,
parse_money_to_decimal, get_network_config, and get_asset_info.

These tests mirror the coverage that already exists for the EVM utilities
(see test_index.py TestParseAmount / TestFormatAmount / etc.) so that the
SVM mechanism has consistent quality standards.
"""

import pytest

from x402.mechanisms.svm.constants import (
    SOLANA_DEVNET_CAIP2,
    SOLANA_MAINNET_CAIP2,
    SOLANA_TESTNET_CAIP2,
    USDC_DEVNET_ADDRESS,
    USDC_MAINNET_ADDRESS,
)
from x402.mechanisms.svm.utils import (
    format_amount,
    get_asset_info,
    get_network_config,
    parse_amount,
    parse_money_to_decimal,
)


class TestParseAmount:
    """Test parse_amount: decimal string → smallest-unit integer."""

    def test_should_convert_decimal_usdc_amounts(self):
        """Standard USDC amounts (6 decimals) should convert correctly."""
        assert parse_amount("1.00", 6) == 1_000_000
        assert parse_amount("0.10", 6) == 100_000
        assert parse_amount("0.01", 6) == 10_000
        assert parse_amount("0.001", 6) == 1_000

    def test_should_handle_whole_numbers(self):
        """Integer amounts should work without a decimal point."""
        assert parse_amount("1", 6) == 1_000_000
        assert parse_amount("100", 6) == 100_000_000

    def test_should_handle_different_decimals(self):
        """Non-USDC token decimals should be respected."""
        assert parse_amount("1", 9) == 1_000_000_000  # SOL-style
        assert parse_amount("1", 2) == 100
        assert parse_amount("1", 0) == 1

    def test_should_handle_precise_fractional_amounts(self):
        """Amounts that need full precision should not be truncated."""
        assert parse_amount("123.456789", 6) == 123_456_789
        assert parse_amount("0.000001", 6) == 1  # minimum unit

    def test_should_handle_large_amounts(self):
        """Large amounts should be converted without overflow."""
        assert parse_amount("1000000", 6) == 1_000_000_000_000


class TestFormatAmount:
    """Test format_amount: smallest-unit integer → decimal string."""

    def test_should_convert_smallest_unit_to_decimal_string(self):
        """Standard USDC token units should format correctly."""
        assert format_amount(1_000_000, 6) == "1"
        assert format_amount(100_000, 6) == "0.1"
        assert format_amount(10_000, 6) == "0.01"

    def test_should_handle_different_decimals(self):
        """Non-6-decimal tokens should be formatted correctly."""
        assert format_amount(1_000_000_000, 9) == "1"  # SOL-style
        assert format_amount(100, 2) == "1"

    def test_should_produce_precise_fractional_strings(self):
        """Precise fractional amounts should not lose digits."""
        assert format_amount(123_456_789, 6) == "123.456789"

    def test_parse_and_format_roundtrip(self):
        """parse_amount followed by format_amount should be lossless."""
        original = "42.500000"
        token_amount = parse_amount(original, 6)
        result = format_amount(token_amount, 6)
        # Decimal may omit trailing zeros; compare numerically
        from decimal import Decimal

        assert Decimal(result) == Decimal(original)


class TestParseMoneyToDecimal:
    """Test parse_money_to_decimal: various money string formats → float."""

    def test_should_parse_dollar_string_prices(self):
        """Dollar-sign prefixed strings should be parsed correctly."""
        assert parse_money_to_decimal("$1.50") == 1.5
        assert parse_money_to_decimal("$0.10") == 0.1
        assert parse_money_to_decimal("$100") == 100.0

    def test_should_parse_plain_number_strings(self):
        """Plain numeric strings should be parsed directly."""
        assert parse_money_to_decimal("1.50") == 1.5
        assert parse_money_to_decimal("0.10") == 0.1
        assert parse_money_to_decimal("100") == 100.0

    def test_should_parse_numeric_types(self):
        """Integers and floats should be returned as float."""
        assert parse_money_to_decimal(1.5) == 1.5
        assert parse_money_to_decimal(100) == 100.0

    def test_should_strip_usd_and_usdc_suffixes(self):
        """Trailing currency labels should be stripped."""
        assert parse_money_to_decimal("1.50 USD") == 1.5
        assert parse_money_to_decimal("1.50 USDC") == 1.5
        assert parse_money_to_decimal("1.50 usd") == 1.5
        assert parse_money_to_decimal("1.50 usdc") == 1.5

    def test_should_raise_for_invalid_formats(self):
        """Non-numeric strings should raise ValueError."""
        with pytest.raises(ValueError):
            parse_money_to_decimal("not-a-number")


class TestGetNetworkConfig:
    """Test get_network_config: network identifier → NetworkConfig."""

    def test_should_return_config_for_mainnet(self):
        """Mainnet CAIP-2 identifier should return a full config."""
        config = get_network_config(SOLANA_MAINNET_CAIP2)
        assert config is not None
        assert "default_asset" in config
        assert config["default_asset"]["address"] == USDC_MAINNET_ADDRESS
        assert config["default_asset"]["decimals"] == 6

    def test_should_return_config_for_devnet(self):
        """Devnet CAIP-2 identifier should return a full config."""
        config = get_network_config(SOLANA_DEVNET_CAIP2)
        assert config is not None
        assert config["default_asset"]["address"] == USDC_DEVNET_ADDRESS

    def test_should_return_config_for_testnet(self):
        """Testnet CAIP-2 identifier should return a full config."""
        config = get_network_config(SOLANA_TESTNET_CAIP2)
        assert config is not None

    def test_should_accept_v1_network_names(self):
        """Legacy V1 network names should be normalized and return config."""
        config = get_network_config("solana")
        assert config["default_asset"]["address"] == USDC_MAINNET_ADDRESS

        devnet_config = get_network_config("solana-devnet")
        assert devnet_config["default_asset"]["address"] == USDC_DEVNET_ADDRESS

    def test_should_raise_for_unsupported_network(self):
        """Unknown networks should raise ValueError."""
        with pytest.raises(ValueError):
            get_network_config("solana:unknown-genesis")

    def test_should_raise_for_evm_network(self):
        """EVM network identifiers should not be accepted."""
        with pytest.raises(ValueError):
            get_network_config("eip155:8453")


class TestGetAssetInfo:
    """Test get_asset_info: (network, asset_address?) → AssetInfo."""

    def test_should_return_default_asset_when_no_address_given(self):
        """Omitting asset_address should return the default USDC asset."""
        asset = get_asset_info(SOLANA_MAINNET_CAIP2)
        assert asset["address"] == USDC_MAINNET_ADDRESS
        assert asset["decimals"] == 6

    def test_should_return_default_asset_when_address_matches(self):
        """Passing the default USDC address explicitly should succeed."""
        asset = get_asset_info(SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS)
        assert asset["address"] == USDC_MAINNET_ADDRESS

    def test_should_return_devnet_default_asset(self):
        """Devnet default asset should be the devnet USDC mint."""
        asset = get_asset_info(SOLANA_DEVNET_CAIP2)
        assert asset["address"] == USDC_DEVNET_ADDRESS

    def test_should_raise_for_unregistered_asset_address(self):
        """An unknown token address should raise ValueError."""
        fake_address = "So11111111111111111111111111111111111111112"  # wrapped SOL
        with pytest.raises(ValueError, match="not a registered asset"):
            get_asset_info(SOLANA_MAINNET_CAIP2, fake_address)

    def test_should_raise_for_unsupported_network(self):
        """An unsupported network should propagate the network error."""
        with pytest.raises(ValueError):
            get_asset_info("solana:unknown-genesis")
