"""Scheme protocol definitions for the x402 Python SDK.

This module defines the Protocol interfaces that payment schemes must implement
to integrate with x402Client, x402ResourceServer, and x402Facilitator.

Note: All protocols are sync-first (matching legacy SDK pattern).
"""

from typing import Any, Protocol

from .schemas import (
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


# ============================================================================
# Client-Side Protocols
# ============================================================================


class SchemeNetworkClient(Protocol):
    """V2 client-side payment mechanism.

    Implementations create signed payment payloads for specific schemes.
    Returns inner payload dict, which x402Client wraps into full PaymentPayload.

    Example:
        ```python
        class ExactEvmScheme:
            scheme = "exact"

            def __init__(self, signer: ClientEvmSigner):
                self._signer = signer

            def create_payment_payload(
                self, requirements: PaymentRequirements
            ) -> dict[str, Any]:
                # Create EIP-3009 authorization and sign it
                return {"authorization": {...}, "signature": "0x..."}
        ```
    """

    @property
    def scheme(self) -> str:
        """Payment scheme identifier (e.g., 'exact')."""
        ...

    def create_payment_payload(
        self,
        requirements: PaymentRequirements,
    ) -> dict[str, Any]:
        """Create the scheme-specific inner payload dict.

        Args:
            requirements: The payment requirements to fulfill.

        Returns:
            Scheme-specific payload dict. x402Client wraps this into
            a full PaymentPayload with x402_version, accepted, etc.
        """
        ...


class SchemeNetworkClientV1(Protocol):
    """V1 (legacy) client-side payment mechanism.

    Same as SchemeNetworkClient but for V1 protocol format.
    """

    @property
    def scheme(self) -> str:
        """Payment scheme identifier."""
        ...

    def create_payment_payload(
        self,
        requirements: PaymentRequirementsV1,
    ) -> dict[str, Any]:
        """Create the scheme-specific inner payload dict for V1.

        Args:
            requirements: The V1 payment requirements to fulfill.

        Returns:
            Scheme-specific payload dict. x402Client wraps this into
            a full PaymentPayloadV1.
        """
        ...


# ============================================================================
# Server-Side Protocols
# ============================================================================


class SchemeNetworkServer(Protocol):
    """V2 server-side payment mechanism.

    Implementations handle price parsing and requirement enhancement for specific schemes.
    Does NOT verify/settle - that's delegated to FacilitatorClient.

    Note: parse_price handles USD→atomic conversion for the scheme.
    This logic lives in the scheme implementation (e.g., EVM), not standalone.

    Example:
        ```python
        class ExactEvmScheme:
            scheme = "exact"

            def parse_price(self, price: Price, network: Network) -> AssetAmount:
                # Convert "$1.50" to {"amount": "1500000", "asset": "0x..."}
                ...

            def enhance_payment_requirements(
                self,
                requirements: PaymentRequirements,
                supported_kind: SupportedKind,
                extensions: list[str],
            ) -> PaymentRequirements:
                # Add EIP-712 domain params to extra
                ...
        ```
    """

    @property
    def scheme(self) -> str:
        """Payment scheme identifier."""
        ...

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        """Convert Money or AssetAmount to normalized AssetAmount.

        USD→atomic conversion logic lives here, not as a standalone utility.

        Args:
            price: Price as Money ("$1.50", 1.50) or AssetAmount.
            network: Target network.

        Returns:
            Normalized AssetAmount with amount in smallest unit.
        """
        ...

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        extensions: list[str],
    ) -> PaymentRequirements:
        """Add scheme-specific fields to payment requirements.

        For EVM, this adds EIP-712 domain parameters (name, version).

        Args:
            requirements: Base payment requirements.
            supported_kind: The supported kind from facilitator.
            extensions: List of enabled extension keys.

        Returns:
            Enhanced payment requirements.
        """
        ...


# ============================================================================
# Facilitator-Side Protocols
# ============================================================================


class SchemeNetworkFacilitator(Protocol):
    """V2 facilitator-side payment mechanism.

    Implementations verify and settle payments for specific schemes.

    Note: Returns VerifyResponse/SettleResponse objects with
    is_valid=False/success=False on failure, not exceptions.

    Example:
        ```python
        class ExactEvmScheme:
            scheme = "exact"
            caip_family = "eip155:*"

            def verify(
                self, payload: PaymentPayload, requirements: PaymentRequirements
            ) -> VerifyResponse:
                # Verify EIP-3009 signature
                ...

            def settle(
                self, payload: PaymentPayload, requirements: PaymentRequirements
            ) -> SettleResponse:
                # Execute transferWithAuthorization
                ...
        ```
    """

    @property
    def scheme(self) -> str:
        """Payment scheme identifier."""
        ...

    @property
    def caip_family(self) -> str:
        """CAIP family pattern (e.g., 'eip155:*' for EVM, 'solana:*' for SVM)."""
        ...

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        """Get extra data for SupportedKind.

        Args:
            network: Target network.

        Returns:
            Extra data (e.g., {"feePayer": addr} for SVM), or None.
        """
        ...

    def get_signers(self, network: Network) -> list[str]:
        """Get signer addresses for this network.

        Args:
            network: Target network.

        Returns:
            List of signer addresses.
        """
        ...

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify a payment.

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.

        Returns:
            VerifyResponse with is_valid=True on success,
            or is_valid=False with invalid_reason on failure.
        """
        ...

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle a payment.

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.

        Returns:
            SettleResponse with success=True and transaction on success,
            or success=False with error_reason on failure.
        """
        ...


class SchemeNetworkFacilitatorV1(Protocol):
    """V1 (legacy) facilitator-side payment mechanism.

    Same shape as SchemeNetworkFacilitator but with V1 types.
    """

    @property
    def scheme(self) -> str:
        """Payment scheme identifier."""
        ...

    @property
    def caip_family(self) -> str:
        """CAIP family pattern."""
        ...

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        """Get extra data for SupportedKind."""
        ...

    def get_signers(self, network: Network) -> list[str]:
        """Get signer addresses."""
        ...

    def verify(
        self,
        payload: "PaymentPayloadV1",
        requirements: PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify a V1 payment."""
        ...

    def settle(
        self,
        payload: "PaymentPayloadV1",
        requirements: PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle a V1 payment."""
        ...


# Import for type hints
from .schemas.v1 import PaymentPayloadV1  # noqa: E402
