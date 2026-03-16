"""Tests for x402.interfaces module.

This module tests the core Protocol interfaces that payment schemes must implement,
including FacilitatorExtension, FacilitatorContext, and all the scheme protocols.
"""

from typing import Any

import pytest

from x402.interfaces import (
    FacilitatorContext,
    FacilitatorExtension,
)
from x402.schemas import (
    AssetAmount,
    Network,
    PaymentPayload,
    PaymentRequirements,
    PaymentRequirementsV1,
    Price,
    SettleResponse,
    SupportedKind,
    VerifyResponse,
)
from x402.schemas.v1 import PaymentPayloadV1

# ============================================================================
# FacilitatorExtension Tests
# ============================================================================

class TestFacilitatorExtension:
    """Test FacilitatorExtension base class."""

    def test_creation(self):
        """Test basic FacilitatorExtension creation."""
        ext = FacilitatorExtension(key="test_key")
        assert ext.key == "test_key"

    def test_frozen(self):
        """Test that FacilitatorExtension is frozen (immutable)."""
        ext = FacilitatorExtension(key="test_key")
        with pytest.raises(AttributeError):  # FrozenInstanceError in dataclasses
            ext.key = "modified"

    def test_hashable(self):
        """Test that FacilitatorExtension is hashable (can be used as dict key)."""
        ext1 = FacilitatorExtension(key="test_key")
        ext2 = FacilitatorExtension(key="test_key")
        ext3 = FacilitatorExtension(key="different_key")

        # Should be hashable
        assert hash(ext1) == hash(ext2)
        assert hash(ext1) != hash(ext3)

        # Can be used as dict keys
        test_dict = {ext1: "value1", ext3: "value3"}
        assert len(test_dict) == 2

    def test_equality(self):
        """Test FacilitatorExtension equality."""
        ext1 = FacilitatorExtension(key="test_key")
        ext2 = FacilitatorExtension(key="test_key")
        ext3 = FacilitatorExtension(key="different_key")

        assert ext1 == ext2
        assert ext1 != ext3
        assert ext2 != ext3


# ============================================================================
# FacilitatorContext Tests
# ============================================================================

class TestFacilitatorContext:
    """Test FacilitatorContext functionality."""

    def test_empty_context(self):
        """Test FacilitatorContext with no extensions."""
        context = FacilitatorContext({})
        assert context.get_extension("nonexistent") is None

    def test_with_extensions(self):
        """Test FacilitatorContext with registered extensions."""
        ext1 = FacilitatorExtension(key="ext1")
        ext2 = FacilitatorExtension(key="ext2")
        extensions = {"ext1": ext1, "ext2": ext2}

        context = FacilitatorContext(extensions)

        assert context.get_extension("ext1") == ext1
        assert context.get_extension("ext2") == ext2
        assert context.get_extension("nonexistent") is None

    def test_extension_reference_behavior(self):
        """Test that FacilitatorContext holds a reference to the extensions dict."""
        ext1 = FacilitatorExtension(key="ext1")
        extensions = {"ext1": ext1}

        context = FacilitatorContext(extensions)

        # Modify original dict
        ext2 = FacilitatorExtension(key="ext2")
        extensions["ext2"] = ext2

        # Context should see the changes (it holds a reference, not a copy)
        assert context.get_extension("ext1") == ext1
        assert context.get_extension("ext2") == ext2


# ============================================================================
# Mock Implementations for Protocol Testing
# ============================================================================

class MockSchemeNetworkClient:
    """Mock implementation of SchemeNetworkClient for testing."""

    @property
    def scheme(self) -> str:
        return "mock_exact"

    def create_payment_payload(self, requirements: PaymentRequirements) -> dict[str, Any]:
        return {
            "authorization": {"from": "0x123", "to": requirements.pay_to, "value": requirements.amount},
            "signature": "0xmocksignature"
        }


class MockSchemeNetworkClientV1:
    """Mock implementation of SchemeNetworkClientV1 for testing."""

    @property
    def scheme(self) -> str:
        return "mock_exact_v1"

    def create_payment_payload(self, requirements: PaymentRequirementsV1) -> dict[str, Any]:
        return {
            "authorization": {"from": "0x123", "to": requirements.pay_to, "value": requirements.max_amount_required},
            "signature": "0xmocksignaturev1"
        }


class MockSchemeNetworkServer:
    """Mock implementation of SchemeNetworkServer for testing."""

    @property
    def scheme(self) -> str:
        return "mock_exact_server"

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        # Simple mock: convert any price to fixed AssetAmount
        return AssetAmount(
            amount="1000000",
            asset="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        )

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        extensions: list[str]
    ) -> PaymentRequirements:
        # Add mock EIP-712 domain params
        enhanced = requirements.model_copy()
        enhanced.extra = enhanced.extra or {}
        enhanced.extra.update({"name": "MockToken", "version": "1"})
        return enhanced


