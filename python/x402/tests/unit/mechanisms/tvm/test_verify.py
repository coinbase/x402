"""Tests for TVM signature verification."""

import pytest

try:
    from pytoniq_core import Cell
except ImportError:
    pytest.skip("TVM requires pytoniq-core", allow_module_level=True)

from x402.mechanisms.tvm.verify import VerifyConfig, check_protocol, check_relay_safety
from x402.mechanisms.tvm.types import TvmPaymentPayload, VerifyResult
from x402.mechanisms.tvm.constants import SCHEME_EXACT, TVM_MAINNET, TVM_TESTNET


class TestCheckProtocol:
    """Test protocol validation rule."""

    def test_accepts_valid_scheme_and_network(self):
        config = VerifyConfig()
        result = check_protocol(SCHEME_EXACT, TVM_MAINNET, config)
        assert result.ok is True

    def test_accepts_testnet(self):
        config = VerifyConfig()
        result = check_protocol(SCHEME_EXACT, TVM_TESTNET, config)
        assert result.ok is True

    def test_rejects_wrong_scheme(self):
        config = VerifyConfig()
        result = check_protocol("wrong", TVM_MAINNET, config)
        assert result.ok is False
        assert "Unsupported scheme" in result.reason

    def test_rejects_unsupported_network(self):
        config = VerifyConfig()
        result = check_protocol(SCHEME_EXACT, "tvm:-999", config)
        assert result.ok is False
        assert "Unsupported network" in result.reason

    def test_uses_custom_supported_networks(self):
        config = VerifyConfig(supported_networks={TVM_TESTNET})
        result = check_protocol(SCHEME_EXACT, TVM_MAINNET, config)
        assert result.ok is False

        result = check_protocol(SCHEME_EXACT, TVM_TESTNET, config)
        assert result.ok is True


class TestCheckRelaySafety:
    """Test relay commission check."""

    def test_accepts_zero_commission(self):
        payload = TvmPaymentPayload(
            sender="0:" + "a" * 64,
            to="0:" + "b" * 64,
            token_master="0:" + "c" * 64,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc",
            commission="0",
        )
        config = VerifyConfig()
        result = check_relay_safety(payload, config)
        assert result.ok is True

    def test_accepts_commission_within_limit(self):
        payload = TvmPaymentPayload(
            sender="0:" + "a" * 64,
            to="0:" + "b" * 64,
            token_master="0:" + "c" * 64,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc",
            commission="100000",
        )
        config = VerifyConfig(max_relay_commission=500_000)
        result = check_relay_safety(payload, config)
        assert result.ok is True

    def test_rejects_commission_over_limit(self):
        payload = TvmPaymentPayload(
            sender="0:" + "a" * 64,
            to="0:" + "b" * 64,
            token_master="0:" + "c" * 64,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc",
            commission="1000000",
        )
        config = VerifyConfig(max_relay_commission=500_000)
        result = check_relay_safety(payload, config)
        assert result.ok is False
        assert "Commission too high" in result.reason


class TestVerifyConfig:
    """Test VerifyConfig defaults."""

    def test_default_config(self):
        config = VerifyConfig()
        assert config.relay_address is None
        assert config.max_relay_commission == 500_000
        assert config.supported_networks is None
        assert config.skip_simulation is True
        assert config.max_valid_until_seconds == 600
