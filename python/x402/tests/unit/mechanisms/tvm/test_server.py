"""Tests for ExactTvmScheme server."""

import pytest

from x402.mechanisms.tvm.exact import ExactTvmServerScheme
from x402.mechanisms.tvm.constants import USDT_MASTER


class TestParsePrice:
    """Test parse_price method."""

    def test_should_parse_dollar_string_prices(self):
        server = ExactTvmServerScheme()
        result = server.parse_price("$0.10", "tvm:-239")
        assert result["amount"] == "100000"
        assert result["asset"] == USDT_MASTER

    def test_should_parse_simple_number_string_prices(self):
        server = ExactTvmServerScheme()
        result = server.parse_price("0.10", "tvm:-239")
        assert result["amount"] == "100000"

    def test_should_parse_number_prices(self):
        server = ExactTvmServerScheme()
        result = server.parse_price(0.1, "tvm:-239")
        assert result["amount"] == "100000"

    def test_should_handle_larger_amounts(self):
        server = ExactTvmServerScheme()
        result = server.parse_price("100.50", "tvm:-239")
        assert result["amount"] == "100500000"

    def test_should_handle_whole_numbers(self):
        server = ExactTvmServerScheme()
        result = server.parse_price("1", "tvm:-239")
        assert result["amount"] == "1000000"

    def test_should_handle_zero_amount(self):
        server = ExactTvmServerScheme()
        result = server.parse_price(0, "tvm:-239")
        assert result["amount"] == "0"

    def test_should_passthrough_asset_amount_dict(self):
        server = ExactTvmServerScheme()
        custom_asset = "0:" + "f" * 64
        result = server.parse_price(
            {"amount": "123456", "asset": custom_asset, "extra": {"foo": "bar"}},
            "tvm:-239",
        )
        assert result["amount"] == "123456"
        assert result["asset"] == custom_asset
        assert result["extra"] == {"foo": "bar"}

    def test_should_raise_for_asset_amount_without_asset(self):
        server = ExactTvmServerScheme()
        with pytest.raises(ValueError, match="Asset address required"):
            server.parse_price({"amount": "123456"}, "tvm:-239")

    def test_should_raise_for_invalid_price_format(self):
        server = ExactTvmServerScheme()
        with pytest.raises(ValueError):
            server.parse_price("not-a-price", "tvm:-239")

    def test_should_use_custom_default_asset(self):
        custom_asset = "0:" + "e" * 64
        server = ExactTvmServerScheme(default_asset=custom_asset)
        result = server.parse_price("1.00", "tvm:-239")
        assert result["asset"] == custom_asset


class TestEnhancePaymentRequirements:
    """Test enhance_payment_requirements method."""

    def test_should_add_facilitator_url_from_supported_kind(self):
        server = ExactTvmServerScheme()
        requirements = {"scheme": "exact", "network": "tvm:-239", "extra": {}}
        supported_kind = {"extra": {"facilitatorUrl": "https://facilitator.example.com"}}

        result = server.enhance_payment_requirements(requirements, supported_kind)

        assert result["extra"]["facilitatorUrl"] == "https://facilitator.example.com"

    def test_should_preserve_existing_extra_fields(self):
        server = ExactTvmServerScheme()
        requirements = {"scheme": "exact", "extra": {"custom": "value"}}

        result = server.enhance_payment_requirements(requirements)

        assert result["extra"]["custom"] == "value"

    def test_should_handle_no_supported_kind(self):
        server = ExactTvmServerScheme()
        requirements = {"scheme": "exact", "extra": {}}

        result = server.enhance_payment_requirements(requirements)

        assert "facilitatorUrl" not in result["extra"]


class TestSchemeAttributes:
    """Test server scheme attributes."""

    def test_scheme_is_exact(self):
        server = ExactTvmServerScheme()
        assert server.scheme == "exact"