class MockSchemeNetworkFacilitator:
    """Mock implementation of SchemeNetworkFacilitator for testing."""

    @property
    def scheme(self) -> str:
        return "mock_exact_facilitator"

    @property
    def caip_family(self) -> str:
        return "eip155:*"

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        return {"mockExtra": "value"}

    def get_signers(self, network: Network) -> list[str]:
        return ["0xmocksigner1", "0xmocksigner2"]

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context: FacilitatorContext | None = None
    ) -> VerifyResponse:
        return VerifyResponse(is_valid=True)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context: FacilitatorContext | None = None
    ) -> SettleResponse:
        return SettleResponse(success=True, transaction="0xmocktxhash", network=requirements.network)


class MockSchemeNetworkFacilitatorV1:
    """Mock implementation of SchemeNetworkFacilitatorV1 for testing."""

    @property
    def scheme(self) -> str:
        return "mock_exact_facilitator_v1"

    @property
    def caip_family(self) -> str:
        return "eip155:*"

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        return {"mockExtraV1": "value"}

    def get_signers(self, network: Network) -> list[str]:
        return ["0xmocksignerv1"]

    def verify(
        self,
        payload: PaymentPayloadV1,
        requirements: PaymentRequirementsV1,
        context: FacilitatorContext | None = None
    ) -> VerifyResponse:
        return VerifyResponse(is_valid=True)

    def settle(
        self,
        payload: PaymentPayloadV1,
        requirements: PaymentRequirementsV1,
        context: FacilitatorContext | None = None
    ) -> SettleResponse:
        return SettleResponse(success=True, transaction="0xmocktxhashv1", network=requirements.network)


# ============================================================================
# Protocol Compliance Tests
# ============================================================================

class TestSchemeNetworkClientProtocol:
    """Test SchemeNetworkClient protocol compliance."""

    def test_scheme_property(self):
        """Test that scheme property returns string."""
        client = MockSchemeNetworkClient()
        assert isinstance(client.scheme, str)
        assert client.scheme == "mock_exact"

    def test_create_payment_payload(self):
        """Test create_payment_payload method."""
        client = MockSchemeNetworkClient()

        # Create mock PaymentRequirements
        requirements = PaymentRequirements(
            pay_to="0xrecipient",
            amount="1000000",
            asset="0xUSDC",
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300
        )

        result = client.create_payment_payload(requirements)

        assert isinstance(result, dict)
        assert "authorization" in result
        assert "signature" in result
        assert result["authorization"]["to"] == requirements.pay_to
        assert result["authorization"]["value"] == requirements.amount


class TestSchemeNetworkClientV1Protocol:
    """Test SchemeNetworkClientV1 protocol compliance."""

    def test_scheme_property(self):
        """Test that scheme property returns string."""
        client = MockSchemeNetworkClientV1()
        assert isinstance(client.scheme, str)
        assert client.scheme == "mock_exact_v1"

    def test_create_payment_payload_v1(self):
        """Test create_payment_payload method for V1."""
        client = MockSchemeNetworkClientV1()

        # Create mock V1 PaymentRequirements
        requirements = PaymentRequirementsV1(
            pay_to="0xrecipient",
            max_amount_required="1000000",
            asset="0xUSDC",
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300,
            resource="test://resource"
        )

        result = client.create_payment_payload(requirements)

        assert isinstance(result, dict)
        assert "authorization" in result
        assert "signature" in result
        assert result["authorization"]["to"] == requirements.pay_to
        assert result["authorization"]["value"] == requirements.max_amount_required


class TestSchemeNetworkServerProtocol:
    """Test SchemeNetworkServer protocol compliance."""

    def test_scheme_property(self):
        """Test that scheme property returns string."""
        server = MockSchemeNetworkServer()
        assert isinstance(server.scheme, str)
        assert server.scheme == "mock_exact_server"

    def test_parse_price(self):
        """Test parse_price method."""
        server = MockSchemeNetworkServer()

        # Test with Money price (Money is str | int | float)
        price = 1.5
        network = "eip155:1"

        result = server.parse_price(price, network)

        assert isinstance(result, AssetAmount)
        assert result.amount == "1000000"
        assert result.asset.startswith("0x")

    def test_enhance_payment_requirements(self):
        """Test enhance_payment_requirements method."""
        server = MockSchemeNetworkServer()

        requirements = PaymentRequirements(
            pay_to="0xrecipient",
            amount="1000000",
            asset="0xUSDC",
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300
        )

        supported_kind = SupportedKind(
            x402_version=2,
            scheme="exact",
            network="eip155:1"
        )

        result = server.enhance_payment_requirements(requirements, supported_kind, [])

        assert isinstance(result, PaymentRequirements)
        assert result.extra is not None
        assert "name" in result.extra
        assert result.extra["name"] == "MockToken"


