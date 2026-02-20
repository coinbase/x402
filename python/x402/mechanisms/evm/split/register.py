"""Registration helpers for EVM split payment schemes."""

from typing import TYPE_CHECKING, TypeVar

if TYPE_CHECKING:
    from x402 import (
        x402Client,
        x402ClientSync,
        x402Facilitator,
        x402FacilitatorSync,
        x402ResourceServer,
        x402ResourceServerSync,
    )

    from ..signer import ClientEvmSigner, FacilitatorEvmSigner

# Type vars for accepting both async and sync variants
ClientT = TypeVar("ClientT", "x402Client", "x402ClientSync")
ServerT = TypeVar("ServerT", "x402ResourceServer", "x402ResourceServerSync")
FacilitatorT = TypeVar("FacilitatorT", "x402Facilitator", "x402FacilitatorSync")


def register_split_evm_client(
    client: ClientT,
    signer: "ClientEvmSigner",
    networks: str | list[str] | None = None,
    policies: list | None = None,
) -> ClientT:
    """Register EVM split payment schemes to x402Client.

    Args:
        client: x402Client instance.
        signer: EVM signer for payment authorizations.
        networks: Optional specific network(s) (default: eip155:* wildcard).
        policies: Optional payment policies.

    Returns:
        Client for chaining.
    """
    from .client import SplitEvmScheme as SplitEvmClientScheme

    scheme = SplitEvmClientScheme(signer)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            client.register(network, scheme)
    else:
        client.register("eip155:*", scheme)

    if policies:
        for policy in policies:
            client.register_policy(policy)

    return client


def register_split_evm_server(
    server: ServerT,
    networks: str | list[str] | None = None,
) -> ServerT:
    """Register EVM split payment schemes to x402ResourceServer.

    Args:
        server: x402ResourceServer instance.
        networks: Optional specific network(s) (default: eip155:* wildcard).

    Returns:
        Server for chaining.
    """
    from .server import SplitEvmScheme as SplitEvmServerScheme

    scheme = SplitEvmServerScheme()

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            server.register(network, scheme)
    else:
        server.register("eip155:*", scheme)

    return server


def register_split_evm_facilitator(
    facilitator: FacilitatorT,
    signer: "FacilitatorEvmSigner",
    networks: str | list[str],
    settlement_callback: object | None = None,
) -> FacilitatorT:
    """Register EVM split payment schemes to x402Facilitator.

    Args:
        facilitator: x402Facilitator instance.
        signer: EVM signer for verification/settlement.
        networks: Network(s) to register.
        settlement_callback: Optional callback for split distribution.

    Returns:
        Facilitator for chaining.
    """
    from .facilitator import SplitEvmScheme as SplitEvmFacilitatorScheme
    from .facilitator import SplitEvmSchemeConfig

    config = SplitEvmSchemeConfig(
        settlement_callback=settlement_callback,
    )
    scheme = SplitEvmFacilitatorScheme(signer, config)

    if isinstance(networks, str):
        networks = [networks]
    facilitator.register(networks, scheme)

    return facilitator
