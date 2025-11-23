import itertools
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Protocol, runtime_checkable

from x402.core import X402_VERSION
from x402.core.types import Network, Version
from x402.core.types.mechanisms import SchemeNetworkClient
from x402.core.types.payments import (
    PaymentPayload,
    PaymentPayloadV1,
    PaymentRequired,
    PaymentRequirements,
)

SchemeClientsMap = dict[str, SchemeNetworkClient]
NetworkSchemeClientsMap = dict[str, SchemeClientsMap]

# A selector function that chooses a single payment requirement
SelectPaymentRequirements = Callable[
    [Version, list[PaymentRequirements]], PaymentRequirements
]

# A policy function that filters or transforms payment requirements.
# Policies are applied in order before the selector chooses the final option.
PaymentPolicy = Callable[
    [Version, list[PaymentRequirements]], list[PaymentRequirements]
]


# Configuration for registering a payment scheme with a specific network
@dataclass
class SchemeRegistration:
    # The network identifier (e.g., 'eip155:8453', 'solana:mainnet')
    network: Network

    # The scheme client implementation for this network
    client: SchemeNetworkClient

    # The x402 protocol version to use for this scheme (default: 2)
    x402_version: int = X402_VERSION


# Configuration options for building a X402Client instance
@dataclass
class X402ClientConfig:
    # List of scheme registrations defining which payment methods are supported
    schemes: list[SchemeRegistration]

    # Policies to apply to the client
    policies: list[PaymentPolicy] = field(default_factory=list)

    # Custom payment requirements selector function
    # If not provided, uses the default selector (first available option)
    payment_requirements_selector: Optional[SelectPaymentRequirements] = None


# Client Hook Context Dataclasses


@dataclass
class PaymentCreationContext:
    payment_required: PaymentRequired
    selected_requirements: PaymentRequirements


@dataclass
class PaymentCreatedContext(PaymentCreationContext):
    payment_payload: PaymentPayload | PaymentPayloadV1


@dataclass
class PaymentCreationFailureContext(PaymentCreationContext):
    error: Exception


# Client Hook Result Dataclasses


@dataclass
class AbortResult:
    abort: bool
    reason: str


@dataclass
class RecoveredResult:
    recovered: bool
    payload: PaymentPayload | PaymentPayloadV1


# Client Hook Type Definitions


@runtime_checkable
class BeforePaymentCreationHook(Protocol):
    async def __call__(
        self, context: PaymentCreationContext
    ) -> Optional[AbortResult]: ...


@runtime_checkable
class AfterPaymentCreationHook(Protocol):
    async def __call__(self, context: PaymentCreatedContext) -> None: ...


@runtime_checkable
class OnPaymentCreationFailureHook(Protocol):
    async def __call__(
        self, context: PaymentCreationFailureContext
    ) -> Optional[RecoveredResult]: ...


