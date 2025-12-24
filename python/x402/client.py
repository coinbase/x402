"""x402Client - Client-side component for creating payment payloads.

Manages scheme registration, policy-based filtering, and payload creation.
"""

from __future__ import annotations

from typing import Any, Callable

from typing_extensions import Self

from .interfaces import SchemeNetworkClient, SchemeNetworkClientV1
from .schemas import (
    AbortResult,
    Network,
    NoMatchingRequirementsError,
    PaymentAbortedError,
    PaymentCreatedContext,
    PaymentCreationContext,
    PaymentCreationFailureContext,
    PaymentPayload,
    PaymentPayloadV1,
    PaymentRequired,
    PaymentRequiredV1,
    PaymentRequirements,
    PaymentRequirementsV1,
    RecoveredPayloadResult,
    ResourceInfo,
    SchemeNotFoundError,
    find_schemes_by_network,
)

# ============================================================================
# Type Aliases
# ============================================================================

# V2 types
Requirements = PaymentRequirements
RequirementsView = PaymentRequirements | PaymentRequirementsV1

# Policy: filter requirements list (e.g., prefer_network, max_amount)
PaymentPolicy = Callable[[int, list[RequirementsView]], list[RequirementsView]]

# Selector: choose final requirement from filtered list
PaymentRequirementsSelector = Callable[[int, list[RequirementsView]], RequirementsView]

# Hook types
BeforePaymentCreationHook = Callable[[PaymentCreationContext], None | AbortResult]
AfterPaymentCreationHook = Callable[[PaymentCreatedContext], None]
OnPaymentCreationFailureHook = Callable[
    [PaymentCreationFailureContext], None | RecoveredPayloadResult
]


# ============================================================================
# Default Implementations
# ============================================================================


def default_payment_selector(
    version: int,
    requirements: list[RequirementsView],
) -> RequirementsView:
    """Default selector: return first requirement.

    Args:
        version: Protocol version.
        requirements: List of filtered requirements.

    Returns:
        First requirement in list.
    """
    return requirements[0]


# ============================================================================
# Built-in Policies
# ============================================================================


def prefer_network(network: Network) -> PaymentPolicy:
    """Create policy that prefers a specific network.

    Args:
        network: Network to prefer.

    Returns:
        Policy function that moves matching requirements to front.
    """

    def policy(version: int, reqs: list[RequirementsView]) -> list[RequirementsView]:
        preferred = [r for r in reqs if r.network == network]
        others = [r for r in reqs if r.network != network]
        return preferred + others

    return policy


def prefer_scheme(scheme: str) -> PaymentPolicy:
    """Create policy that prefers a specific scheme.

    Args:
        scheme: Scheme to prefer.

    Returns:
        Policy function that moves matching requirements to front.
    """

    def policy(version: int, reqs: list[RequirementsView]) -> list[RequirementsView]:
        preferred = [r for r in reqs if r.scheme == scheme]
        others = [r for r in reqs if r.scheme != scheme]
        return preferred + others

    return policy


def max_amount(max_value: int) -> PaymentPolicy:
    """Create policy that filters by maximum amount.

    Args:
        max_value: Maximum amount in smallest unit.

    Returns:
        Policy function that removes requirements exceeding max.
    """

    def policy(version: int, reqs: list[RequirementsView]) -> list[RequirementsView]:
        return [r for r in reqs if int(r.get_amount()) <= max_value]

    return policy


# ============================================================================
# x402Client
# ============================================================================


