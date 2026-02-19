"""Registration helpers for Hypercore exact payment schemes."""

from typing import TYPE_CHECKING, Any, TypeVar

if TYPE_CHECKING:
    from x402 import (
        x402Client,
        x402ClientSync,
        x402Facilitator,
        x402FacilitatorSync,
        x402ResourceServer,
        x402ResourceServerSync,
    )

from ..constants import NETWORK_MAINNET, NETWORK_TESTNET
from .client import ExactHypercoreScheme as ExactHypercoreClientScheme
from .facilitator import ExactHypercoreScheme as ExactHypercoreFacilitatorScheme
from .server import ExactHypercoreScheme as ExactHypercoreServerScheme

# Type vars for accepting both async and sync variants
ClientT = TypeVar("ClientT", "x402Client", "x402ClientSync")
ServerT = TypeVar("ServerT", "x402ResourceServer", "x402ResourceServerSync")
FacilitatorT = TypeVar("FacilitatorT", "x402Facilitator", "x402FacilitatorSync")


def register_exact_hypercore_client(
    client: ClientT,
    signer: Any,
    networks: str | list[str] | None = None,
    policies: list[Any] | None = None,
) -> ClientT:
    """Register Hypercore exact payment schemes to x402Client.

    Registers:
    - hypercore:mainnet
    - hypercore:testnet
    - hypercore:* (wildcard)

    Args:
        client: x402Client instance.
        signer: Hyperliquid signer for payment authorizations.
        networks: Optional specific network(s) (default: wildcard).
        policies: Optional payment policies.

    Returns:
        Client for chaining.
    """

    scheme = ExactHypercoreClientScheme(signer)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            client.register(network, scheme)  # type: ignore[arg-type]
    else:
        client.register("hypercore:*", scheme)  # type: ignore[arg-type]
        client.register(NETWORK_MAINNET, scheme)  # type: ignore[arg-type]
        client.register(NETWORK_TESTNET, scheme)  # type: ignore[arg-type]

    if policies:
        for policy in policies:
            client.register_policy(policy)

    return client


def register_exact_hypercore_server(
    server: ServerT,
    networks: str | list[str] | None = None,
) -> ServerT:
    """Register Hypercore exact payment schemes to x402ResourceServer.

    Args:
        server: x402ResourceServer instance.
        networks: Optional specific network(s) (default: wildcard).

    Returns:
        Server for chaining.
    """

    scheme = ExactHypercoreServerScheme()

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            server.register(network, scheme)  # type: ignore[arg-type]
    else:
        server.register("hypercore:*", scheme)  # type: ignore[arg-type]
        server.register(NETWORK_MAINNET, scheme)  # type: ignore[arg-type]
        server.register(NETWORK_TESTNET, scheme)  # type: ignore[arg-type]

    return server


def register_exact_hypercore_facilitator(
    facilitator: FacilitatorT,
    api_url: str,
    networks: str | list[str] | None = None,
) -> FacilitatorT:
    """Register Hypercore exact payment schemes to x402Facilitator.

    Args:
        facilitator: x402Facilitator instance.
        api_url: Hyperliquid API endpoint URL.
        networks: Optional specific network(s) (default: mainnet + testnet).

    Returns:
        Facilitator for chaining.
    """

    scheme = ExactHypercoreFacilitatorScheme(api_url)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        facilitator.register(networks, scheme)
    else:
        facilitator.register([NETWORK_MAINNET, NETWORK_TESTNET], scheme)

    return facilitator
