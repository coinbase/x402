"""x402ResourceServer - Server-side component for protecting resources.

Provides both async (x402ResourceServer) and sync (x402ResourceServerSync)
implementations for building payment requirements, verifying payments,
and settling transactions via facilitator clients.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any, Protocol

from typing_extensions import Self

from .interfaces import SchemeNetworkServer
from .schemas import (
    AbortResult,
    Network,
    PaymentAbortedError,
    PaymentPayload,
    PaymentPayloadV1,
    PaymentRequired,
    PaymentRequirements,
    PaymentRequirementsV1,
    RecoveredSettleResult,
    RecoveredVerifyResult,
    ResourceConfig,
    ResourceInfo,
    ResourceServerExtension,
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
    find_schemes_by_network,
)

if TYPE_CHECKING:
    pass

# ============================================================================
# FacilitatorClient Protocols (Async and Sync)
# ============================================================================


class FacilitatorClient(Protocol):
    """Protocol for async facilitator clients.

    Used by x402ResourceServer (async) to verify/settle payments.
    Implemented by HTTPFacilitatorClient for remote facilitators.
    """

    async def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify a payment (async).

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.

        Returns:
            VerifyResponse with is_valid=True or is_valid=False.
        """
        ...

    async def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle a payment (async).

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.

        Returns:
            SettleResponse with success=True or success=False.
        """
        ...

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds.

        Note: Sync because it's called during initialization.

        Returns:
            SupportedResponse with kinds, extensions, and signers.
        """
        ...


