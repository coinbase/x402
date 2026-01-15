"""x402Facilitator - Payment verification and settlement component.

Provides both async (x402Facilitator) and sync (x402FacilitatorSync)
implementations. Runs as a service, manages scheme mechanisms, handles V1/V2 routing.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

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
# Type Aliases - Support both sync and async hooks
# ============================================================================

T = TypeVar("T")

BeforeVerifyHook = Callable[[VerifyContext], Awaitable[AbortResult | None] | AbortResult | None]
AfterVerifyHook = Callable[[VerifyResultContext], Awaitable[None] | None]
OnVerifyFailureHook = Callable[
    [VerifyFailureContext],
    Awaitable[RecoveredVerifyResult | None] | RecoveredVerifyResult | None,
]

BeforeSettleHook = Callable[[SettleContext], Awaitable[AbortResult | None] | AbortResult | None]
AfterSettleHook = Callable[[SettleResultContext], Awaitable[None] | None]
OnSettleFailureHook = Callable[
    [SettleFailureContext],
    Awaitable[RecoveredSettleResult | None] | RecoveredSettleResult | None,
]

# Sync-only hook types (for sync class)
SyncBeforeVerifyHook = Callable[[VerifyContext], AbortResult | None]
SyncAfterVerifyHook = Callable[[VerifyResultContext], None]
SyncOnVerifyFailureHook = Callable[[VerifyFailureContext], RecoveredVerifyResult | None]

SyncBeforeSettleHook = Callable[[SettleContext], AbortResult | None]
SyncAfterSettleHook = Callable[[SettleResultContext], None]
SyncOnSettleFailureHook = Callable[[SettleFailureContext], RecoveredSettleResult | None]


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
# Base Facilitator Class (Shared Logic)
# ============================================================================


class _x402FacilitatorBase:
    """Base class with shared logic for x402 facilitators.

    Contains registration, routing, and get_supported logic.
    Subclasses implement sync/async verify/settle methods.
    """

    def __init__(self) -> None:
        """Initialize base facilitator."""
        self._schemes: list[_SchemeData[SchemeNetworkFacilitator]] = []
        self._schemes_v1: list[_SchemeData[SchemeNetworkFacilitatorV1]] = []
        self._extensions: list[str] = []

        # Hooks (typed in subclasses)
        self._before_verify_hooks: list[Any] = []
        self._after_verify_hooks: list[Any] = []
        self._on_verify_failure_hooks: list[Any] = []

        self._before_settle_hooks: list[Any] = []
        self._after_settle_hooks: list[Any] = []
        self._on_settle_failure_hooks: list[Any] = []

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


# ============================================================================
# Async Facilitator (Default)
# ============================================================================


class x402Facilitator(_x402FacilitatorBase):
    """Async payment verification and settlement component.

    Supports both sync and async hooks (auto-detected).
    Use x402FacilitatorSync for sync-only environments.

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
        result = await facilitator.verify(payload, requirements)

        # Get supported kinds for /supported endpoint
        supported = facilitator.get_supported()
        ```
    """

    def __init__(self) -> None:
        """Initialize async x402Facilitator."""
        super().__init__()
        # Type the hook lists properly
        self._before_verify_hooks: list[BeforeVerifyHook] = []
        self._after_verify_hooks: list[AfterVerifyHook] = []
        self._on_verify_failure_hooks: list[OnVerifyFailureHook] = []

        self._before_settle_hooks: list[BeforeSettleHook] = []
        self._after_settle_hooks: list[AfterSettleHook] = []
        self._on_settle_failure_hooks: list[OnSettleFailureHook] = []

    # ========================================================================
    # Hook Registration
    # ========================================================================

    def on_before_verify(self, hook: BeforeVerifyHook) -> Self:
        """Register hook to run before verification.

        Supports both sync and async hooks.

        Args:
            hook: Hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_verify_hooks.append(hook)
        return self

    def on_after_verify(self, hook: AfterVerifyHook) -> Self:
        """Register hook to run after successful verification.

        Supports both sync and async hooks.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._after_verify_hooks.append(hook)
        return self

    def on_verify_failure(self, hook: OnVerifyFailureHook) -> Self:
        """Register hook to run on verification failure.

        Supports both sync and async hooks.

        Args:
            hook: Hook function. Can return RecoveredVerifyResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_verify_failure_hooks.append(hook)
        return self

    def on_before_settle(self, hook: BeforeSettleHook) -> Self:
        """Register hook to run before settlement.

        Supports both sync and async hooks.

        Args:
            hook: Hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_settle_hooks.append(hook)
        return self

    def on_after_settle(self, hook: AfterSettleHook) -> Self:
        """Register hook to run after successful settlement.

        Supports both sync and async hooks.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._after_settle_hooks.append(hook)
        return self

    def on_settle_failure(self, hook: OnSettleFailureHook) -> Self:
        """Register hook to run on settlement failure.

        Supports both sync and async hooks.

        Args:
            hook: Hook function. Can return RecoveredSettleResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_settle_failure_hooks.append(hook)
        return self

    # ========================================================================
    # Verify (Async)
    # ========================================================================

    async def verify(
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
            result = await self._execute_hook(hook, context)
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
                    result = await self._execute_hook(hook, failure_context)
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
                            await self._execute_hook(after_hook, result_context)
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
                await self._execute_hook(hook, result_context)

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
                result = await self._execute_hook(hook, failure_context)
                if isinstance(result, RecoveredVerifyResult):
                    return result.result

            raise

    # ========================================================================
    # Settle (Async)
    # ========================================================================

    async def settle(
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
            result = await self._execute_hook(hook, context)
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
                    result = await self._execute_hook(hook, failure_context)
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
                            await self._execute_hook(after_hook, result_context)
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
                await self._execute_hook(hook, result_context)

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
                result = await self._execute_hook(hook, failure_context)
                if isinstance(result, RecoveredSettleResult):
                    return result.result

            raise

    async def _execute_hook(self, hook: Any, context: Any) -> Any:
        """Execute hook, auto-detecting sync/async."""
        result = hook(context)
        if asyncio.iscoroutine(result) or asyncio.isfuture(result):
            return await result
        return result


# ============================================================================
# Sync Facilitator
# ============================================================================


class x402FacilitatorSync(_x402FacilitatorBase):
    """Sync payment verification and settlement component.

    Only supports sync hooks. For async hook support, use x402Facilitator.

    Example:
        ```python
        from x402 import x402FacilitatorSync
        from x402.mechanisms.evm.exact import ExactEvmFacilitatorScheme

        facilitator = x402FacilitatorSync()
        facilitator.register(
            ["eip155:8453", "eip155:84532"],
            ExactEvmFacilitatorScheme(wallet=facilitator_wallet),
        )

        # Verify payment
        result = facilitator.verify(payload, requirements)
        ```
    """

    def __init__(self) -> None:
        """Initialize sync x402Facilitator."""
        super().__init__()
        # Type the hook lists for sync-only
        self._before_verify_hooks: list[SyncBeforeVerifyHook] = []
        self._after_verify_hooks: list[SyncAfterVerifyHook] = []
        self._on_verify_failure_hooks: list[SyncOnVerifyFailureHook] = []

        self._before_settle_hooks: list[SyncBeforeSettleHook] = []
        self._after_settle_hooks: list[SyncAfterSettleHook] = []
        self._on_settle_failure_hooks: list[SyncOnSettleFailureHook] = []

    # ========================================================================
    # Hook Registration
    # ========================================================================

    def on_before_verify(self, hook: SyncBeforeVerifyHook) -> Self:
        """Register hook to run before verification.

        Note: Only sync hooks are supported. Use x402Facilitator for async hooks.

        Args:
            hook: Sync hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_verify_hooks.append(hook)
        return self

    def on_after_verify(self, hook: SyncAfterVerifyHook) -> Self:
        """Register hook to run after successful verification.

        Note: Only sync hooks are supported. Use x402Facilitator for async hooks.

        Args:
            hook: Sync hook function.

        Returns:
            Self for chaining.
        """
        self._after_verify_hooks.append(hook)
        return self

    def on_verify_failure(self, hook: SyncOnVerifyFailureHook) -> Self:
        """Register hook to run on verification failure.

        Note: Only sync hooks are supported. Use x402Facilitator for async hooks.

        Args:
            hook: Sync hook function. Can return RecoveredVerifyResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_verify_failure_hooks.append(hook)
        return self

    def on_before_settle(self, hook: SyncBeforeSettleHook) -> Self:
        """Register hook to run before settlement.

        Note: Only sync hooks are supported. Use x402Facilitator for async hooks.

        Args:
            hook: Sync hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_settle_hooks.append(hook)
        return self

    def on_after_settle(self, hook: SyncAfterSettleHook) -> Self:
        """Register hook to run after successful settlement.

        Note: Only sync hooks are supported. Use x402Facilitator for async hooks.

        Args:
            hook: Sync hook function.

        Returns:
            Self for chaining.
        """
        self._after_settle_hooks.append(hook)
        return self

    def on_settle_failure(self, hook: SyncOnSettleFailureHook) -> Self:
        """Register hook to run on settlement failure.

        Note: Only sync hooks are supported. Use x402Facilitator for async hooks.

        Args:
            hook: Sync hook function. Can return RecoveredSettleResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_settle_failure_hooks.append(hook)
        return self

    # ========================================================================
    # Verify (Sync)
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
            result = self._execute_hook_sync(hook, context)
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
                    result = self._execute_hook_sync(hook, failure_context)
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
                            self._execute_hook_sync(after_hook, result_context)
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
                self._execute_hook_sync(hook, result_context)

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
                result = self._execute_hook_sync(hook, failure_context)
                if isinstance(result, RecoveredVerifyResult):
                    return result.result

            raise

    # ========================================================================
    # Settle (Sync)
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
            result = self._execute_hook_sync(hook, context)
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
                    result = self._execute_hook_sync(hook, failure_context)
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
                            self._execute_hook_sync(after_hook, result_context)
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
                self._execute_hook_sync(hook, result_context)

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
                result = self._execute_hook_sync(hook, failure_context)
                if isinstance(result, RecoveredSettleResult):
                    return result.result

            raise

    def _execute_hook_sync(self, hook: Any, context: Any) -> Any:
        """Execute hook synchronously. Raises if async hook detected."""
        result = hook(context)
        if asyncio.iscoroutine(result):
            result.close()  # Prevent warning
            raise TypeError(
                "Async hooks are not supported in x402FacilitatorSync. "
                "Use x402Facilitator for async hook support."
            )
        return result