class TestSchemeNetworkFacilitatorProtocol:
    """Test SchemeNetworkFacilitator protocol compliance."""

    def test_properties(self):
        """Test required properties."""
        facilitator = MockSchemeNetworkFacilitator()

        assert isinstance(facilitator.scheme, str)
        assert facilitator.scheme == "mock_exact_facilitator"

        assert isinstance(facilitator.caip_family, str)
        assert facilitator.caip_family == "eip155:*"

    def test_get_extra(self):
        """Test get_extra method."""
        facilitator = MockSchemeNetworkFacilitator()
        network = Network("eip155:1")

        result = facilitator.get_extra(network)

        assert isinstance(result, dict)
        assert "mockExtra" in result

    def test_get_signers(self):
        """Test get_signers method."""
        facilitator = MockSchemeNetworkFacilitator()
        network = Network("eip155:1")

        result = facilitator.get_signers(network)

        assert isinstance(result, list)
        assert len(result) == 2
        assert all(isinstance(addr, str) for addr in result)

    def test_verify(self):
        """Test verify method."""
        facilitator = MockSchemeNetworkFacilitator()

        payload = PaymentPayload(
            x402_version=2,
            payload={"mock": "data"},
            accepted=PaymentRequirements(
                pay_to="0xrecipient",
                amount="1000000",
                asset="0xUSDC",
                network="eip155:1",
                scheme="exact",
                max_timeout_seconds=300
            )
        )

        requirements = payload.accepted

        result = facilitator.verify(payload, requirements)

        assert isinstance(result, VerifyResponse)
        assert result.is_valid is True

    def test_verify_with_context(self):
        """Test verify method with FacilitatorContext."""
        facilitator = MockSchemeNetworkFacilitator()

        # Create context with extension
        ext = FacilitatorExtension(key="test_ext")
        context = FacilitatorContext({"test_ext": ext})

        payload = PaymentPayload(
            x402_version=2,
            payload={"mock": "data"},
            accepted=PaymentRequirements(
                pay_to="0xrecipient",
                amount="1000000",
                asset="0xUSDC",
                network="eip155:1",
                scheme="exact",
                max_timeout_seconds=300
            )
        )

        requirements = payload.accepted

        result = facilitator.verify(payload, requirements, context)

        assert isinstance(result, VerifyResponse)
        assert result.is_valid is True

    def test_settle(self):
        """Test settle method."""
        facilitator = MockSchemeNetworkFacilitator()

        payload = PaymentPayload(
            x402_version=2,
            payload={"mock": "data"},
            accepted=PaymentRequirements(
                pay_to="0xrecipient",
                amount="1000000",
                asset="0xUSDC",
                network="eip155:1",
                scheme="exact",
                max_timeout_seconds=300
            )
        )

        requirements = payload.accepted

        result = facilitator.settle(payload, requirements)

        assert isinstance(result, SettleResponse)
        assert result.success is True
        assert result.transaction == "0xmocktxhash"


class TestSchemeNetworkFacilitatorV1Protocol:
    """Test SchemeNetworkFacilitatorV1 protocol compliance."""

    def test_properties(self):
        """Test required properties."""
        facilitator = MockSchemeNetworkFacilitatorV1()

        assert isinstance(facilitator.scheme, str)
        assert facilitator.scheme == "mock_exact_facilitator_v1"

        assert isinstance(facilitator.caip_family, str)
        assert facilitator.caip_family == "eip155:*"

    def test_verify_v1(self):
        """Test verify method with V1 types."""
        facilitator = MockSchemeNetworkFacilitatorV1()

        payload = PaymentPayloadV1(
            scheme="exact",
            network="eip155:1",
            payload={"mock": "data"}
        )
        requirements = PaymentRequirementsV1(
            pay_to="0xrecipient",
            max_amount_required="1000000",
            asset="0xUSDC",
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300,
            resource="test://resource"
        )

        result = facilitator.verify(payload, requirements)

        assert isinstance(result, VerifyResponse)
        assert result.is_valid is True

    def test_settle_v1(self):
        """Test settle method with V1 types."""
        facilitator = MockSchemeNetworkFacilitatorV1()

        payload = PaymentPayloadV1(
            scheme="exact",
            network="eip155:1",
            payload={"mock": "data"}
        )
        requirements = PaymentRequirementsV1(
            pay_to="0xrecipient",
            max_amount_required="1000000",
            asset="0xUSDC",
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300,
            resource="test://resource"
        )

        result = facilitator.settle(payload, requirements)

        assert isinstance(result, SettleResponse)
        assert result.success is True
        assert result.transaction == "0xmocktxhashv1"


