"""Tests for ExactHypercoreScheme facilitator."""

import time

from x402.mechanisms.hypercore import NETWORK_MAINNET
from x402.mechanisms.hypercore.exact import ExactHypercoreFacilitatorScheme
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo


class TestExactHypercoreSchemeConstructor:
    """Test ExactHypercoreScheme facilitator constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        """Should create instance with correct scheme."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        assert facilitator.scheme == "exact"

    def test_should_create_instance_with_api_url(self):
        """Should create instance with API URL."""
        api_url = "https://api.hyperliquid-testnet.xyz"
        facilitator = ExactHypercoreFacilitatorScheme(api_url)

        assert facilitator.api_url == api_url


class TestVerify:
    """Test verify method."""

    def test_should_reject_if_network_does_not_match(self):
        """Should reject if network does not match."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network="invalid:network",
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network="invalid:network",
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "invalid_network" in result.invalid_reason

    def test_should_reject_if_action_type_is_wrong(self):
        """Should reject if action type is not sendAsset."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "wrongType",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "invalid_action_type" in result.invalid_reason

    def test_should_reject_if_destination_does_not_match(self):
        """Should reject if destination does not match."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0xWrongDestination1234567890123456789012345",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "destination_mismatch" in result.invalid_reason

    def test_should_reject_if_amount_is_insufficient(self):
        """Should reject if amount is insufficient."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.05000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "insufficient_amount" in result.invalid_reason

    def test_should_reject_if_token_does_not_match(self):
        """Should reject if token does not match."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "WRONG:0x00000000000000000000000000000000",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "token_mismatch" in result.invalid_reason

    def test_should_reject_if_nonce_is_too_old(self):
        """Should reject if nonce is more than 1 hour old."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        old_nonce = int((time.time() - 7200) * 1000)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": old_nonce,
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": old_nonce,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "nonce_too_old" in result.invalid_reason

    def test_should_reject_if_signature_is_missing_fields(self):
        """Should reject if signature is missing r, s, or v."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "invalid_signature_structure" in result.invalid_reason

    def test_should_accept_valid_payment(self):
        """Should accept valid payment payload."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=NETWORK_MAINNET,
                asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                amount="10000000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
            ),
            payload={
                "action": {
                    "type": "sendAsset",
                    "hyperliquidChain": "Mainnet",
                    "signatureChainId": "0x3e7",
                    "destination": "0x0987654321098765432109876543210987654321",
                    "sourceDex": "spot",
                    "destinationDex": "spot",
                    "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
                    "amount": "0.10000000",
                    "fromSubAccount": "",
                    "nonce": int(time.time() * 1000),
                },
                "signature": {"r": "0x" + "00" * 32, "s": "0x" + "00" * 32, "v": 27},
                "nonce": int(time.time() * 1000),
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=NETWORK_MAINNET,
            asset="USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            amount="10000000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is True
        assert result.invalid_reason is None


class TestFacilitatorSchemeAttributes:
    """Test facilitator scheme attributes."""

    def test_scheme_attribute_is_exact(self):
        """scheme attribute should be 'exact'."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        assert facilitator.scheme == "exact"

    def test_caip_family_attribute(self):
        """caip_family attribute should be 'hypercore:*'."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        assert facilitator.caip_family == "hypercore:*"

    def test_get_extra_returns_none(self):
        """get_extra should return None for Hypercore."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        extra = facilitator.get_extra(NETWORK_MAINNET)

        assert extra is None

    def test_get_signers_returns_empty_list(self):
        """get_signers should return empty list (stateless facilitator)."""
        facilitator = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        result = facilitator.get_signers(NETWORK_MAINNET)

        assert result == []
