"""Tests for ExactTvmScheme client."""

import pytest

try:
    from pytoniq_core import Cell
except ImportError:
    pytest.skip("TVM requires pytoniq-core", allow_module_level=True)

from x402.mechanisms.tvm.exact import ExactTvmClientScheme


class MockClientSigner:
    """Mock client signer for tests."""

    def __init__(self):
        self._address = "0:" + "a" * 64
        self._public_key = "b" * 64

    @property
    def address(self):
        return self._address

    @property
    def public_key(self):
        return self._public_key

    async def sign_transfer(self, seqno, valid_until, messages):
        return "base64_signed_boc"


class MockProvider:
    """Mock provider for tests."""

    def __init__(self, seqno=0, jetton_wallet=None):
        self._seqno = seqno
        self._jetton_wallet = jetton_wallet or ("0:" + "d" * 64)

    async def get_seqno(self, address):
        return self._seqno

    async def get_jetton_wallet(self, master, owner):
        return self._jetton_wallet

    async def get_account_state(self, address):
        return {"balance": 1000, "status": "active", "code_hash": ""}

    async def get_transaction(self, tx_hash):
        return None

    async def gasless_estimate(self, **kwargs):
        return {
            "messages": [
                {"address": self._jetton_wallet, "amount": "0"},
            ],
            "commission": "50000",
        }

    async def gasless_send(self, boc, wallet_public_key):
        return "msg_hash"

    async def get_gasless_config(self):
        return {}


class TestExactTvmSchemeConstructor:
    """Test ExactTvmScheme constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        signer = MockClientSigner()
        provider = MockProvider()
        client = ExactTvmClientScheme(signer, provider)
        assert client.scheme == "exact"

    def test_should_store_signer_reference(self):
        signer = MockClientSigner()
        provider = MockProvider()
        client = ExactTvmClientScheme(signer, provider)
        assert client._signer is signer

    def test_should_store_provider_reference(self):
        signer = MockClientSigner()
        provider = MockProvider()
        client = ExactTvmClientScheme(signer, provider)
        assert client._provider is provider


class TestCreatePaymentPayload:
    """Test create_payment_payload method."""

    def test_should_have_create_payment_payload_method(self):
        signer = MockClientSigner()
        provider = MockProvider()
        client = ExactTvmClientScheme(signer, provider)
        assert hasattr(client, "create_payment_payload")
        assert callable(client.create_payment_payload)

    @pytest.mark.asyncio
    async def test_should_return_payload_dict(self):
        signer = MockClientSigner()
        provider = MockProvider(seqno=5)
        client = ExactTvmClientScheme(signer, provider)

        requirements = {
            "scheme": "exact",
            "network": "tvm:-239",
            "asset": "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe",
            "amount": "1000000",
            "pay_to": "0:" + "c" * 64,
        }

        payload = await client.create_payment_payload(requirements)

        assert isinstance(payload, dict)
        assert "from" in payload
        assert "to" in payload
        assert "tokenMaster" in payload
        assert "amount" in payload
        assert "validUntil" in payload
        assert "nonce" in payload
        assert "signedMessages" in payload
        assert "commission" in payload
        assert "settlementBoc" in payload
        assert "walletPublicKey" in payload

    @pytest.mark.asyncio
    async def test_payload_contains_correct_values(self):
        signer = MockClientSigner()
        provider = MockProvider(seqno=5)
        client = ExactTvmClientScheme(signer, provider)

        asset = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"
        pay_to = "0:" + "c" * 64
        requirements = {
            "scheme": "exact",
            "network": "tvm:-239",
            "asset": asset,
            "amount": "1000000",
            "pay_to": pay_to,
        }

        payload = await client.create_payment_payload(requirements)

        assert payload["amount"] == "1000000"
        assert payload["to"] == pay_to
        assert payload["tokenMaster"] == asset
        assert payload["walletPublicKey"] == signer.public_key
        assert payload["settlementBoc"] == "base64_signed_boc"
