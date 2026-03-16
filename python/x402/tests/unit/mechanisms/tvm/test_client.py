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


class TestExactTvmSchemeConstructor:
    """Test ExactTvmScheme constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        signer = MockClientSigner()
        client = ExactTvmClientScheme(signer)
        assert client.scheme == "exact"

    def test_should_store_signer_reference(self):
        signer = MockClientSigner()
        client = ExactTvmClientScheme(signer)
        assert client._signer is signer


class TestCreatePaymentPayload:
    """Test create_payment_payload method."""

    def test_should_have_create_payment_payload_method(self):
        signer = MockClientSigner()
        client = ExactTvmClientScheme(signer)
        assert hasattr(client, "create_payment_payload")
        assert callable(client.create_payment_payload)
