"""Tests for ExactTvmScheme facilitator."""

import pytest

try:
    from pytoniq_core import Cell
except ImportError:
    pytest.skip("TVM requires pytoniq-core", allow_module_level=True)

from x402.mechanisms.tvm.exact import ExactTvmFacilitatorScheme, ExactTvmSchemeConfig
from x402.mechanisms.tvm.constants import TVM_MAINNET


class MockFacilitatorProvider:
    """Mock provider for facilitator tests."""

    def __init__(self, seqno=0, jetton_wallet=None):
        self._seqno = seqno
        self._jetton_wallet = jetton_wallet or ("0:" + "d" * 64)
        self.gasless_send_calls = 0

    async def get_seqno(self, address):
        return self._seqno

    async def get_jetton_wallet(self, master, owner):
        return self._jetton_wallet

    async def get_account_state(self, address):
        return {"balance": 1000, "status": "active", "code_hash": ""}

    async def get_transaction(self, tx_hash):
        return None

    async def gasless_estimate(self, **kwargs):
        return {"messages": [], "commission": "0"}

    async def gasless_send(self, boc, wallet_public_key):
        self.gasless_send_calls += 1
        return "msg_hash_123"

    async def get_gasless_config(self):
        return {}


class TestExactTvmSchemeConstructor:
    """Test ExactTvmScheme facilitator constructor."""

    def test_creates_instance_with_defaults(self):
        provider = MockFacilitatorProvider()
        facilitator = ExactTvmFacilitatorScheme(provider)
        assert facilitator.scheme == "exact"
        assert facilitator.caip_family == "tvm:*"

    def test_creates_instance_with_config(self):
        provider = MockFacilitatorProvider()
        config = ExactTvmSchemeConfig(
            relay_address="0:" + "a" * 64,
            max_relay_commission=100_000,
        )
        facilitator = ExactTvmFacilitatorScheme(provider, config)
        assert facilitator._config.relay_address == "0:" + "a" * 64
        assert facilitator._config.max_relay_commission == 100_000


class TestGetExtra:
    """Test get_extra method."""

    def test_returns_none_without_relay_address(self):
        provider = MockFacilitatorProvider()
        facilitator = ExactTvmFacilitatorScheme(provider)
        assert facilitator.get_extra(TVM_MAINNET) is None

    def test_returns_relay_address_when_configured(self):
        provider = MockFacilitatorProvider()
        config = ExactTvmSchemeConfig(relay_address="0:" + "a" * 64)
        facilitator = ExactTvmFacilitatorScheme(provider, config)
        extra = facilitator.get_extra(TVM_MAINNET)
        assert extra is not None
        assert extra["relayAddress"] == "0:" + "a" * 64


class TestGetSigners:
    """Test get_signers method."""

    def test_returns_empty_list(self):
        provider = MockFacilitatorProvider()
        facilitator = ExactTvmFacilitatorScheme(provider)
        assert facilitator.get_signers(TVM_MAINNET) == []


class TestVerify:
    """Test verify method."""

    @pytest.mark.asyncio
    async def test_rejects_invalid_payload(self):
        provider = MockFacilitatorProvider()
        facilitator = ExactTvmFacilitatorScheme(provider)

        result = await facilitator.verify(
            payload="not-a-dict",
            requirements={"scheme": "exact", "network": TVM_MAINNET},
        )

        assert result["is_valid"] is False
        assert "Invalid payload" in result["invalid_reason"]

    @pytest.mark.asyncio
    async def test_rejects_wrong_scheme(self):
        provider = MockFacilitatorProvider()
        facilitator = ExactTvmFacilitatorScheme(provider)

        payload = {
            "from": "0:" + "a" * 64,
            "to": "0:" + "b" * 64,
            "tokenMaster": "0:" + "c" * 64,
            "amount": "1000000",
            "validUntil": 1700000000,
            "nonce": "abc",
            "settlementBoc": "",
            "walletPublicKey": "d" * 64,
        }

        result = await facilitator.verify(
            payload=payload,
            requirements={"scheme": "wrong", "network": TVM_MAINNET},
        )

        assert result["is_valid"] is False
        assert "Unsupported scheme" in result["invalid_reason"]


class TestFacilitatorSchemeConfig:
    """Test ExactTvmSchemeConfig defaults."""

    def test_default_config(self):
        config = ExactTvmSchemeConfig()
        assert config.relay_address is None
        assert config.max_relay_commission == 500_000
        assert config.settlement_timeout == 15