class X402Client:
    """Core client for managing x402 payment schemes and creating payment payloads.

    Handles registration of payment schemes, policy-based filtering of payment requirements,
    and creation of payment payloads based on server requirements.

    Args:
        registered_client_schemes (`Optional[SelectPaymentRequirements]`):
            Function to select payment requirements from available options
    """

    def __init__(
        self, payment_requirements_selector: Optional[SelectPaymentRequirements] = None
    ):
        """Instantiates a new X402Client

        Set the payment requirement selector from input or uses the default one
        Set an empty dictionary as the client scheme map
        Set an empty list of payment policies
        Set lists of hook functions
        """
        self.payment_requirements_selector = payment_requirements_selector or (
            lambda _, accepts: accepts[0]
        )
        self.registered_client_schemes: dict[Version, NetworkSchemeClientsMap] = {}
        self.policies: list[PaymentPolicy] = []
        self.before_payment_creation_hooks: list[BeforePaymentCreationHook] = []
        self.after_payment_creation_hooks: list[AfterPaymentCreationHook] = []
        self.on_payment_creation_failure_hooks: list[OnPaymentCreationFailureHook] = []

    @classmethod
    def from_config(cls, config: X402ClientConfig) -> "X402Client":
        """Creates a new x402Client instance from a configuration object.

        Args:
            config (`X402ClientConfig`): The client configuration including schemes, policies, and payment requirements selector

        Returns:
            `X402Client`: A configured X402Client instance
        """
        client = X402Client(config.payment_requirements_selector)
        for scheme in config.schemes:
            if scheme.x402_version == 1:
                client.register_V1(scheme.network, scheme.client)
            else:
                client.register(scheme.network, scheme.client)
        for policy in config.policies:
            client.register_policy(policy)
        return client

    def register(self, network: Network, client: SchemeNetworkClient) -> "X402Client":
        """Registers a scheme client for the current x402 version.

        Args:
            network (`Network`): The network to register the client for
            client (`SchemeNetworkClient`): The scheme network client to register

        Returns:
            `X402Client`: The X402Client instance for chaining
        """
        return self._register_scheme(X402_VERSION, network, client)

    def register_V1(
        self, network: Network, client: SchemeNetworkClient
    ) -> "X402Client":
        """Registers a scheme client for x402 version 1.

        Args:
            network (`Network`): The network to register the client for
            client (`SchemeNetworkClient`): The scheme network client to register

        Returns:
            `X402Client`: The X402Client instance for chaining
        """
        return self._register_scheme(1, network, client)

    def register_policy(self, policy: PaymentPolicy) -> "X402Client":
        """Registers a policy to filter or transform payment requirements.

        Policies are applied in order after filtering by registered schemes
        and before the selector chooses the final payment requirement.

        Args:
            policy (`PaymentPolicy`): Function to filter/transform payment requirements

        Returns:
            `X402Client`: The x402Client instance for chaining

        Example:
        ```python
        # Policy to filter for cheaper options
        policy = lambda version, reqs: list(filter(lambda r: int(r.value) < int("10000"), reqs))
        client.register_policy(policy)

        # Policy to filter for specific network
        policy = lambda version, reqs: list(filter(lambda r: r.network.startswith("eip155:"), reqs))
        client.register_policy(policy)
        ```
        """
        self.policies.append(policy)
        return self

    def on_before_payment_creation(
        self, hook: BeforePaymentCreationHook
    ) -> "X402Client":
        """Register a hook to execute before payment payload creation.
        Can abort creation by returning AbortResult(abort=True, reason="string")

        Args:
            hook (`BeforePaymentCreationHook`): The hook function to register

        Returns:
            `X402Client`: The X402Client instance for chaining
        """
        self.before_payment_creation_hooks.append(hook)
        return self

    def on_after_payment_creation(self, hook: AfterPaymentCreationHook) -> "X402Client":
        """Register a hook to execute after successful payment payload creation.

        Args:
            hook (`AfterPaymentCreationHook`): The hook function to register

        Returns:
            `X402Client`: The X402Client instance for chaining
        """
        assert isinstance(hook, AfterPaymentCreationHook)
        self.after_payment_creation_hooks.append(hook)
        return self

    def on_payment_creation_failure(
        self, hook: OnPaymentCreationFailureHook
    ) -> "X402Client":
        """Register a hook to execute when payment payload creation fails.
        Can recover from failure by returning RecoveredResult(recovered=True, payload=PaymentPayload(...))

        Args:
            hook (`OnPaymentCreationFailureHook`): The hook function to register

        Returns:
            `X402Client`: The X402Client instance for chaining
        """
        assert isinstance(hook, OnPaymentCreationFailureHook)
        self.on_payment_creation_failure_hooks.append(hook)
        return self

    async def create_payment_payload(
        self, payment_required: PaymentRequired
    ) -> PaymentPayload | PaymentPayloadV1:
        """Creates a payment payload based on a PaymentRequired response.

        Automatically extracts x402_version, resource, and extensions from the PaymentRequired
        response and constructs a complete PaymentPayload with the accepted requirements.

        Args:
            payment_required (`PaymentRequired`): The PaymentRequired response from the server

        Returns:
            (`PaymentPayload | PaymentPayloadV1`): The complete payment payload
        """
        assert isinstance(payment_required, PaymentRequired)

        requirements = self.select_payment_requirements(
            payment_required.x402_version, payment_required.accepts
        )

        payment_creation_context = PaymentCreationContext(
            payment_required=payment_required, selected_requirements=requirements
        )
        await self._execute_before_payment_creation_hooks(payment_creation_context)

        scheme_network_client = self._get_client_by_network_and_scheme(
            payment_required.x402_version, requirements.network, requirements.scheme
        )

        try:
            raw_payment_payload = await scheme_network_client.create_payment_payload(
                payment_required.x402_version, requirements
            )
            payment_payload = self._parse_payment_payload(
                raw_payment_payload,
                requirements,
                payment_required,
            )

            payment_created_context = PaymentCreatedContext(
                payment_required=payment_required,
                selected_requirements=requirements,
                payment_payload=payment_payload,
            )
            await self._execute_after_payment_creation_hooks(payment_created_context)

            return payment_payload
        except Exception as error:
            payment_creation_failure_context = PaymentCreationFailureContext(
                payment_required=payment_required,
                selected_requirements=requirements,
                error=error,
            )
            recovered_payload = await self._execute_on_payment_creation_failure_hooks(
                payment_creation_failure_context
            )

            if recovered_payload:
                return recovered_payload
            raise error

    def select_payment_requirements(
        self, x402_version: Version, payment_requirements: list[PaymentRequirements]
    ) -> PaymentRequirements:
        """Selects appropriate payment requirements based on registered clients and policies.

        Selection process:
        1. Filter by registered schemes (network + scheme support)
        2. Apply all registered policies in order
        3. Use selector to choose final requirement

        Args:
            x402_version (`Version`): The x402 protocol version
            payment_requirements (`list[PaymentRequirements]`): Array of available payment requirements

        Returns:
            `PaymentRequirements`: The selected payment requirements
        """
        assert type(x402_version) is int
        for req in payment_requirements:
            assert isinstance(req, PaymentRequirements)

        # Step 1: Filter by registered schemes
        supported_payment_requirements = self._get_supported_payment_requirements(
            x402_version, payment_requirements
        )

        # Step 2: Apply all policies in order
        filtered_requirements = self._apply_policies(
            x402_version, supported_payment_requirements
        )

        # Step 3: Use selector to choose final requirement
        return self.payment_requirements_selector(x402_version, filtered_requirements)

    def _get_supported_payment_requirements(
        self, x402_version: Version, payment_requirements: list[PaymentRequirements]
    ) -> list[PaymentRequirements]:
        """Internal method to filter only the payment requirements that have clients available for"""
        supported_payment_requirements = list(
            filter(
                lambda req: self._get_client_by_network_and_scheme(
                    x402_version, req.network, req.scheme
                ),
                payment_requirements,
            )
        )

        if supported_payment_requirements:
            return supported_payment_requirements

        client_schemes_by_network = self._get_network_scheme_clients_map_by_version(
            x402_version
        )
        exception_context = {
            "x402_version": x402_version,
            "payment_requirements": payment_requirements,
            "x402_versions": list(self.registered_client_schemes.keys()),
            "networks": list(client_schemes_by_network.keys()),
            "schemes": list(
                itertools.chain.from_iterable(
                    map(
                        lambda schemes: list(schemes.keys()),
                        list(client_schemes_by_network.values()),
                    )
                )
            ),
        }
        raise Exception(
            f"No network/scheme registered for x402 version: {x402_version} which comply with the payment requirements. {exception_context}"
        )

    def _get_client_by_network_and_scheme(
        self, x402_version: Version, network: Network, scheme: str
    ) -> SchemeNetworkClient:
        """Internal method to get a single SchemeNetworkClient from the map"""
        assert type(scheme) is str
        scheme_clients_map = self._get_scheme_clients_map_by_network(
            x402_version, network
        )
        return scheme_clients_map.get(scheme)

    # TODO: Implement pattern matching for registered network patterns
    def _get_scheme_clients_map_by_network(
        self, x402_version: Version, network: Network
    ) -> SchemeClientsMap:
        """Internal method to get SchemeClientsMap from x402_version and network"""
        assert type(network) is Network
        network_scheme_clients_map = self._get_network_scheme_clients_map_by_version(
            x402_version
        )
        return network_scheme_clients_map.get(network, {})

    def _get_network_scheme_clients_map_by_version(
        self, x402_version: Version
    ) -> NetworkSchemeClientsMap:
        """Internal method to get NetworkSchemeClientsMap from x402_version"""
        assert type(x402_version) is int
        network_scheme_clients_map = self.registered_client_schemes.get(x402_version)
        if not network_scheme_clients_map:
            raise Exception(f"No client registered for x402 version: {x402_version}")
        return network_scheme_clients_map

    def _parse_payment_payload(
        self,
        payload: dict[str, Any],
        requirements: PaymentRequirements,
        payment_required: PaymentRequired,
    ) -> PaymentPayload | PaymentPayloadV1:
        if payload.get("x402_version") == 1:
            return PaymentPayloadV1(**payload)

        return PaymentPayload(
            x402_version=payload.get("x402_version"),
            payload=payload.get("payload"),
            accepted=requirements,
            resource=payment_required.resource,
            extensions=payment_required.extensions,
        )

    async def _execute_before_payment_creation_hooks(
        self, context: PaymentCreationContext
    ):
        for hook in self.before_payment_creation_hooks:
            result: Optional[AbortResult] = await hook(context)
            if result and result.abort:
                raise Exception(f"Payment creation aborted: {result.reason}")

    async def _execute_after_payment_creation_hooks(
        self, context: PaymentCreatedContext
    ):
        for hook in self.after_payment_creation_hooks:
            await hook(context)

    async def _execute_on_payment_creation_failure_hooks(
        self, context: PaymentCreationFailureContext
    ) -> Optional[PaymentPayload | PaymentPayloadV1]:
        for hook in self.on_payment_creation_failure_hooks:
            result: Optional[RecoveredResult] = await hook(context)
            if result and result.recovered:
                return result.payload

    def _apply_policies(
        self, x402_version: Version, payment_requirements: list[PaymentRequirements]
    ) -> list[PaymentRequirements]:
        """Internal method to apply policies in order"""
        for policy in self.policies:
            payment_requirements = policy(x402_version, payment_requirements)
            if not payment_requirements:
                raise Exception(
                    f"All payment requirements were filtered out by policies for x402 version: {x402_version}"
                )
        return payment_requirements

    def _register_scheme(
        self, x402_version: Version, network: Network, client: SchemeNetworkClient
    ) -> "X402Client":
        """Internal method to register a scheme client on the instance"""
        assert type(x402_version) is int
        assert type(network) is str
        assert isinstance(client, SchemeNetworkClient)

        if x402_version not in self.registered_client_schemes:
            self.registered_client_schemes[x402_version] = {}

        client_schemes_by_network = self.registered_client_schemes[x402_version]
        if network not in client_schemes_by_network:
            client_schemes_by_network[network] = {}

        client_by_scheme = client_schemes_by_network[network]
        if client.scheme not in client_by_scheme:
            client_by_scheme[client.scheme] = client

        return self
