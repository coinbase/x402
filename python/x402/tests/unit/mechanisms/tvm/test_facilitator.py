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
        self.send_boc_calls = 0

    async def get_seqno(self, address):
        return self._seqno

    async def get_jetton_wallet(self, master, owner):
        return self._jetton_wallet

    async def get_account_state(self, address):
        return {"balance": 1000, "status": "active", "code_hash": ""}

    async def get_transaction(self, tx_hash):
        return None

    async def send_boc(self, boc):
        self.send_boc_calls += 1
        return True


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
            facilitator_url="https://facilitator.example.com",
        )
        facilitator = ExactTvmFacilitatorScheme(provider, config)
        assert facilitator._config.facilitator_url == "https://facilitator.example.com"


class TestGetExtra:
    """Test get_extra method."""

    def test_returns_none_without_facilitator_url(self):
        provider = MockFacilitatorProvider()
        facilitator = ExactTvmFacilitatorScheme(provider)
        assert facilitator.get_extra(TVM_MAINNET) is None

    def test_returns_facilitator_url_when_configured(self):
        provider = MockFacilitatorProvider()
        config = ExactTvmSchemeConfig(facilitator_url="https://facilitator.example.com")
        facilitator = ExactTvmFacilitatorScheme(provider, config)
        extra = facilitator.get_extra(TVM_MAINNET)
        assert extra is not None
        assert extra["facilitatorUrl"] == "https://facilitator.example.com"


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
        assert config.facilitator_url == ""
        assert config.settlement_timeout == 15
