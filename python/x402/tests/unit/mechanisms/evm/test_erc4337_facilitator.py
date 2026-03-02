"""Tests for ERC-4337 facilitator."""

from unittest.mock import MagicMock, patch

import pytest

from x402.mechanisms.evm.erc4337_constants import (
    ERR_GAS_ESTIMATION_FAILED,
    ERR_MISSING_BUNDLER_URL,
    ERR_MISSING_ENTRY_POINT,
    ERR_MISSING_USER_OPERATION,
)
from x402.mechanisms.evm.exact.erc4337_facilitator import (
    ExactEvmSchemeERC4337,
    ExactEvmSchemeERC4337Config,
)
from x402.schemas import PaymentPayload, PaymentRequirements


def _make_accepted(scheme="exact", network="eip155:84532"):
    """Create a mock accepted field."""
    accepted = MagicMock()
    accepted.scheme = scheme
    accepted.network = network
    return accepted


def _make_payload(bundler_url="https://bundler.example.com"):
    """Create a mock ERC-4337 payment payload."""
    payload_dict = {
        "type": "erc4337",
        "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        "userOperation": {
            "sender": "0xSender",
            "nonce": "0x01",
            "callData": "0xCallData",
            "callGasLimit": "0x5208",
            "verificationGasLimit": "0x10000",
            "preVerificationGas": "0x5000",
            "maxFeePerGas": "0x3B9ACA00",
            "maxPriorityFeePerGas": "0x59682F00",
            "signature": "0xSig",
        },
    }
    if bundler_url:
        payload_dict["bundlerRpcUrl"] = bundler_url

    mock_payload = MagicMock(spec=PaymentPayload)
    mock_payload.payload = payload_dict
    mock_payload.accepted = _make_accepted()
    return mock_payload


def _make_requirements():
    """Create mock payment requirements."""
    req = MagicMock(spec=PaymentRequirements)
    req.scheme = "exact"
    req.network = "eip155:84532"
    req.amount = "1000000"
    req.asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    req.pay_to = "0xRecipient"
    req.extra = None
    return req


class TestExactEvmSchemeERC4337:
    def test_scheme(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.scheme == "exact"

    def test_caip_family(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.caip_family == "eip155:*"

    def test_get_signers_empty(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.get_signers("eip155:84532") == []

    def test_get_extra_none(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.get_extra("eip155:84532") is None


class TestVerify:
    def test_not_erc4337_payload(self):
        scheme = ExactEvmSchemeERC4337()
        payload = MagicMock()
        payload.payload = {"authorization": {"from": "0x1234"}}
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_USER_OPERATION

    def test_missing_bundler_url(self):
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload(bundler_url=None)
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_BUNDLER_URL

    def test_missing_entry_point(self):
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        payload.payload["entryPoint"] = ""
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_ENTRY_POINT

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_verify_success(self, mock_bundler_cls):
        mock_bundler = MagicMock()
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is True
        assert result.payer == "0xSender"

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_verify_gas_estimation_fail(self, mock_bundler_cls):
        mock_bundler = MagicMock()
        mock_bundler.estimate_user_operation_gas.side_effect = Exception("AA21 error")
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_GAS_ESTIMATION_FAILED

    def test_bundler_url_from_config(self):
        scheme = ExactEvmSchemeERC4337(
            ExactEvmSchemeERC4337Config(default_bundler_url="https://config-bundler.com")
        )
        payload = _make_payload(bundler_url=None)

        with patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient") as mock_cls:
            mock_cls.return_value = MagicMock()
            result = scheme.verify(payload, _make_requirements())
            assert result.is_valid is True
            mock_cls.assert_called_with("https://config-bundler.com")
