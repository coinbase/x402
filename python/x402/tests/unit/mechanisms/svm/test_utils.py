"""Tests for x402.mechanisms.svm.utils helpers.

Covers helpers that are not exercised by test_index.py (which covers
``normalize_network``, ``validate_svm_address``, ``get_usdc_address``, and
``convert_to_token_amount`` via the public ``x402.mechanisms.svm`` re-exports)
and that have no other dedicated unit test coverage in
``tests/unit/mechanisms/svm/``.
"""

import base64

import pytest
from solders.keypair import Keypair
from solders.pubkey import Pubkey

from x402.mechanisms.svm.constants import (
    NETWORK_CONFIGS,
    SOLANA_DEVNET_CAIP2,
    SOLANA_MAINNET_CAIP2,
    SOLANA_TESTNET_CAIP2,
    TOKEN_2022_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    USDC_DEVNET_ADDRESS,
    USDC_MAINNET_ADDRESS,
    USDC_TESTNET_ADDRESS,
)
from x402.mechanisms.svm.types import ExactSvmPayload
from x402.mechanisms.svm.utils import (
    decode_transaction_from_payload,
    derive_ata,
    format_amount,
    get_asset_info,
    get_network_config,
    parse_amount,
    parse_money_to_decimal,
)


class TestGetNetworkConfig:
    """Tests for ``get_network_config``."""

    def test_should_return_mainnet_config_for_caip2(self):
        config = get_network_config(SOLANA_MAINNET_CAIP2)
        assert config is NETWORK_CONFIGS[SOLANA_MAINNET_CAIP2]
        assert config["default_asset"]["address"] == USDC_MAINNET_ADDRESS
        assert config["default_asset"]["decimals"] == 6

    def test_should_return_devnet_config_for_caip2(self):
        config = get_network_config(SOLANA_DEVNET_CAIP2)
        assert config is NETWORK_CONFIGS[SOLANA_DEVNET_CAIP2]
        assert config["default_asset"]["address"] == USDC_DEVNET_ADDRESS

    def test_should_return_testnet_config_for_caip2(self):
        config = get_network_config(SOLANA_TESTNET_CAIP2)
        assert config is NETWORK_CONFIGS[SOLANA_TESTNET_CAIP2]
        assert config["default_asset"]["address"] == USDC_TESTNET_ADDRESS

    def test_should_normalize_v1_mainnet_name(self):
        assert get_network_config("solana") is NETWORK_CONFIGS[SOLANA_MAINNET_CAIP2]

    def test_should_normalize_v1_devnet_name(self):
        assert get_network_config("solana-devnet") is NETWORK_CONFIGS[SOLANA_DEVNET_CAIP2]

    def test_should_normalize_v1_testnet_name(self):
        assert get_network_config("solana-testnet") is NETWORK_CONFIGS[SOLANA_TESTNET_CAIP2]

    def test_should_raise_for_unknown_caip2(self):
        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_network_config("solana:unknown")

    def test_should_raise_for_unknown_v1_name(self):
        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_network_config("not-a-network")

    def test_should_raise_for_non_solana_caip2(self):
        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_network_config("eip155:1")


class TestGetAssetInfo:
    """Tests for ``get_asset_info``."""

    def test_should_return_default_asset_when_address_not_provided(self):
        info = get_asset_info(SOLANA_MAINNET_CAIP2)
        assert info["address"] == USDC_MAINNET_ADDRESS
        assert info["name"] == "USD Coin"
        assert info["decimals"] == 6

    def test_should_return_default_asset_when_address_is_none(self):
        info = get_asset_info(SOLANA_DEVNET_CAIP2, None)
        assert info["address"] == USDC_DEVNET_ADDRESS

    def test_should_return_default_asset_when_address_matches(self):
        info = get_asset_info(SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS)
        assert info["address"] == USDC_MAINNET_ADDRESS

    def test_should_accept_v1_network_name(self):
        info = get_asset_info("solana", USDC_MAINNET_ADDRESS)
        assert info["address"] == USDC_MAINNET_ADDRESS

    def test_should_treat_empty_string_as_default_request(self):
        # ``not asset_address`` is True for empty string, so empty string
        # short-circuits to the default asset rather than mismatching.
        info = get_asset_info(SOLANA_MAINNET_CAIP2, "")
        assert info["address"] == USDC_MAINNET_ADDRESS

    def test_should_raise_for_unregistered_asset(self):
        with pytest.raises(ValueError, match="not a registered asset"):
            get_asset_info(SOLANA_MAINNET_CAIP2, USDC_DEVNET_ADDRESS)

    def test_should_raise_for_arbitrary_unknown_address(self):
        with pytest.raises(ValueError, match="not a registered asset"):
            get_asset_info(SOLANA_MAINNET_CAIP2, "So11111111111111111111111111111111111111112")

    def test_should_raise_for_unsupported_network(self):
        # Network resolution happens before asset matching, so an unsupported
        # network should raise the network error regardless of asset_address.
        with pytest.raises(ValueError, match="Unsupported SVM network"):
            get_asset_info("solana:unknown", USDC_MAINNET_ADDRESS)


