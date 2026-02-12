"""Unit tests for Stellar exact scheme."""

import math
import pytest

from x402.mechanisms.stellar.constants import (
    DEFAULT_ESTIMATED_LEDGER_SECONDS,
    DEFAULT_MAX_TRANSACTION_FEE_STROOPS,
    DEFAULT_TOKEN_DECIMALS,
    STELLAR_PUBNET_CAIP2,
    STELLAR_TESTNET_CAIP2,
    SUPPORTED_X402_VERSION,
    USDC_TESTNET_ADDRESS,
)
from x402.mechanisms.stellar.types import ExactStellarPayloadV2
from x402.mechanisms.stellar.utils import (
    calculate_max_ledger,
    is_stellar_network,
    get_network_passphrase,
    validate_stellar_asset_address,
    validate_stellar_destination_address,
)
from x402.mechanisms.stellar.exact.constants import SCHEME_EXACT
from x402.mechanisms.stellar.exact.server import ExactStellarServer


# --- Constants Tests ---


class TestConstants:
    def test_caip2_identifiers(self):
        assert STELLAR_TESTNET_CAIP2 == "stellar:testnet"
        assert STELLAR_PUBNET_CAIP2 == "stellar:pubnet"

    def test_defaults(self):
        assert DEFAULT_ESTIMATED_LEDGER_SECONDS == 5
        assert DEFAULT_TOKEN_DECIMALS == 7
        assert DEFAULT_MAX_TRANSACTION_FEE_STROOPS == 50_000
        assert SUPPORTED_X402_VERSION == 2

    def test_scheme_exact(self):
        assert SCHEME_EXACT == "exact"


# --- Types Tests ---


class TestExactStellarPayloadV2:
    def test_from_dict(self):
        payload = ExactStellarPayloadV2.from_dict({"transaction": "AAAA..."})
        assert payload.transaction == "AAAA..."

    def test_from_string(self):
        payload = ExactStellarPayloadV2.from_dict("AAAA...")
        assert payload.transaction == "AAAA..."

    def test_to_dict(self):
        payload = ExactStellarPayloadV2(transaction="AAAA...")
        assert payload.to_dict() == {"transaction": "AAAA..."}

    def test_roundtrip(self):
        original = ExactStellarPayloadV2(transaction="base64xdr==")
        restored = ExactStellarPayloadV2.from_dict(original.to_dict())
        assert restored.transaction == original.transaction

    def test_from_invalid_type(self):
        with pytest.raises(ValueError):
            ExactStellarPayloadV2.from_dict(12345)


# --- Utils Tests ---


class TestNetworkUtils:
    def test_is_stellar_network_testnet(self):
        assert is_stellar_network("stellar:testnet") is True

    def test_is_stellar_network_pubnet(self):
        assert is_stellar_network("stellar:pubnet") is True

    def test_is_stellar_network_evm(self):
        assert is_stellar_network("eip155:84532") is False

    def test_is_stellar_network_invalid(self):
        assert is_stellar_network("garbage") is False

    def test_get_passphrase_testnet(self):
        passphrase = get_network_passphrase("stellar:testnet")
        assert "Test SDF Network" in passphrase

    def test_get_passphrase_pubnet(self):
        passphrase = get_network_passphrase("stellar:pubnet")
        assert "Public Global Stellar Network" in passphrase

    def test_get_passphrase_invalid(self):
        with pytest.raises(ValueError, match="Unknown Stellar network"):
            get_network_passphrase("eip155:1")


class TestAddressValidation:
    def test_valid_c_account(self):
        assert validate_stellar_asset_address(USDC_TESTNET_ADDRESS) is True

    def test_invalid_g_account_as_asset(self):
        assert validate_stellar_asset_address(
            "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO"
        ) is False

    def test_valid_g_account_as_destination(self):
        assert validate_stellar_destination_address(
            "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO"
        ) is True

    def test_valid_c_account_as_destination(self):
        assert validate_stellar_destination_address(USDC_TESTNET_ADDRESS) is True

    def test_invalid_short_address(self):
        assert validate_stellar_asset_address("CABC") is False
        assert validate_stellar_destination_address("GABC") is False

    def test_invalid_empty(self):
        assert validate_stellar_asset_address("") is False
        assert validate_stellar_destination_address("") is False


class TestLedgerCalculation:
    def test_basic_calculation(self):
        result = calculate_max_ledger(100, 60, 5)
        assert result == 112  # 100 + ceil(60/5)

    def test_rounding_up(self):
        result = calculate_max_ledger(100, 7, 5)
        assert result == 102  # 100 + ceil(7/5) = 100 + 2

    def test_exact_division(self):
        result = calculate_max_ledger(1000, 30, 5)
        assert result == 1006  # 1000 + ceil(30/5) = 1000 + 6

    def test_default_ledger_seconds(self):
        result = calculate_max_ledger(100, 60)
        assert result == 112  # uses default 5s

    def test_custom_ledger_seconds(self):
        result = calculate_max_ledger(100, 60, 6)
        assert result == 110  # 100 + ceil(60/6) = 100 + 10


# --- Server Tests ---


class TestExactStellarServer:
    def test_create_requirements_basic(self):
        server = ExactStellarServer()
        req = server.create_payment_requirements(
            network="stellar:testnet",
            asset=USDC_TESTNET_ADDRESS,
            pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
            amount="10000000",
        )
        assert req["scheme"] == "exact"
        assert req["network"] == "stellar:testnet"
        assert req["amount"] == "10000000"
        assert req["extra"]["areFeesSponsored"] is True

    def test_create_requirements_human_readable_amount(self):
        server = ExactStellarServer()
        req = server.create_payment_requirements(
            network="stellar:testnet",
            asset=USDC_TESTNET_ADDRESS,
            pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
            amount=1,  # 1 USDC
            decimals=7,
        )
        assert req["amount"] == "10000000"  # 1 * 10^7

    def test_create_requirements_invalid_network(self):
        server = ExactStellarServer()
        with pytest.raises(ValueError, match="Not a Stellar network"):
            server.create_payment_requirements(
                network="eip155:1",
                asset=USDC_TESTNET_ADDRESS,
                pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
                amount="10000000",
            )

    def test_create_requirements_invalid_asset(self):
        server = ExactStellarServer()
        with pytest.raises(ValueError, match="Invalid Stellar asset"):
            server.create_payment_requirements(
                network="stellar:testnet",
                asset="GBAD_ADDRESS",
                pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
                amount="10000000",
            )

    def test_fees_not_sponsored(self):
        server = ExactStellarServer(are_fees_sponsored=False)
        req = server.create_payment_requirements(
            network="stellar:testnet",
            asset=USDC_TESTNET_ADDRESS,
            pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
            amount="10000000",
        )
        assert req["extra"]["areFeesSponsored"] is False

    def test_custom_timeout(self):
        server = ExactStellarServer()
        req = server.create_payment_requirements(
            network="stellar:testnet",
            asset=USDC_TESTNET_ADDRESS,
            pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
            amount="10000000",
            max_timeout_seconds=120,
        )
        assert req["maxTimeoutSeconds"] == 120
