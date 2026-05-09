"""Unit tests for EVM utility functions — number_to_decimal_string and convert_to_token_amount.

These tests mirror the TypeScript `utils.test.ts` coverage added alongside the
nanopayment scientific-notation precision fix.
"""

import pytest

from x402.mechanisms.evm.utils import convert_to_token_amount, number_to_decimal_string


class TestNumberToDecimalString:
    """Tests for number_to_decimal_string — expands scientific notation to plain decimal."""

    def test_plain_float_returned_unchanged(self):
        """Plain floats with no scientific notation pass through as-is."""
        assert number_to_decimal_string(4.02) == "4.02"

    def test_integer_returned_unchanged(self):
        """Integers pass through as-is."""
        assert number_to_decimal_string(42) == "42"

    def test_positive_scientific_notation_expanded(self):
        """Large numbers in scientific notation are expanded (no 'e' in result)."""
        # 1e7 = 10000000 — Python str(1e7) = '10000000.0' (no scientific notation)
        result = number_to_decimal_string(1e7)
        assert "e" not in result.lower()
        assert "E" not in result
        # The decimal equivalent should evaluate correctly
        from decimal import Decimal
        assert Decimal(result) == Decimal("10000000")

    def test_negative_scientific_notation_expanded(self):
        """Small numbers in scientific notation are expanded."""
        # 1e-7 = 0.0000001
        result = number_to_decimal_string(1e-7)
        assert result == "0.0000001"

    def test_1e_minus_6(self):
        """1e-6 (minimum USDC unit as float) expands correctly."""
        result = number_to_decimal_string(1e-6)
        assert result == "0.000001"

    def test_1e_minus_3(self):
        """1e-3 expands to 0.001."""
        result = number_to_decimal_string(1e-3)
        assert result == "0.001"

    def test_zero(self):
        """Zero is handled correctly."""
        result = number_to_decimal_string(0)
        assert result == "0"

    def test_zero_float(self):
        """Zero float is handled correctly (no scientific notation)."""
        result = number_to_decimal_string(0.0)
        assert "e" not in result.lower()
        from decimal import Decimal
        assert Decimal(result) == Decimal("0")


class TestConvertToTokenAmount:
    """Tests for convert_to_token_amount — plain decimal string → atomic units."""

    # --- Happy path ---

    def test_converts_tenth_usdc(self):
        """0.10 USDC → 100000 atomic units (6 decimals)."""
        assert convert_to_token_amount("0.10", 6) == "100000"

    def test_converts_one_usdc(self):
        """1.00 USDC → 1000000 atomic units."""
        assert convert_to_token_amount("1.00", 6) == "1000000"

    def test_converts_whole_number(self):
        """'100' → 100000000 for 6 decimals."""
        assert convert_to_token_amount("100", 6) == "100000000"

    def test_converts_minimum_usdc_unit(self):
        """0.000001 USDC (minimum) → 1 atomic unit."""
        assert convert_to_token_amount("0.000001", 6) == "1"

    def test_converts_zero(self):
        """Zero input → '0'."""
        assert convert_to_token_amount("0", 6) == "0"
        assert convert_to_token_amount("0.000000", 6) == "0"

    def test_converts_with_18_decimals(self):
        """Works correctly with 18-decimal tokens."""
        # 0.0000001 with 18 decimals = 100000000000 units
        assert convert_to_token_amount("0.0000001", 18) == "100000000000"

    # --- Error: scientific notation rejected ---

    def test_raises_on_positive_scientific_notation(self):
        """Scientific notation strings are rejected."""
        with pytest.raises(ValueError, match="scientific notation"):
            convert_to_token_amount("1e7", 6)

    def test_raises_on_negative_scientific_notation(self):
        """Small scientific notation strings are rejected."""
        with pytest.raises(ValueError, match="scientific notation"):
            convert_to_token_amount("1e-7", 6)

    def test_raises_on_uppercase_E(self):
        """Uppercase E notation is also rejected."""
        with pytest.raises(ValueError, match="scientific notation"):
            convert_to_token_amount("1E-3", 6)

    # --- Error: amount too small ---

    def test_raises_when_amount_truncates_to_zero_usdc(self):
        """Non-zero amount that rounds to 0 atomic units raises ValueError."""
        # 0.0000001 USDC = 0.1 atomic units → truncates to 0 → error
        with pytest.raises(ValueError, match="too small to represent"):
            convert_to_token_amount("0.0000001", 6)

    def test_raises_when_amount_below_min_unit(self):
        """Amounts below the minimum representable unit raise ValueError."""
        # 0.0000009 USDC = 0.9 atomic units → truncates to 0 → error
        with pytest.raises(ValueError, match="too small to represent"):
            convert_to_token_amount("0.0000009", 6)

    # --- Error: invalid input ---

    def test_raises_on_non_numeric_string(self):
        """Non-numeric strings raise ValueError."""
        with pytest.raises(ValueError, match="Invalid amount"):
            convert_to_token_amount("abc", 6)

    def test_raises_on_dollar_prefixed_string(self):
        """Dollar-prefixed strings are not accepted (must be pre-parsed)."""
        with pytest.raises(ValueError):
            convert_to_token_amount("$0.10", 6)