class x402Client:
    """Client-side component for creating payment payloads.

    Manages scheme registration, policy-based filtering, and payload creation.
    Supports both V1 and V2 protocol versions.

    Example:
        ```python
        from x402 import x402Client
        from x402.mechanisms.evm.exact import ExactEvmScheme

        client = x402Client()
        client.register("eip155:8453", ExactEvmScheme(signer=my_signer))
        client.register_policy(prefer_network("eip155:8453"))

        # Create payment payload from 402 response
        payload = client.create_payment_payload(payment_required)
        ```
    """

    def __init__(
        self,
        payment_requirements_selector: PaymentRequirementsSelector | None = None,
    ) -> None:
        """Initialize x402Client.

        Args:
            payment_requirements_selector: Custom selector for choosing
                from filtered requirements. Defaults to first match.
        """
        self._selector = payment_requirements_selector or default_payment_selector
        self._schemes: dict[Network, dict[str, SchemeNetworkClient]] = {}
        self._schemes_v1: dict[Network, dict[str, SchemeNetworkClientV1]] = {}
        self._policies: list[PaymentPolicy] = []

        # Hooks
        self._before_payment_creation_hooks: list[BeforePaymentCreationHook] = []
        self._after_payment_creation_hooks: list[AfterPaymentCreationHook] = []
        self._on_payment_creation_failure_hooks: list[OnPaymentCreationFailureHook] = []

    # ========================================================================
    # Registration
    # ========================================================================

    def register(self, network: Network, client: SchemeNetworkClient) -> Self:
        """Register a V2 scheme client for a network.

        Args:
            network: Network to register for (e.g., "eip155:8453" or "eip155:*").
            client: Scheme client implementation.

        Returns:
            Self for chaining.
        """
        if network not in self._schemes:
            self._schemes[network] = {}
        self._schemes[network][client.scheme] = client
        return self

    def register_v1(self, network: Network, client: SchemeNetworkClientV1) -> Self:
        """Register a V1 scheme client for a network.

        Args:
            network: Network to register for.
            client: V1 scheme client implementation.

        Returns:
            Self for chaining.
        """
        if network not in self._schemes_v1:
            self._schemes_v1[network] = {}
        self._schemes_v1[network][client.scheme] = client
        return self

    def register_policy(self, policy: PaymentPolicy) -> Self:
        """Add a requirement filter policy.

        Policies are applied in registration order to filter and reorder
        payment requirements before selection.

        Args:
            policy: Policy function to add.

        Returns:
            Self for chaining.
        """
        self._policies.append(policy)
        return self

    # ========================================================================
    # Hook Registration
    # ========================================================================

    def on_before_payment_creation(self, hook: BeforePaymentCreationHook) -> Self:
        """Register hook to run before payment creation.

        Hook can return AbortResult to abort the operation.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._before_payment_creation_hooks.append(hook)
        return self

    def on_after_payment_creation(self, hook: AfterPaymentCreationHook) -> Self:
        """Register hook to run after successful payment creation.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._after_payment_creation_hooks.append(hook)
        return self

    def on_payment_creation_failure(self, hook: OnPaymentCreationFailureHook) -> Self:
        """Register hook to run on payment creation failure.

        Hook can return RecoveredPayloadResult to recover with a payload.

        Args:
            hook: Hook function.

        Returns:
            Self for chaining.
        """
        self._on_payment_creation_failure_hooks.append(hook)
        return self

    # ========================================================================
    # Payment Creation
    # ========================================================================

    def create_payment_payload(
        self,
        payment_required: PaymentRequired | PaymentRequiredV1,
        resource: ResourceInfo | None = None,
        extensions: dict[str, Any] | None = None,
    ) -> PaymentPayload | PaymentPayloadV1:
        """Create a payment payload for the given 402 response.

        Args:
            payment_required: The 402 response from the server.
            resource: Optional resource info to include.
            extensions: Optional extensions to include.

        Returns:
            PaymentPayload (V2) or PaymentPayloadV1 (V1).

        Raises:
            NoMatchingRequirementsError: If no requirements match registered schemes.
            SchemeNotFoundError: If scheme not found for selected requirement.
            PaymentAbortedError: If a before hook aborts the operation.
        """
        version = payment_required.x402_version

        if version == 1:
            return self._create_payment_payload_v1(
                payment_required,  # type: ignore[arg-type]
            )
        else:
            return self._create_payment_payload_v2(
                payment_required,  # type: ignore[arg-type]
                resource,
                extensions,
            )

    def _create_payment_payload_v2(
        self,
        payment_required: PaymentRequired,
        resource: ResourceInfo | None,
        extensions: dict[str, Any] | None,
    ) -> PaymentPayload:
        """Create V2 payment payload."""
        # 1. Select requirements
        selected = self._select_requirements_v2(payment_required.accepts)

        # 2. Build context
        context = PaymentCreationContext(
            payment_required=payment_required,
            selected_requirements=selected,
        )

        # 3. Execute before hooks
        for hook in self._before_payment_creation_hooks:
            result = hook(context)
            if isinstance(result, AbortResult):
                raise PaymentAbortedError(result.reason)

        try:
            # 4. Find scheme client
            schemes = find_schemes_by_network(self._schemes, selected.network)
            if schemes is None or selected.scheme not in schemes:
                raise SchemeNotFoundError(selected.scheme, selected.network)

            client = schemes[selected.scheme]

            # 5. Create inner payload
            inner_payload = client.create_payment_payload(selected)

            # 6. Wrap into full PaymentPayload
            payload = PaymentPayload(
                x402_version=2,
                payload=inner_payload,
                accepted=selected,
                resource=resource or payment_required.resource,
                extensions=extensions or payment_required.extensions,
            )

            # 7. Execute after hooks
            result_context = PaymentCreatedContext(
                payment_required=payment_required,
                selected_requirements=selected,
                payment_payload=payload,
            )
            for hook in self._after_payment_creation_hooks:
                hook(result_context)

            return payload

        except Exception as e:
            # Execute failure hooks
            failure_context = PaymentCreationFailureContext(
                payment_required=payment_required,
                selected_requirements=selected,
                error=e,
            )
            for hook in self._on_payment_creation_failure_hooks:
                result = hook(failure_context)
                if isinstance(result, RecoveredPayloadResult):
                    return result.payload  # type: ignore[return-value]

            raise

    def _create_payment_payload_v1(
        self,
        payment_required: PaymentRequiredV1,
    ) -> PaymentPayloadV1:
        """Create V1 payment payload."""
        # 1. Select requirements
        selected = self._select_requirements_v1(payment_required.accepts)

        # 2. Build context
        context = PaymentCreationContext(
            payment_required=payment_required,
            selected_requirements=selected,
        )

        # 3. Execute before hooks
        for hook in self._before_payment_creation_hooks:
            result = hook(context)
            if isinstance(result, AbortResult):
                raise PaymentAbortedError(result.reason)

        try:
            # 4. Find scheme client
            schemes = find_schemes_by_network(self._schemes_v1, selected.network)
            if schemes is None or selected.scheme not in schemes:
                raise SchemeNotFoundError(selected.scheme, selected.network)

            client = schemes[selected.scheme]

            # 5. Create inner payload
            inner_payload = client.create_payment_payload(selected)

            # 6. Wrap into full PaymentPayloadV1
            payload = PaymentPayloadV1(
                x402_version=1,
                scheme=selected.scheme,
                network=selected.network,
                payload=inner_payload,
            )

            # 7. Execute after hooks
            result_context = PaymentCreatedContext(
                payment_required=payment_required,
                selected_requirements=selected,
                payment_payload=payload,
            )
            for hook in self._after_payment_creation_hooks:
                hook(result_context)

            return payload

        except Exception as e:
            # Execute failure hooks
            failure_context = PaymentCreationFailureContext(
                payment_required=payment_required,
                selected_requirements=selected,
                error=e,
            )
            for hook in self._on_payment_creation_failure_hooks:
                result = hook(failure_context)
                if isinstance(result, RecoveredPayloadResult):
                    return result.payload  # type: ignore[return-value]

            raise

    def _select_requirements_v2(
        self,
        requirements: list[PaymentRequirements],
    ) -> PaymentRequirements:
        """Select V2 requirements using policies and selector."""
        # Filter to supported schemes
        supported = []
        for req in requirements:
            schemes = find_schemes_by_network(self._schemes, req.network)
            if schemes and req.scheme in schemes:
                supported.append(req)

        if not supported:
            raise NoMatchingRequirementsError("No payment requirements match registered schemes")

        # Apply policies
        filtered: list[RequirementsView] = list(supported)
        for policy in self._policies:
            filtered = policy(2, filtered)
            if not filtered:
                raise NoMatchingRequirementsError("All requirements filtered out by policies")

        # Select final
        return self._selector(2, filtered)  # type: ignore[return-value]

    def _select_requirements_v1(
        self,
        requirements: list[PaymentRequirementsV1],
    ) -> PaymentRequirementsV1:
        """Select V1 requirements using policies and selector."""
        # Filter to supported schemes
        supported = []
        for req in requirements:
            schemes = find_schemes_by_network(self._schemes_v1, req.network)
            if schemes and req.scheme in schemes:
                supported.append(req)

        if not supported:
            raise NoMatchingRequirementsError("No payment requirements match registered schemes")

        # Apply policies
        filtered: list[RequirementsView] = list(supported)
        for policy in self._policies:
            filtered = policy(1, filtered)
            if not filtered:
                raise NoMatchingRequirementsError("All requirements filtered out by policies")

        # Select final
        return self._selector(1, filtered)  # type: ignore[return-value]

    # ========================================================================
    # Introspection
    # ========================================================================

    def get_registered_schemes(
        self,
    ) -> dict[int, list[dict[str, str]]]:
        """Get list of registered schemes for debugging.

        Returns:
            Dict mapping version to list of {network, scheme} dicts.
        """
        result: dict[int, list[dict[str, str]]] = {1: [], 2: []}

        for network, schemes in self._schemes.items():
            for scheme in schemes:
                result[2].append({"network": network, "scheme": scheme})

        for network, schemes in self._schemes_v1.items():
            for scheme in schemes:
                result[1].append({"network": network, "scheme": scheme})

        return result
