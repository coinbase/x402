"""Tests for ERC-4337 server scheme."""

from unittest.mock import MagicMock

import pytest

from x402.mechanisms.evm.exact.erc4337_server import ExactEvmSchemeERC4337
from x402.schemas import PaymentRequirements, SupportedKind


def _make_requirements(**kwargs):
    req = MagicMock(spec=PaymentRequirements)
    req.scheme = kwargs.get("scheme", "exact")
    req.network = kwargs.get("network", "eip155:84532")
    req.amount = kwargs.get("amount", "1000000")
    req.asset = kwargs.get("asset", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")
    req.pay_to = kwargs.get("pay_to", "0xRecipient")
    req.extra = kwargs.get("extra", {
        "name": "USDC",
        "version": "2",
    })
    return req


def _make_supported_kind(**kwargs):
    sk = MagicMock(spec=SupportedKind)
    sk.x402_version = kwargs.get("x402_version", 2)
    sk.scheme = kwargs.get("scheme", "exact")
    sk.network = kwargs.get("network", "eip155:84532")
    sk.extra = kwargs.get("extra", None)
    return sk


class TestExactEvmSchemeERC4337Server:
    def test_scheme(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.scheme == "exact"

    def test_preserves_user_operation(self):
        scheme = ExactEvmSchemeERC4337()
        req = _make_requirements(
            extra={
                "name": "USDC",
                "version": "2",
                "userOperation": {
                    "supported": True,
                    "bundlerUrl": "https://bundler.example.com",
                    "entrypoint": "0xEntryPoint",
                },
            }
        )
        sk = _make_supported_kind()

        enhanced = scheme.enhance_payment_requirements(req, sk, [])

        user_op = enhanced.extra.get("userOperation")
        assert user_op is not None
        assert user_op["supported"] is True
        assert user_op["bundlerUrl"] == "https://bundler.example.com"

    def test_no_user_operation_passthrough(self):
        scheme = ExactEvmSchemeERC4337()
        req = _make_requirements()
        sk = _make_supported_kind()

        enhanced = scheme.enhance_payment_requirements(req, sk, [])

        # Should NOT have userOperation when not in original
        assert "userOperation" not in enhanced.extra

    def test_get_supported_networks(self):
        scheme = ExactEvmSchemeERC4337()
        networks = scheme.get_supported_networks()
        assert len(networks) >= 6
        assert "eip155:42161" in networks  # Arbitrum
        assert "eip155:10" in networks  # Optimism
