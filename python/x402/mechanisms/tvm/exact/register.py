"""Registration helpers for TVM exact payment schemes."""

from __future__ import annotations

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

    from ..signer import ClientTvmSigner, FacilitatorTvmSigner

# Type vars for accepting both async and sync variants
ClientT = TypeVar("ClientT", "x402Client", "x402ClientSync")
ServerT = TypeVar("ServerT", "x402ResourceServer", "x402ResourceServerSync")
FacilitatorT = TypeVar("FacilitatorT", "x402Facilitator", "x402FacilitatorSync")


def register_exact_tvm_client(
    client: ClientT,
    signer: "ClientTvmSigner",
    networks: str | list[str] | None = None,
    policies: list | None = None,
) -> ClientT:
    """Register TVM exact payment scheme to x402Client.

    Registers V2 only (no V1 for TVM).
    Client no longer needs a provider - it calls the facilitator's /prepare endpoint.

    Args:
        client: x402Client instance.
        signer: TVM signer for payment authorizations.
        networks: Optional specific network(s) (default: tvm:* wildcard).
        policies: Optional payment policies.

    Returns:
        Client for chaining.
    """
    from .client import ExactTvmScheme as ExactTvmClientScheme

    scheme = ExactTvmClientScheme(signer)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            client.register(network, scheme)
    else:
        client.register("tvm:*", scheme)

    if policies:
        for policy in policies:
            client.register_policy(policy)

    return client


def register_exact_tvm_server(
    server: ServerT,
    networks: str | list[str] | None = None,
    default_asset: str | None = None,
) -> ServerT:
    """Register TVM exact payment scheme to x402ResourceServer.

    V2 only (no server-side for V1).

    Args:
        server: x402ResourceServer instance.
        networks: Optional specific network(s) (default: tvm:* wildcard).
        default_asset: Optional default token master address.

    Returns:
        Server for chaining.
    """
    from .server import ExactTvmScheme as ExactTvmServerScheme

    kwargs: dict = {}
    if default_asset:
        kwargs["default_asset"] = default_asset

    scheme = ExactTvmServerScheme(**kwargs)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            server.register(network, scheme)
    else:
        server.register("tvm:*", scheme)

    return server


def register_exact_tvm_facilitator(
    facilitator: FacilitatorT,
    provider: "FacilitatorTvmSigner",
    networks: str | list[str] | None = None,
    config: "ExactTvmSchemeConfig | None" = None,
) -> FacilitatorT:
    """Register TVM exact payment scheme to x402Facilitator.

    V2 only (no V1 for TVM).

    Args:
        facilitator: x402Facilitator instance.
        provider: TVM provider for verification/settlement.
        networks: Network(s) to register. Default: tvm:* wildcard.
        config: Optional facilitator configuration.

    Returns:
        Facilitator for chaining.
    """
    from .facilitator import ExactTvmScheme as ExactTvmFacilitatorScheme
    from .facilitator import ExactTvmSchemeConfig

    scheme = ExactTvmFacilitatorScheme(provider, config)

    if networks is None:
        networks_list = ["tvm:*"]
    elif isinstance(networks, str):
        networks_list = [networks]
    else:
        networks_list = list(networks)

    facilitator.register(networks_list, scheme)

    return facilitator
