"""Tests for ERC-4337 client scheme."""

import pytest
from unittest.mock import MagicMock

from x402.mechanisms.evm.erc4337_types import UserOperation07Json
from x402.mechanisms.evm.exact.erc4337_client import ExactEvmSchemeERC4337
from x402.mechanisms.evm.exact.erc4337_errors import PaymentCreationError, parse_aa_error
from x402.schemas import PaymentRequirements


def _make_mock_signer(address="0xSender", signature="0xMockSig"):
    signer = MagicMock()
    signer.address = address
    signer.sign_user_operation.return_value = signature
    return signer


def _make_mock_bundler(user_op=None):
    bundler = MagicMock()
    if user_op is None:
        user_op = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="",
        )
    bundler.prepare_user_operation.return_value = user_op
    return bundler


def _make_requirements():
    req = MagicMock(spec=PaymentRequirements)
    req.network = "eip155:84532"
    req.amount = "1000000"
    req.asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    req.pay_to = "0xRecipient"
    req.extra = {
        "userOperation": {
            "supported": True,
            "bundlerUrl": "https://bundler.example.com",
            "entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
    }
    return req


class TestExactEvmSchemeERC4337Client:
    def test_scheme(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
        )
        assert scheme.scheme == "exact"

    def test_create_payload_success(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        payload = scheme.create_payment_payload(_make_requirements())
        assert "userOperation" in payload
        assert "entryPoint" in payload
        assert payload["userOperation"]["signature"] == "0xMockSig"

    def test_missing_entrypoint(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            bundler_url="https://bundler.example.com",
        )

        req = _make_requirements()
        req.extra = None

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(req)
        assert exc.value.phase == "validation"

    def test_missing_bundler_url(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        )

        req = _make_requirements()
        req.extra = None

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(req)
        assert exc.value.phase == "validation"

    def test_preparation_fails(self):
        bundler = _make_mock_bundler()
        bundler.prepare_user_operation.side_effect = Exception("AA21 error")

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=bundler,
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.phase == "preparation"

    def test_signing_fails(self):
        signer = _make_mock_signer()
        signer.sign_user_operation.side_effect = Exception("signing error")

        scheme = ExactEvmSchemeERC4337(
            signer=signer,
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.phase == "signing"

    def test_entrypoint_from_requirements(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            bundler_url="https://bundler.example.com",
        )

        payload = scheme.create_payment_payload(_make_requirements())
        assert payload["entryPoint"] == "0x0000000071727De22E5E9d8BAf0edAc6f37da032"


class TestParseAAError:
    def test_found_aa21(self):
        result = parse_aa_error("AA21 insufficient funds for gas prefund")
        assert result is not None
        assert result["code"] == "AA21"
        assert result["reason"] == "Insufficient funds for gas prefund"

    def test_found_aa24(self):
        result = parse_aa_error(Exception("AA24 signature error"))
        assert result is not None
        assert result["code"] == "AA24"

    def test_no_aa_code(self):
        result = parse_aa_error("some generic error")
        assert result is None

    def test_none(self):
        result = parse_aa_error(None)
        assert result is None