# ============================================================================
# Edge Case and Error Handling Tests
# ============================================================================

class TestProtocolEdgeCases:
    """Test edge cases and error conditions in protocol implementations."""

    def test_facilitator_context_none(self):
        """Test protocols handle None context gracefully."""
        facilitator = MockSchemeNetworkFacilitator()

        payload = PaymentPayload(
            x402_version=2,
            payload={"mock": "data"},
            accepted=PaymentRequirements(
                pay_to="0xrecipient",
                amount="1000000",
                asset="0xUSDC",
                network="eip155:1",
                scheme="exact",
                max_timeout_seconds=300
            )
        )

        requirements = payload.accepted

        # Should not raise exception when context is None
        verify_result = facilitator.verify(payload, requirements, None)
        assert isinstance(verify_result, VerifyResponse)

        settle_result = facilitator.settle(payload, requirements, None)
        assert isinstance(settle_result, SettleResponse)

    def test_empty_extensions_list(self):
        """Test server enhancement with empty extensions list."""
        server = MockSchemeNetworkServer()

        requirements = PaymentRequirements(
            pay_to="0xrecipient",
            amount="1000000",
            asset="0xUSDC",
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300
        )

        supported_kind = SupportedKind(
            x402_version=2,
            scheme="exact",
            network="eip155:1"
        )

        # Should handle empty extensions list
        result = server.enhance_payment_requirements(requirements, supported_kind, [])
        assert isinstance(result, PaymentRequirements)

    def test_get_extension_key_types(self):
        """Test FacilitatorContext.get_extension with various key types."""
        ext = FacilitatorExtension(key="test_key")
        context = FacilitatorContext({"test_key": ext})

        # Normal string key
        assert context.get_extension("test_key") == ext

        # Non-existent key
        assert context.get_extension("nonexistent") is None

        # Empty string key
        assert context.get_extension("") is None


# ============================================================================
# Integration Tests
# ============================================================================

class TestProtocolIntegration:
    """Test how different protocols work together."""

    def test_client_server_facilitator_flow(self):
        """Test typical flow through client → server → facilitator."""
        client = MockSchemeNetworkClient()
        server = MockSchemeNetworkServer()
        facilitator = MockSchemeNetworkFacilitator()

        # 1. Server parses price and enhances requirements
        price = 1.0  # Money type (Price is Money | AssetAmount)
        network = Network("eip155:1")
        asset_amount = server.parse_price(price, network)

        base_requirements = PaymentRequirements(
            pay_to="0xrecipient",
            amount=asset_amount.amount,
            asset=asset_amount.asset,
            network="eip155:1",
            scheme="exact",
            max_timeout_seconds=300
        )

        supported_kind = SupportedKind(
            x402_version=2,
            scheme="exact",
            network="eip155:1"
        )

        enhanced_requirements = server.enhance_payment_requirements(
            base_requirements, supported_kind, []
        )

        # 2. Client creates payment payload
        inner_payload = client.create_payment_payload(enhanced_requirements)

        payment_payload = PaymentPayload(
            x402_version=2,
            payload=inner_payload,
            accepted=enhanced_requirements
        )

        # 3. Facilitator verifies and settles
        verify_result = facilitator.verify(payment_payload, enhanced_requirements)
        assert verify_result.is_valid is True

        settle_result = facilitator.settle(payment_payload, enhanced_requirements)
        assert settle_result.success is True

        # Check flow consistency
        assert enhanced_requirements.extra is not None
        assert "name" in enhanced_requirements.extra
        assert inner_payload["authorization"]["to"] == enhanced_requirements.pay_to

    def test_extension_context_flow(self):
        """Test extension registration and usage in facilitator."""
        # Create custom extension
        custom_ext = FacilitatorExtension(key="custom_feature")
        context = FacilitatorContext({"custom_feature": custom_ext})

        facilitator = MockSchemeNetworkFacilitator()

        payload = PaymentPayload(
            x402_version=2,
            payload={"mock": "data"},
            accepted=PaymentRequirements(
                pay_to="0xrecipient",
                amount="1000000",
                asset="0xUSDC",
                network="eip155:1",
                scheme="exact",
                max_timeout_seconds=300
            )
        )

        requirements = payload.accepted

        # Facilitator should be able to access the extension
        verify_result = facilitator.verify(payload, requirements, context)
        assert verify_result.is_valid is True

        # Context should still provide access to extension
        retrieved_ext = context.get_extension("custom_feature")
        assert retrieved_ext == custom_ext
