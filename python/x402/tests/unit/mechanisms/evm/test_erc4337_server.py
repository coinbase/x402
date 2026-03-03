"""Tests for ERC-4337 server scheme."""

from unittest.mock import MagicMock, patch

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
    req.extra = kwargs.get(
        "extra",
        {
            "name": "USDC",
            "version": "2",
        },
    )
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


class TestGetSupportedNetworks:
    def test_all_6_chains_present(self):
        scheme = ExactEvmSchemeERC4337()
        networks = scheme.get_supported_networks()
        expected = {
            "eip155:8453",      # Base
            "eip155:84532",     # Base Sepolia
            "eip155:10",        # Optimism
            "eip155:11155420",  # Optimism Sepolia
            "eip155:42161",     # Arbitrum One
            "eip155:421614",    # Arbitrum Sepolia
        }
        assert expected.issubset(set(networks))


class TestParsePrice:
    def test_parse_price_success_via_parent(self):
        """parse_price succeeds via parent for known Base Sepolia network."""
        scheme = ExactEvmSchemeERC4337()
        # Use a value that the parent's default USDC conversion can handle
        # The parent parse_price expects a Money type (str/float)
        # For a network known to the parent (base-sepolia), it should work
        result = scheme.parse_price("1.50", "eip155:84532")
        assert result.amount is not None
        assert result.asset is not None

    def test_parse_price_erc4337_registry_fallback(self):
        """parse_price falls back to ERC-4337 registry for networks only known there."""
        scheme = ExactEvmSchemeERC4337()
        # Use a network that the parent doesn't know but ERC-4337 registry has
        # We need to patch the parent to fail, then let our override succeed
        with patch.object(
            ExactEvmSchemeERC4337.__bases__[0],
            "parse_price",
            side_effect=ValueError("unsupported"),
        ):
            result = scheme.parse_price("2.00", "eip155:84532")
            assert result.amount == "2.00"
            assert result.asset == "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
            assert result.extra["name"] == "USD Coin"
            assert result.extra["version"] == "2"

    def test_parse_price_failure_unsupported_network(self):
        """parse_price raises ValueError for completely unsupported network."""
        scheme = ExactEvmSchemeERC4337()
        with pytest.raises(ValueError, match="Unsupported network"):
            scheme.parse_price("1.00", "eip155:999999999")


class TestEnhancePaymentRequirements:
    def test_parent_fail_erc4337_fallback_succeeds(self):
        """enhance_payment_requirements falls back to ERC-4337 registry when parent fails."""
        scheme = ExactEvmSchemeERC4337()
        req = _make_requirements(
            network="eip155:11155420",  # Optimism Sepolia - may not be in parent registry
            asset="",
            extra={
                "userOperation": {
                    "supported": True,
                    "bundlerUrl": "https://bundler.example.com",
                    "entrypoint": "0xEntryPoint",
                },
            },
        )
        sk = _make_supported_kind(network="eip155:11155420")

        # Patch parent to fail, so ERC-4337 fallback is used
        with patch.object(
            ExactEvmSchemeERC4337.__bases__[0],
            "enhance_payment_requirements",
            side_effect=ValueError("unsupported network"),
        ):
            enhanced = scheme.enhance_payment_requirements(req, sk, [])
            # Should have filled in asset from ERC-4337 registry
            assert enhanced.asset == "0x5fd84259d66Cd46123540766Be93DFE6D43130D7"
            assert enhanced.extra["name"] == "USD Coin"
            assert enhanced.extra["version"] == "2"
            # Should preserve userOperation capability
            assert "userOperation" in enhanced.extra
            assert enhanced.extra["userOperation"]["supported"] is True

    def test_parent_fail_with_key_error_falls_back(self):
        """enhance_payment_requirements also catches KeyError from parent."""
        scheme = ExactEvmSchemeERC4337()
        req = _make_requirements(
            network="eip155:84532",
            asset="",
            extra=None,
        )
        sk = _make_supported_kind()

        with patch.object(
            ExactEvmSchemeERC4337.__bases__[0],
            "enhance_payment_requirements",
            side_effect=KeyError("missing key"),
        ):
            enhanced = scheme.enhance_payment_requirements(req, sk, [])
            assert enhanced.asset == "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

    def test_preserves_paymaster_in_user_operation(self):
        """enhance_payment_requirements preserves paymaster field in userOperation."""
        scheme = ExactEvmSchemeERC4337()
        req = _make_requirements(
            extra={
                "name": "USDC",
                "version": "2",
                "userOperation": {
                    "supported": True,
                    "bundlerUrl": "https://bundler.example.com",
                    "paymaster": "0xPaymaster",
                    "entrypoint": "0xEntryPoint",
                },
            }
        )
        sk = _make_supported_kind()

        enhanced = scheme.enhance_payment_requirements(req, sk, [])
        user_op = enhanced.extra.get("userOperation")
        assert user_op is not None
        assert user_op["paymaster"] == "0xPaymaster"
        assert user_op["entrypoint"] == "0xEntryPoint"