class TestParseAmount:
    """Tests for ``parse_amount``."""

    def test_should_convert_one_unit_at_six_decimals(self):
        assert parse_amount("1", 6) == 1_000_000

    def test_should_convert_decimal_at_six_decimals(self):
        assert parse_amount("0.10", 6) == 100_000

    def test_should_convert_high_precision_decimal(self):
        assert parse_amount("123.456789", 6) == 123_456_789

    def test_should_truncate_subunit_precision(self):
        # 0.1234567 at 6 decimals truncates the 7th digit.
        assert parse_amount("0.1234567", 6) == 123_456

    def test_should_handle_nine_decimals_for_sol(self):
        assert parse_amount("1", 9) == 1_000_000_000

    def test_should_handle_zero_decimals(self):
        assert parse_amount("42", 0) == 42

    def test_should_handle_zero_amount(self):
        assert parse_amount("0", 6) == 0

    def test_should_raise_for_invalid_string(self):
        from decimal import InvalidOperation

        with pytest.raises(InvalidOperation):
            parse_amount("abc", 6)


class TestFormatAmount:
    """Tests for ``format_amount``."""

    def test_should_format_one_usdc(self):
        assert format_amount(1_000_000, 6) == "1"

    def test_should_format_fractional_usdc(self):
        assert format_amount(100_000, 6) == "0.1"

    def test_should_format_smallest_unit(self):
        assert format_amount(1, 6) == "0.000001"

    def test_should_format_zero(self):
        assert format_amount(0, 6) == "0"

    def test_should_format_one_sol(self):
        assert format_amount(1_000_000_000, 9) == "1"

    def test_should_format_with_zero_decimals(self):
        assert format_amount(42, 0) == "42"

    def test_should_round_trip_through_parse_amount(self):
        # Round-trip: format_amount(parse_amount(s, d), d) should equal a
        # canonical decimal representation of s.
        assert format_amount(parse_amount("123.456789", 6), 6) == "123.456789"


class TestParseMoneyToDecimal:
    """Tests for ``parse_money_to_decimal``."""

    def test_should_pass_through_int(self):
        assert parse_money_to_decimal(5) == 5.0

    def test_should_pass_through_float(self):
        assert parse_money_to_decimal(1.50) == 1.50

    def test_should_parse_plain_decimal_string(self):
        assert parse_money_to_decimal("1.50") == 1.50

    def test_should_strip_dollar_prefix(self):
        assert parse_money_to_decimal("$1.50") == 1.50

    def test_should_strip_usd_suffix(self):
        assert parse_money_to_decimal("1.50 USD") == 1.50

    def test_should_strip_lowercase_usd_suffix(self):
        assert parse_money_to_decimal("1.50 usd") == 1.50

    def test_should_strip_usdc_suffix(self):
        assert parse_money_to_decimal("1.50 USDC") == 1.50

    def test_should_strip_lowercase_usdc_suffix(self):
        assert parse_money_to_decimal("1.50 usdc") == 1.50

    def test_should_strip_dollar_and_usdc_suffix(self):
        assert parse_money_to_decimal("$1.50 USDC") == 1.50

    def test_should_handle_surrounding_whitespace(self):
        assert parse_money_to_decimal("   $1.50 USD   ") == 1.50

    def test_should_raise_for_invalid_string(self):
        with pytest.raises(ValueError):
            parse_money_to_decimal("not-a-number")


