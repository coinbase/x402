from typing import Callable, Optional

from x402.core import X402_VERSION
from x402.core.types import Version
from x402.core.types.mechanisms import SchemeNetworkClient
from x402.core.types.payments import PaymentRequirements

SelectPaymentRequirements = Callable[
    [Version, list[PaymentRequirements]], PaymentRequirements
]


class X402Client:
    """Core client for managing x402 payment schemes and creating payment payloads.

    Handles registration of payment schemes, policy-based filtering of payment requirements,
    and creation of payment payloads based on server requirements.

    Args:
        registered_client_schemes (Optional[SelectPaymentRequirements]):
            Function to select payment requirements from available options
    """

    def __init__(
        self, payment_requirements_selector: Optional[SelectPaymentRequirements] = None
    ):
        """Instatiates a new X402Client

        Set an empty dictionary as the client scheme map
        Set the payment requirement selector from input or uses the default one
        """
        self.registered_client_schemes: dict[
            Version, dict[str, dict[str, SchemeNetworkClient]]
        ] = {}
        self.payment_requirements_selector = payment_requirements_selector or (
            lambda _, accepts: accepts[0]
        )

    def register_scheme(
        self, network: str, client: SchemeNetworkClient
    ) -> "X402Client":
        """Registers a scheme client for the current x402 version.

        Args:
            network (Network): The network to register the client for
            client (SchemeNetworkClient): The scheme network client to register

        Returns:
            X402Client: The X402Client instance for chaining
        """
        return self._register_scheme(X402_VERSION, network, client)

    def register_scheme_V1(
        self, network: str, client: SchemeNetworkClient
    ) -> "X402Client":
        """Registers a scheme client for x402 version 1.

        Args:
            network (Network): The network to register the client for
            client (SchemeNetworkClient): The scheme network client to register

        Returns:
            X402Client: The X402Client instance for chaining
        """
        return self._register_scheme(1, network, client)

    def _register_scheme(
        self, x402_version: Version, network: str, client: SchemeNetworkClient
    ) -> "X402Client":
        """Internal method to register a scheme client.

        Args:
            x402_version (Version): The x402 protocol version
            network (Network): The network to register the client for
            client (SchemeNetworkClient): The scheme network client to register

        Returns:
            X402Client: The X402Client instance for chaining
        """
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
