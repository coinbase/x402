"""x402Facilitator - Payment verification and settlement component.

Runs as a service, manages scheme mechanisms, handles V1/V2 routing.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Generic, TypeVar

from typing_extensions import Self

from .interfaces import SchemeNetworkFacilitator, SchemeNetworkFacilitatorV1
from .schemas import (
    AbortResult,
    Network,
    PaymentAbortedError,
    PaymentPayload,
    PaymentPayloadV1,
    PaymentRequirements,
    PaymentRequirementsV1,
    RecoveredSettleResult,
    RecoveredVerifyResult,
    SchemeNotFoundError,
    SettleContext,
    SettleFailureContext,
    SettleResponse,
    SettleResultContext,
    SupportedKind,
    SupportedResponse,
    VerifyContext,
    VerifyFailureContext,
    VerifyResponse,
    VerifyResultContext,
    derive_network_pattern,
    matches_network_pattern,
)

# ============================================================================
# Type Aliases
# ============================================================================

T = TypeVar("T")

BeforeVerifyHook = Callable[[VerifyContext], None | AbortResult]
AfterVerifyHook = Callable[[VerifyResultContext], None]
OnVerifyFailureHook = Callable[[VerifyFailureContext], None | RecoveredVerifyResult]

BeforeSettleHook = Callable[[SettleContext], None | AbortResult]
AfterSettleHook = Callable[[SettleResultContext], None]
OnSettleFailureHook = Callable[[SettleFailureContext], None | RecoveredSettleResult]


# ============================================================================
# Internal Types
# ============================================================================


@dataclass
class _SchemeData(Generic[T]):
    """Internal storage for registered schemes."""

    facilitator: T
    networks: set[Network]
    pattern: Network  # Wildcard like "eip155:*"


# ============================================================================
# x402Facilitator
# ============================================================================


class x402Facilitator:
    """Payment verification and settlement component.

    Manages scheme mechanisms and handles V1/V2 protocol routing.
    Typically runs as a service with HTTP endpoints for verify/settle/supported.

    Example:
        ```python
        from x402 import x402Facilitator
        from x402.mechanisms.evm.exact import ExactEvmFacilitatorScheme

        facilitator = x402Facilitator()
        facilitator.register(
            ["eip155:8453", "eip155:84532"],
            ExactEvmFacilitatorScheme(wallet=facilitator_wallet),
        )
        facilitator.register_extension("bazaar")

        # Verify payment
        result = facilitator.verify(payload, requirements)

        # Get supported kinds for /supported endpoint
        supported = facilitator.get_supported()
        ```
    """

    def __init__(self) -> None:
        """Initialize x402Facilitator."""
        self._schemes: list[_SchemeData[SchemeNetworkFacilitator]] = []
        self._schemes_v1: list[_SchemeData[SchemeNetworkFacilitatorV1]] = []
        self._extensions: list[str] = []

        # Hooks
        self._before_verify_hooks: list[BeforeVerifyHook] = []
        self._after_verify_hooks: list[AfterVerifyHook] = []
        self._on_verify_failure_hooks: list[OnVerifyFailureHook] = []

        self._before_settle_hooks: list[BeforeSettleHook] = []
        self._after_settle_hooks: list[AfterSettleHook] = []
        self._on_settle_failure_hooks: list[OnSettleFailureHook] = []

    # ========================================================================
    # Registration
    # ========================================================================

    def register(
        self,
        networks: list[Network],
        facilitator: SchemeNetworkFacilitator,
    ) -> Self:
        """Register a V2 facilitator for one or more networks.

        Args:
            networks: List of networks to register for.
            facilitator: Scheme facilitator implementation.

        Returns:
            Self for chaining.
        """
        pattern = derive_network_pattern(networks)
        self._schemes.append(
            _SchemeData(
                facilitator=facilitator,
                networks=set(networks),
                pattern=pattern,
            )
        )
        return self

    def register_v1(
        self,
        networks: list[Network],
        facilitator: SchemeNetworkFacilitatorV1,
    ) -> Self:
        """Register a V1 facilitator for one or more networks.

        Args:
            networks: List of networks to register for.
            facilitator: V1 scheme facilitator implementation.

        Returns:
            Self for chaining.
        """
        pattern = derive_network_pattern(networks)
        self._schemes_v1.append(
            _SchemeData(
                facilitator=facilitator,
                networks=set(networks),
                pattern=pattern,
            )
        )
        return self

    def register_extension(self, extension: str) -> Self:
        """Register an extension name.

        Args:
            extension: Extension key (e.g., "bazaar").

        Returns:
            Self for chaining.
        """
        if extension not in self._extensions:
            self._extensions.append(extension)
        return self

    # ========================================================================
    # Hook Registration
    # ========================================================================

    def on_before_verify(self, hook: BeforeVerifyHook) -> Self:
        """Register hook to run before verification.

        Args:
            hook: Hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_verify_hooks.append(hook)
        return self

    def on_after_verify(self, hook: AfterVerifyHook) -> Self:
        """Register hook to run after successful verification.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._after_verify_hooks.append(hook)
        return self

    def on_verify_failure(self, hook: OnVerifyFailureHook) -> Self:
        """Register hook to run on verification failure.

        Args:
            hook: Hook function. Can return RecoveredVerifyResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_verify_failure_hooks.append(hook)
        return self

    def on_before_settle(self, hook: BeforeSettleHook) -> Self:
        """Register hook to run before settlement.

        Args:
            hook: Hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_settle_hooks.append(hook)
        return self

    def on_after_settle(self, hook: AfterSettleHook) -> Self:
        """Register hook to run after successful settlement.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._after_settle_hooks.append(hook)
        return self

    def on_settle_failure(self, hook: OnSettleFailureHook) -> Self:
        """Register hook to run on settlement failure.

        Args:
            hook: Hook function. Can return RecoveredSettleResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_settle_failure_hooks.append(hook)
        return self

    # ========================================================================
    # Verify
    # ========================================================================

    def verify(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
        payload_bytes: bytes | None = None,
        requirements_bytes: bytes | None = None,
    ) -> VerifyResponse:
        """Verify a payment.

        Routes to V1 or V2 verification based on payload version.

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.
            payload_bytes: Raw payload bytes (escape hatch for extensions).
            requirements_bytes: Raw requirements bytes (escape hatch).

        Returns:
            VerifyResponse with is_valid=True or is_valid=False.

        Raises:
            SchemeNotFoundError: If no facilitator registered for scheme/network.
            PaymentAbortedError: If a before hook aborts.
        """
        # Build context
        context = VerifyContext(
            payment_payload=payload,
            requirements=requirements,
            payload_bytes=payload_bytes,
            requirements_bytes=requirements_bytes,
        )

        # Execute before hooks
        for hook in self._before_verify_hooks:
            result = hook(context)
            if isinstance(result, AbortResult):
                raise PaymentAbortedError(result.reason)

        try:
            # Route by version
            if payload.x402_version == 1:
                verify_result = self._verify_v1(
                    payload,  # type: ignore[arg-type]
                    requirements,  # type: ignore[arg-type]
                )
            else:
                verify_result = self._verify_v2(
                    payload,  # type: ignore[arg-type]
                    requirements,  # type: ignore[arg-type]
                )

            # Check if verification failed
            if not verify_result.is_valid:
                failure_context = VerifyFailureContext(
                    payment_payload=payload,
                    requirements=requirements,
                    payload_bytes=payload_bytes,
                    requirements_bytes=requirements_bytes,
                    error=Exception(verify_result.invalid_reason or "Verification failed"),
                )
                for hook in self._on_verify_failure_hooks:
                    result = hook(failure_context)
                    if isinstance(result, RecoveredVerifyResult):
                        # Execute after hooks with recovered result
                        result_context = VerifyResultContext(
                            payment_payload=payload,
                            requirements=requirements,
                            payload_bytes=payload_bytes,
                            requirements_bytes=requirements_bytes,
                            result=result.result,
                        )
                        for after_hook in self._after_verify_hooks:
                            after_hook(result_context)
                        return result.result

                return verify_result

            # Execute after hooks for success
            result_context = VerifyResultContext(
                payment_payload=payload,
                requirements=requirements,
                payload_bytes=payload_bytes,
                requirements_bytes=requirements_bytes,
                result=verify_result,
            )
            for hook in self._after_verify_hooks:
                hook(result_context)

            return verify_result

        except Exception as e:
            # Execute failure hooks
            failure_context = VerifyFailureContext(
                payment_payload=payload,
                requirements=requirements,
                payload_bytes=payload_bytes,
                requirements_bytes=requirements_bytes,
                error=e,
            )
            for hook in self._on_verify_failure_hooks:
                result = hook(failure_context)
                if isinstance(result, RecoveredVerifyResult):
                    return result.result

            raise

    def _verify_v2(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify V2 payment."""
        scheme = payload.get_scheme()
        network = payload.get_network()

        facilitator = self._find_facilitator(scheme, network)
        if facilitator is None:
            raise SchemeNotFoundError(scheme, network)

        return facilitator.verify(payload, requirements)

    def _verify_v1(
        self,
        payload: PaymentPayloadV1,
        requirements: PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify V1 payment."""
        scheme = payload.get_scheme()
        network = payload.get_network()

        facilitator = self._find_facilitator_v1(scheme, network)
        if facilitator is None:
            raise SchemeNotFoundError(scheme, network)

        return facilitator.verify(payload, requirements)

    # ========================================================================
    # Settle
    # ========================================================================

    def settle(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
        payload_bytes: bytes | None = None,
        requirements_bytes: bytes | None = None,
    ) -> SettleResponse:
        """Settle a payment.

        Routes to V1 or V2 settlement based on payload version.

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.
            payload_bytes: Raw payload bytes (escape hatch for extensions).
            requirements_bytes: Raw requirements bytes (escape hatch).

        Returns:
            SettleResponse with success=True or success=False.

        Raises:
            SchemeNotFoundError: If no facilitator registered for scheme/network.
            PaymentAbortedError: If a before hook aborts.
        """
        # Build context
        context = SettleContext(
            payment_payload=payload,
            requirements=requirements,
            payload_bytes=payload_bytes,
            requirements_bytes=requirements_bytes,
        )

        # Execute before hooks
        for hook in self._before_settle_hooks:
            result = hook(context)
            if isinstance(result, AbortResult):
                raise PaymentAbortedError(result.reason)

        try:
            # Route by version
            if payload.x402_version == 1:
                settle_result = self._settle_v1(
                    payload,  # type: ignore[arg-type]
                    requirements,  # type: ignore[arg-type]
                )
            else:
                settle_result = self._settle_v2(
                    payload,  # type: ignore[arg-type]
                    requirements,  # type: ignore[arg-type]
                )

            # Check if settlement failed
            if not settle_result.success:
                failure_context = SettleFailureContext(
                    payment_payload=payload,
                    requirements=requirements,
                    payload_bytes=payload_bytes,
                    requirements_bytes=requirements_bytes,
                    error=Exception(settle_result.error_reason or "Settlement failed"),
                )
                for hook in self._on_settle_failure_hooks:
                    result = hook(failure_context)
                    if isinstance(result, RecoveredSettleResult):
                        # Execute after hooks with recovered result
                        result_context = SettleResultContext(
                            payment_payload=payload,
                            requirements=requirements,
                            payload_bytes=payload_bytes,
                            requirements_bytes=requirements_bytes,
                            result=result.result,
                        )
                        for after_hook in self._after_settle_hooks:
                            after_hook(result_context)
                        return result.result

                return settle_result

            # Execute after hooks for success
            result_context = SettleResultContext(
                payment_payload=payload,
                requirements=requirements,
                payload_bytes=payload_bytes,
                requirements_bytes=requirements_bytes,
                result=settle_result,
            )
            for hook in self._after_settle_hooks:
                hook(result_context)

            return settle_result

        except Exception as e:
            # Execute failure hooks
            failure_context = SettleFailureContext(
                payment_payload=payload,
                requirements=requirements,
                payload_bytes=payload_bytes,
                requirements_bytes=requirements_bytes,
                error=e,
            )
            for hook in self._on_settle_failure_hooks:
                result = hook(failure_context)
                if isinstance(result, RecoveredSettleResult):
                    return result.result

            raise

    def _settle_v2(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle V2 payment."""
        scheme = payload.get_scheme()
        network = payload.get_network()

        facilitator = self._find_facilitator(scheme, network)
        if facilitator is None:
            raise SchemeNotFoundError(scheme, network)

        return facilitator.settle(payload, requirements)

    def _settle_v1(
        self,
        payload: PaymentPayloadV1,
        requirements: PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle V1 payment."""
        scheme = payload.get_scheme()
        network = payload.get_network()

        facilitator = self._find_facilitator_v1(scheme, network)
        if facilitator is None:
            raise SchemeNotFoundError(scheme, network)

        return facilitator.settle(payload, requirements)

    # ========================================================================
    # Supported
    # ========================================================================

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds and extensions.

        Returns:
            SupportedResponse with kinds, extensions, and signers.
        """
        kinds: list[SupportedKind] = []
        signers: dict[str, list[str]] = {}

        # V2 schemes
        for scheme_data in self._schemes:
            facilitator = scheme_data.facilitator

            for network in scheme_data.networks:
                kinds.append(
                    SupportedKind(
                        x402_version=2,
                        scheme=facilitator.scheme,
                        network=network,
                        extra=facilitator.get_extra(network),
                    )
                )

                # Collect signers by CAIP family
                caip_family = facilitator.caip_family
                network_signers = facilitator.get_signers(network)
                if caip_family not in signers:
                    signers[caip_family] = []
                for signer in network_signers:
                    if signer not in signers[caip_family]:
                        signers[caip_family].append(signer)

        # V1 schemes
        for scheme_data in self._schemes_v1:
            facilitator = scheme_data.facilitator

            for network in scheme_data.networks:
                kinds.append(
                    SupportedKind(
                        x402_version=1,
                        scheme=facilitator.scheme,
                        network=network,
                        extra=facilitator.get_extra(network),
                    )
                )

                # Collect signers
                caip_family = facilitator.caip_family
                network_signers = facilitator.get_signers(network)
                if caip_family not in signers:
                    signers[caip_family] = []
                for signer in network_signers:
                    if signer not in signers[caip_family]:
                        signers[caip_family].append(signer)

        return SupportedResponse(
            kinds=kinds,
            extensions=self._extensions,
            signers=signers,
        )

    def get_extensions(self) -> list[str]:
        """Get registered extension names.

        Returns:
            List of extension keys.
        """
        return list(self._extensions)

    # ========================================================================
    # Internal Helpers
    # ========================================================================

    def _find_facilitator(
        self,
        scheme: str,
        network: Network,
    ) -> SchemeNetworkFacilitator | None:
        """Find V2 facilitator for scheme/network."""
        for scheme_data in self._schemes:
            if scheme_data.facilitator.scheme != scheme:
                continue

            # Check if network matches
            if network in scheme_data.networks:
                return scheme_data.facilitator

            # Check wildcard pattern
            if matches_network_pattern(network, scheme_data.pattern):
                return scheme_data.facilitator

        return None

    def _find_facilitator_v1(
        self,
        scheme: str,
        network: Network,
    ) -> SchemeNetworkFacilitatorV1 | None:
        """Find V1 facilitator for scheme/network."""
        for scheme_data in self._schemes_v1:
            if scheme_data.facilitator.scheme != scheme:
                continue

            # Check if network matches
            if network in scheme_data.networks:
                return scheme_data.facilitator

            # Check wildcard pattern
            if matches_network_pattern(network, scheme_data.pattern):
                return scheme_data.facilitator

        return None