class TestDecodeTransactionFromPayload:
    """Tests for ``decode_transaction_from_payload``."""

    @staticmethod
    def _build_versioned_transaction_bytes() -> bytes:
        """Build a minimal valid VersionedTransaction and return its bytes."""
        from solders.hash import Hash
        from solders.message import MessageV0
        from solders.transaction import VersionedTransaction

        keypair = Keypair()
        message = MessageV0.try_compile(
            payer=keypair.pubkey(),
            instructions=[],
            address_lookup_table_accounts=[],
            recent_blockhash=Hash.default(),
        )
        tx = VersionedTransaction(message, [keypair])
        return bytes(tx)

    def test_should_decode_valid_base64_transaction(self):
        tx_bytes = self._build_versioned_transaction_bytes()
        payload = ExactSvmPayload(transaction=base64.b64encode(tx_bytes).decode())

        decoded = decode_transaction_from_payload(payload)

        # Re-serializing should give identical bytes.
        assert bytes(decoded) == tx_bytes

    def test_should_raise_value_error_for_invalid_base64(self):
        payload = ExactSvmPayload(transaction="!!!not-base64!!!")
        with pytest.raises(ValueError, match="invalid_exact_svm_payload_transaction"):
            decode_transaction_from_payload(payload)

    def test_should_raise_value_error_for_base64_garbage(self):
        # Valid base64 that does not decode to a VersionedTransaction.
        payload = ExactSvmPayload(transaction=base64.b64encode(b"not-a-tx").decode())
        with pytest.raises(ValueError, match="invalid_exact_svm_payload_transaction"):
            decode_transaction_from_payload(payload)

    def test_should_raise_value_error_for_empty_transaction(self):
        payload = ExactSvmPayload(transaction="")
        with pytest.raises(ValueError, match="invalid_exact_svm_payload_transaction"):
            decode_transaction_from_payload(payload)


class TestDeriveAta:
    """Tests for ``derive_ata`` (Associated Token Account PDA derivation)."""

    OWNER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    MINT = USDC_MAINNET_ADDRESS

    def test_should_produce_a_valid_solana_address(self):
        ata = derive_ata(self.OWNER, self.MINT)
        # Round-trip through Pubkey to confirm valid base58 output.
        assert str(Pubkey.from_string(ata)) == ata

    def test_should_be_deterministic(self):
        first = derive_ata(self.OWNER, self.MINT)
        second = derive_ata(self.OWNER, self.MINT)
        assert first == second

    def test_should_default_to_token_program_when_token_program_omitted(self):
        default = derive_ata(self.OWNER, self.MINT)
        explicit = derive_ata(self.OWNER, self.MINT, TOKEN_PROGRAM_ADDRESS)
        assert default == explicit

    def test_should_differ_for_token_2022_program(self):
        token_ata = derive_ata(self.OWNER, self.MINT, TOKEN_PROGRAM_ADDRESS)
        token_2022_ata = derive_ata(self.OWNER, self.MINT, TOKEN_2022_PROGRAM_ADDRESS)
        assert token_ata != token_2022_ata

    def test_should_differ_for_different_owners(self):
        other_owner = str(Keypair().pubkey())
        ata_a = derive_ata(self.OWNER, self.MINT)
        ata_b = derive_ata(other_owner, self.MINT)
        assert ata_a != ata_b

    def test_should_differ_for_different_mints(self):
        ata_usdc = derive_ata(self.OWNER, USDC_MAINNET_ADDRESS)
        ata_devnet_usdc = derive_ata(self.OWNER, USDC_DEVNET_ADDRESS)
        assert ata_usdc != ata_devnet_usdc

    def test_should_explicitly_accept_none_token_program(self):
        # Passing token_program=None is the documented way to opt into the
        # default Token Program; it should match the omitted-arg behavior.
        explicit_none = derive_ata(self.OWNER, self.MINT, None)
        default = derive_ata(self.OWNER, self.MINT)
        assert explicit_none == default
