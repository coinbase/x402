"""x402ResourceServer - Server-side component for protecting resources.

Provides both async (x402ResourceServer) and sync (x402ResourceServerSync)
implementations for building payment requirements, verifying payments,
and settling transactions via facilitator clients.
"""

from __future__ import annotations

import asyncio
from typing import Any

from typing_extensions import Self

from .schemas import (
    PaymentPayload,
    PaymentPayloadV1,
    PaymentRequirements,
    PaymentRequirementsV1,
    ResourceConfig,
    SettleResponse,
    VerifyResponse,
)
from .server_base import (
    AfterSettleHook,
    AfterVerifyHook,
    BeforeSettleHook,
    BeforeVerifyHook,
    FacilitatorClient,
    FacilitatorClientSync,
    OnSettleFailureHook,
    OnVerifyFailureHook,
    SyncAfterSettleHook,
    SyncAfterVerifyHook,
    SyncBeforeSettleHook,
    SyncBeforeVerifyHook,
    SyncOnSettleFailureHook,
    SyncOnVerifyFailureHook,
    x402ResourceServerBase,
)

# Re-export for external use
__all__ = [
    "x402ResourceServer",
    "x402ResourceServerSync",
    "FacilitatorClient",
    "FacilitatorClientSync",
    "ResourceConfig",
]


# ============================================================================
# Async Resource Server (Default)
# ============================================================================


class x402ResourceServer(x402ResourceServerBase):
    """Async server-side component for protecting resources.

    Supports both sync and async hooks (auto-detected).
    Use x402ResourceServerSync for sync-only environments.

    IMPORTANT: Use with HTTPFacilitatorClient (async) for proper async operation.

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
        """Initialize async x402ResourceServer."""
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
        """Register hook before verification. Return AbortResult to abort."""
        self._before_verify_hooks.append(hook)
        return self

    def on_after_verify(self, hook: AfterVerifyHook) -> Self:
        """Register hook after successful verification."""
        self._after_verify_hooks.append(hook)
        return self

    def on_verify_failure(self, hook: OnVerifyFailureHook) -> Self:
        """Register hook on verification failure. Return RecoveredVerifyResult to recover."""
        self._on_verify_failure_hooks.append(hook)
        return self

    def on_before_settle(self, hook: BeforeSettleHook) -> Self:
        """Register hook before settlement. Return AbortResult to abort."""
        self._before_settle_hooks.append(hook)
        return self

    def on_after_settle(self, hook: AfterSettleHook) -> Self:
        """Register hook after successful settlement."""
        self._after_settle_hooks.append(hook)
        return self

    def on_settle_failure(self, hook: OnSettleFailureHook) -> Self:
        """Register hook on settlement failure. Return RecoveredSettleResult to recover."""
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
        gen = self._verify_payment_core(payload, requirements, payload_bytes, requirements_bytes)
        result = None
        try:
            while True:
                phase, target, ctx = gen.send(result)
                if phase == "call_facilitator":
                    # target is client, ctx is (method_name, payload, requirements)
                    method_name, p, r = ctx
                    if method_name == "verify":
                        result = await target.verify(p, r)
                    else:
                        result = await target.settle(p, r)
                else:
                    result = await self._execute_hook(target, ctx)
        except StopIteration as e:
            return e.value

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
        gen = self._settle_payment_core(payload, requirements, payload_bytes, requirements_bytes)
        result = None
        try:
            while True:
                phase, target, ctx = gen.send(result)
                if phase == "call_facilitator":
                    # target is client, ctx is (method_name, payload, requirements)
                    method_name, p, r = ctx
                    if method_name == "verify":
                        result = await target.verify(p, r)
                    else:
                        result = await target.settle(p, r)
                else:
                    result = await self._execute_hook(target, ctx)
        except StopIteration as e:
            return e.value

    async def _execute_hook(self, hook: Any, context: Any) -> Any:
        """Execute hook, auto-detecting sync/async."""
        result = hook(context)
        if asyncio.iscoroutine(result) or asyncio.isfuture(result):
            return await result
        return result


# ============================================================================
# Sync Resource Server
# ============================================================================


class x402ResourceServerSync(x402ResourceServerBase):
    """Sync server-side component for protecting resources.

    Only supports sync hooks. For async hook support, use x402ResourceServer.

    IMPORTANT: Use with HTTPFacilitatorClientSync (sync) for proper sync operation.

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
        """Initialize sync x402ResourceServer."""
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
        """Register hook before verification. Return AbortResult to abort."""
        self._before_verify_hooks.append(hook)
        return self

    def on_after_verify(self, hook: SyncAfterVerifyHook) -> Self:
        """Register hook after successful verification."""
        self._after_verify_hooks.append(hook)
        return self

    def on_verify_failure(self, hook: SyncOnVerifyFailureHook) -> Self:
        """Register hook on verification failure. Return RecoveredVerifyResult to recover."""
        self._on_verify_failure_hooks.append(hook)
        return self

    def on_before_settle(self, hook: SyncBeforeSettleHook) -> Self:
        """Register hook before settlement. Return AbortResult to abort."""
        self._before_settle_hooks.append(hook)
        return self

    def on_after_settle(self, hook: SyncAfterSettleHook) -> Self:
        """Register hook after successful settlement."""
        self._after_settle_hooks.append(hook)
        return self

    def on_settle_failure(self, hook: SyncOnSettleFailureHook) -> Self:
        """Register hook on settlement failure. Return RecoveredSettleResult to recover."""
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
        gen = self._verify_payment_core(payload, requirements, payload_bytes, requirements_bytes)
        result = None
        try:
            while True:
                phase, target, ctx = gen.send(result)
                if phase == "call_facilitator":
                    # target is client, ctx is (method_name, payload, requirements)
                    method_name, p, r = ctx
                    if method_name == "verify":
                        result = target.verify(p, r)
                    else:
                        result = target.settle(p, r)
                else:
                    result = self._execute_hook_sync(target, ctx)
        except StopIteration as e:
            return e.value

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
        gen = self._settle_payment_core(payload, requirements, payload_bytes, requirements_bytes)
        result = None
        try:
            while True:
                phase, target, ctx = gen.send(result)
                if phase == "call_facilitator":
                    # target is client, ctx is (method_name, payload, requirements)
                    method_name, p, r = ctx
                    if method_name == "verify":
                        result = target.verify(p, r)
                    else:
                        result = target.settle(p, r)
                else:
                    result = self._execute_hook_sync(target, ctx)
        except StopIteration as e:
            return e.value

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