class FacilitatorClientSync(Protocol):
    """Protocol for sync facilitator clients.

    Used by x402ResourceServerSync (sync) to verify/settle payments.
    Implemented by HTTPFacilitatorClientSync for remote facilitators.
    """

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
            VerifyResponse with is_valid=True or is_valid=False.
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
            SettleResponse with success=True or success=False.
        """
        ...

    def get_supported(self) -> SupportedResponse:
        """Get supported payment kinds.

        Returns:
            SupportedResponse with kinds, extensions, and signers.
        """
        ...


# ============================================================================
# Type Aliases - Support both sync and async hooks
# ============================================================================

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
# Base Server Class (Shared Logic)
# ============================================================================


# Type alias for facilitator clients (either async or sync)
_AnyFacilitatorClient = FacilitatorClient | FacilitatorClientSync


class _x402ResourceServerBase:
    """Base class with shared logic for x402 resource servers.

    Contains registration, initialization, and requirement building.
    Subclasses implement sync/async verify/settle methods.
    """

    def __init__(
        self,
        facilitator_clients: _AnyFacilitatorClient | list[_AnyFacilitatorClient] | None = None,
    ) -> None:
        """Initialize base server.

        Args:
            facilitator_clients: Facilitator client(s) for verify/settle.
                Can be single client, list, or None.
        """
        # Normalize to list
        if facilitator_clients is None:
            self._facilitator_clients: list[_AnyFacilitatorClient] = []
        elif isinstance(facilitator_clients, list):
            self._facilitator_clients = facilitator_clients
        else:
            self._facilitator_clients = [facilitator_clients]

        # Scheme servers
        self._schemes: dict[Network, dict[str, SchemeNetworkServer]] = {}

        # Facilitator client map: network -> scheme -> client
        self._facilitator_clients_map: dict[Network, dict[str, _AnyFacilitatorClient]] = {}

        # Supported responses from facilitators
        self._supported_responses: dict[Network, dict[str, SupportedResponse]] = {}

        # Extensions
        self._extensions: dict[str, ResourceServerExtension] = {}

        # Hooks (typed in subclasses)
        self._before_verify_hooks: list[Any] = []
        self._after_verify_hooks: list[Any] = []
        self._on_verify_failure_hooks: list[Any] = []

        self._before_settle_hooks: list[Any] = []
        self._after_settle_hooks: list[Any] = []
        self._on_settle_failure_hooks: list[Any] = []

        self._initialized = False

    # ========================================================================
    # Registration
    # ========================================================================

    def register(self, network: Network, server: SchemeNetworkServer) -> Self:
        """Register a V2 scheme server for a network.

        Args:
            network: Network to register for (e.g., "eip155:8453").
            server: Scheme server implementation.

        Returns:
            Self for chaining.
        """
        if network not in self._schemes:
            self._schemes[network] = {}
        self._schemes[network][server.scheme] = server
        return self

    def register_extension(self, extension: ResourceServerExtension) -> Self:
        """Register a resource server extension.

        Args:
            extension: Extension implementation.

        Returns:
            Self for chaining.
        """
        self._extensions[extension.key] = extension
        return self

    def has_registered_scheme(self, network: Network, scheme: str) -> bool:
        """Check if a scheme is registered for a network.

        Args:
            network: Network to check (e.g., "eip155:84532").
            scheme: Scheme name to check (e.g., "exact").

        Returns:
            True if the scheme is registered for the network or its wildcard.
        """
        # Check exact network match
        if network in self._schemes:
            if scheme in self._schemes[network]:
                return True

        # Check wildcard (e.g., eip155:* for eip155:84532)
        prefix = network.split(":")[0]
        wildcard = f"{prefix}:*"
        if wildcard in self._schemes:
            if scheme in self._schemes[wildcard]:
                return True

        return False

    def get_supported_kind(
        self, version: int, network: Network, scheme: str
    ) -> SupportedKind | None:
        """Get SupportedKind from facilitator for a network/scheme.

        Args:
            version: x402 version (1 or 2).
            network: Network to check (e.g., "eip155:84532").
            scheme: Scheme name to check (e.g., "exact").

        Returns:
            SupportedKind if facilitator supports it, None otherwise.
        """
        # Check exact network match
        if network in self._supported_responses:
            if scheme in self._supported_responses[network]:
                supported = self._supported_responses[network][scheme]
                for kind in supported.kinds:
                    if (
                        kind.x402_version == version
                        and kind.scheme == scheme
                        and kind.network == network
                    ):
                        return kind

        # Check wildcard pattern (e.g., eip155:* for eip155:84532)
        prefix = network.split(":")[0]
        wildcard = f"{prefix}:*"
        if wildcard in self._supported_responses:
            if scheme in self._supported_responses[wildcard]:
                supported = self._supported_responses[wildcard][scheme]
                for kind in supported.kinds:
                    if kind.x402_version == version and kind.scheme == scheme:
                        # Wildcard kind matches any network in the family
                        if kind.network == wildcard or kind.network == network:
                            return kind

        # Check if any facilitator supports this network/scheme via wildcard pattern
        for schemes in self._supported_responses.values():
            if scheme in schemes:
                supported = schemes[scheme]
                for kind in supported.kinds:
                    if kind.x402_version == version and kind.scheme == scheme:
                        # Check if the kind's network is a wildcard that matches
                        if ":" in kind.network and kind.network.endswith(":*"):
                            kind_prefix = kind.network.split(":")[0]
                            if network.startswith(f"{kind_prefix}:"):
                                return kind

        return None

    # ========================================================================
    # Initialization
    # ========================================================================

    def initialize(self) -> None:
        """Initialize server by fetching supported from facilitators.

        Must be called before using build_payment_requirements,
        verify_payment, or settle_payment.

        Earlier facilitators in the list get precedence.
        """
        for client in self._facilitator_clients:
            supported = client.get_supported()

            for kind in supported.kinds:
                network = kind.network
                scheme = kind.scheme

                # Only add if not already registered (earlier takes precedence)
                if network not in self._facilitator_clients_map:
                    self._facilitator_clients_map[network] = {}

                if scheme not in self._facilitator_clients_map[network]:
                    self._facilitator_clients_map[network][scheme] = client

                # Store supported response
                if network not in self._supported_responses:
                    self._supported_responses[network] = {}

                if scheme not in self._supported_responses[network]:
                    self._supported_responses[network][scheme] = supported

        self._initialized = True

    # ========================================================================
    # Build Requirements
    # ========================================================================

    def build_payment_requirements(
        self,
        config: ResourceConfig,
        extensions: list[str] | None = None,
    ) -> list[PaymentRequirements]:
        """Build payment requirements for a protected resource.

        Args:
            config: Resource configuration.
            extensions: List of extension keys to enable.

        Returns:
            List of payment requirements (usually one).

        Raises:
            SchemeNotFoundError: If scheme server not registered.
            RuntimeError: If not initialized.
        """
        if not self._initialized:
            raise RuntimeError("Server not initialized. Call initialize() first.")

        # Find scheme server
        schemes = find_schemes_by_network(self._schemes, config.network)
        if schemes is None or config.scheme not in schemes:
            raise SchemeNotFoundError(config.scheme, config.network)

        server = schemes[config.scheme]

        # Get supported kind
        supported = self._supported_responses.get(config.network, {}).get(config.scheme)
        if supported is None:
            raise SchemeNotFoundError(config.scheme, config.network)

        # Find matching kind
        supported_kind: SupportedKind | None = None
        for kind in supported.kinds:
            if kind.scheme == config.scheme and kind.network == config.network:
                supported_kind = kind
                break

        if supported_kind is None:
            raise SchemeNotFoundError(config.scheme, config.network)

        # Parse price
        asset_amount = server.parse_price(config.price, config.network)

        # Build base requirements
        requirements = PaymentRequirements(
            scheme=config.scheme,
            network=config.network,
            asset=asset_amount.asset,
            amount=asset_amount.amount,
            pay_to=config.pay_to,
            max_timeout_seconds=config.max_timeout_seconds or 300,
            extra=asset_amount.extra or {},
        )

        # Enhance with scheme-specific details
        enhanced = server.enhance_payment_requirements(
            requirements,
            supported_kind,
            extensions or [],
        )

        return [enhanced]

    def create_payment_required_response(
        self,
        requirements: list[PaymentRequirements],
        resource: ResourceInfo | None = None,
        error: str | None = None,
        extensions: dict[str, Any] | None = None,
    ) -> PaymentRequired:
        """Create a 402 Payment Required response.

        Args:
            requirements: List of accepted payment requirements.
            resource: Optional resource information.
            error: Optional error message.
            extensions: Optional extension data.

        Returns:
            PaymentRequired response object.
        """
        return PaymentRequired(
            x402_version=2,
            error=error,
            resource=resource,
            accepts=requirements,
            extensions=extensions,
        )

    # ========================================================================
    # Find Matching Requirements
    # ========================================================================

    def find_matching_requirements(
        self,
        available: list[PaymentRequirements],
        payload: PaymentPayload,
    ) -> PaymentRequirements | None:
        """Find requirements that match a payment payload.

        Args:
            available: List of available requirements.
            payload: Payment payload to match.

        Returns:
            Matching requirements, or None if not found.
        """
        for req in available:
            if (
                payload.accepted.scheme == req.scheme
                and payload.accepted.network == req.network
                and payload.accepted.amount == req.amount
                and payload.accepted.asset == req.asset
                and payload.accepted.pay_to == req.pay_to
            ):
                return req

        return None

    # ========================================================================
    # Extensions
    # ========================================================================

    def enrich_extensions(
        self,
        declared: dict[str, Any],
        transport_context: Any,
    ) -> dict[str, Any]:
        """Enrich extension declarations with transport-specific data.

        Args:
            declared: Declared extension data.
            transport_context: Framework-specific context.

        Returns:
            Enriched extension data.
        """
        result = dict(declared)

        for key, extension in self._extensions.items():
            if key in declared:
                result[key] = extension.enrich_declaration(
                    declared[key],
                    transport_context,
                )

        return result


# ============================================================================
# Async Resource Server (Default)
# ============================================================================


class x402ResourceServer(_x402ResourceServerBase):
    """Async server-side component for protecting resources.

    Supports both sync and async hooks (auto-detected).
    Use x402ResourceServerSync for sync-only environments.

    IMPORTANT: Use with HTTPFacilitatorClient (async) for proper async operation.
    The facilitator client's verify/settle methods will be awaited.

    Example:
        ```python
        from x402 import x402ResourceServer
        from x402.http import HTTPFacilitatorClient, FacilitatorConfig
        from x402.mechanisms.evm.exact import ExactEvmServerScheme

        facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://..."))
        server = x402ResourceServer(facilitator)
        server.register("eip155:8453", ExactEvmServerScheme())

        # Initialize (fetch supported from facilitators)
        server.initialize()

        # Build requirements for a protected resource
        config = ResourceConfig(
            scheme="exact",
            network="eip155:8453",
            pay_to="0x...",
            price="$1.00",
        )
        requirements = server.build_payment_requirements(config)

        # Verify payment (async)
        result = await server.verify_payment(payload, requirements[0])
        ```
    """

    def __init__(
        self,
        facilitator_clients: FacilitatorClient | list[FacilitatorClient] | None = None,
    ) -> None:
        """Initialize async x402ResourceServer.

        Args:
            facilitator_clients: Facilitator client(s) for verify/settle.
                Can be single client, list, or None.
        """
        super().__init__(facilitator_clients)
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
    # Verify Payment (Async)
    # ========================================================================

    async def verify_payment(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
        payload_bytes: bytes | None = None,
        requirements_bytes: bytes | None = None,
    ) -> VerifyResponse:
        """Verify a payment via facilitator.

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.
            payload_bytes: Raw payload bytes (escape hatch).
            requirements_bytes: Raw requirements bytes (escape hatch).

        Returns:
            VerifyResponse with is_valid=True or is_valid=False.

        Raises:
            SchemeNotFoundError: If no facilitator for scheme/network.
            PaymentAbortedError: If a before hook aborts.
            RuntimeError: If not initialized.
        """
        if not self._initialized:
            raise RuntimeError("Server not initialized. Call initialize() first.")

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
            # Get scheme and network
            scheme = payload.get_scheme()
            network = payload.get_network()

            # Find facilitator client (must be async FacilitatorClient)
            client = self._facilitator_clients_map.get(network, {}).get(scheme)
            if client is None:
                raise SchemeNotFoundError(scheme, network)

            # Call facilitator (async)
            verify_result = await client.verify(  # type: ignore[misc]
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
    # Settle Payment (Async)
    # ========================================================================

    async def settle_payment(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
        payload_bytes: bytes | None = None,
        requirements_bytes: bytes | None = None,
    ) -> SettleResponse:
        """Settle a payment via facilitator.

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.
            payload_bytes: Raw payload bytes (escape hatch).
            requirements_bytes: Raw requirements bytes (escape hatch).

        Returns:
            SettleResponse with success=True or success=False.

        Raises:
            SchemeNotFoundError: If no facilitator for scheme/network.
            PaymentAbortedError: If a before hook aborts.
            RuntimeError: If not initialized.
        """
        if not self._initialized:
            raise RuntimeError("Server not initialized. Call initialize() first.")

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
            # Get scheme and network
            scheme = payload.get_scheme()
            network = payload.get_network()

            # Find facilitator client (must be async FacilitatorClient)
            client = self._facilitator_clients_map.get(network, {}).get(scheme)
            if client is None:
                raise SchemeNotFoundError(scheme, network)

            # Call facilitator (async)
            settle_result = await client.settle(  # type: ignore[misc]
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
# Sync Resource Server
# ============================================================================


class x402ResourceServerSync(_x402ResourceServerBase):
    """Sync server-side component for protecting resources.

    Only supports sync hooks. For async hook support, use x402ResourceServer.

    IMPORTANT: Use with HTTPFacilitatorClientSync (sync) for proper sync operation.
    Using HTTPFacilitatorClient (async) will cause errors.

    Example:
        ```python
        from x402 import x402ResourceServerSync
        from x402.http import HTTPFacilitatorClientSync

        from x402.mechanisms.evm.exact import ExactEvmServerScheme

        facilitator = HTTPFacilitatorClientSync(url="https://x402.org/facilitator")
        server = x402ResourceServerSync(facilitator)
        server.register("eip155:8453", ExactEvmServerScheme())

        # Initialize (fetch supported from facilitators)
        server.initialize()

        # Verify payment
        result = server.verify_payment(payload, requirements[0])
        ```
    """

    def __init__(
        self,
        facilitator_clients: FacilitatorClientSync | list[FacilitatorClientSync] | None = None,
    ) -> None:
        """Initialize sync x402ResourceServer.

        Args:
            facilitator_clients: Sync facilitator client(s) for verify/settle.
                Can be single client, list, or None.

        Raises:
            TypeError: If any facilitator client is async (HTTPFacilitatorClient).
        """
        # Runtime validation - catch mismatched sync/async early
        self._validate_sync_facilitator_clients(facilitator_clients)

        super().__init__(facilitator_clients)
        # Type the hook lists for sync-only
        self._before_verify_hooks: list[SyncBeforeVerifyHook] = []
        self._after_verify_hooks: list[SyncAfterVerifyHook] = []
        self._on_verify_failure_hooks: list[SyncOnVerifyFailureHook] = []

        self._before_settle_hooks: list[SyncBeforeSettleHook] = []
        self._after_settle_hooks: list[SyncAfterSettleHook] = []
        self._on_settle_failure_hooks: list[SyncOnSettleFailureHook] = []

    @staticmethod
    def _validate_sync_facilitator_clients(
        clients: FacilitatorClientSync | list[FacilitatorClientSync] | None,
    ) -> None:
        """Validate that all facilitator clients are sync variants."""
        if clients is None:
            return

        # Normalize to list
        client_list = clients if isinstance(clients, list) else [clients]

        for client in client_list:
            # Check if verify/settle methods are coroutine functions (async)
            import inspect

            verify_method = getattr(client, "verify", None)
            if verify_method and inspect.iscoroutinefunction(verify_method):
                raise TypeError(
                    f"x402ResourceServerSync requires a sync facilitator client, "
                    f"but got {type(client).__name__} which has async methods. "
                    f"Use HTTPFacilitatorClientSync instead of HTTPFacilitatorClient, "
                    f"or use x402ResourceServer (async) with HTTPFacilitatorClient."
                )

    # ========================================================================
    # Hook Registration
    # ========================================================================

    def on_before_verify(self, hook: SyncBeforeVerifyHook) -> Self:
        """Register hook to run before verification.

        Note: Only sync hooks are supported. Use x402ResourceServer for async hooks.

        Args:
            hook: Sync hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_verify_hooks.append(hook)
        return self

    def on_after_verify(self, hook: SyncAfterVerifyHook) -> Self:
        """Register hook to run after successful verification.

        Note: Only sync hooks are supported. Use x402ResourceServer for async hooks.

        Args:
            hook: Sync hook function.

        Returns:
            Self for chaining.
        """
        self._after_verify_hooks.append(hook)
        return self

    def on_verify_failure(self, hook: SyncOnVerifyFailureHook) -> Self:
        """Register hook to run on verification failure.

        Note: Only sync hooks are supported. Use x402ResourceServer for async hooks.

        Args:
            hook: Sync hook function. Can return RecoveredVerifyResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_verify_failure_hooks.append(hook)
        return self

    def on_before_settle(self, hook: SyncBeforeSettleHook) -> Self:
        """Register hook to run before settlement.

        Note: Only sync hooks are supported. Use x402ResourceServer for async hooks.

        Args:
            hook: Sync hook function. Can return AbortResult to abort.

        Returns:
            Self for chaining.
        """
        self._before_settle_hooks.append(hook)
        return self

    def on_after_settle(self, hook: SyncAfterSettleHook) -> Self:
        """Register hook to run after successful settlement.

        Note: Only sync hooks are supported. Use x402ResourceServer for async hooks.

        Args:
            hook: Sync hook function.

        Returns:
            Self for chaining.
        """
        self._after_settle_hooks.append(hook)
        return self

    def on_settle_failure(self, hook: SyncOnSettleFailureHook) -> Self:
        """Register hook to run on settlement failure.

        Note: Only sync hooks are supported. Use x402ResourceServer for async hooks.

        Args:
            hook: Sync hook function. Can return RecoveredSettleResult to recover.

        Returns:
            Self for chaining.
        """
        self._on_settle_failure_hooks.append(hook)
        return self

    # ========================================================================
    # Verify Payment (Sync)
    # ========================================================================

    def verify_payment(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
        payload_bytes: bytes | None = None,
        requirements_bytes: bytes | None = None,
    ) -> VerifyResponse:
        """Verify a payment via facilitator.

        Args:
            payload: Payment payload to verify.
            requirements: Requirements to verify against.
            payload_bytes: Raw payload bytes (escape hatch).
            requirements_bytes: Raw requirements bytes (escape hatch).

        Returns:
            VerifyResponse with is_valid=True or is_valid=False.

        Raises:
            SchemeNotFoundError: If no facilitator for scheme/network.
            PaymentAbortedError: If a before hook aborts.
            RuntimeError: If not initialized.
        """
        if not self._initialized:
            raise RuntimeError("Server not initialized. Call initialize() first.")

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
            # Get scheme and network
            scheme = payload.get_scheme()
            network = payload.get_network()

            # Find facilitator client
            client = self._facilitator_clients_map.get(network, {}).get(scheme)
            if client is None:
                raise SchemeNotFoundError(scheme, network)

            # Call facilitator
            verify_result = client.verify(
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
    # Settle Payment (Sync)
    # ========================================================================

    def settle_payment(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
        payload_bytes: bytes | None = None,
        requirements_bytes: bytes | None = None,
    ) -> SettleResponse:
        """Settle a payment via facilitator.

        Args:
            payload: Payment payload to settle.
            requirements: Requirements for settlement.
            payload_bytes: Raw payload bytes (escape hatch).
            requirements_bytes: Raw requirements bytes (escape hatch).

        Returns:
            SettleResponse with success=True or success=False.

        Raises:
            SchemeNotFoundError: If no facilitator for scheme/network.
            PaymentAbortedError: If a before hook aborts.
            RuntimeError: If not initialized.
        """
        if not self._initialized:
            raise RuntimeError("Server not initialized. Call initialize() first.")

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
            # Get scheme and network
            scheme = payload.get_scheme()
            network = payload.get_network()

            # Find facilitator client
            client = self._facilitator_clients_map.get(network, {}).get(scheme)
            if client is None:
                raise SchemeNotFoundError(scheme, network)

            # Call facilitator
            settle_result = client.settle(
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
                "Async hooks are not supported in x402ResourceServerSync. "
                "Use x402ResourceServer for async hook support."
            )
        return result
