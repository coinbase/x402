"""Registration helpers for EVM exact payment schemes."""

from typing import TYPE_CHECKING

from ..constants import V1_NETWORKS

if TYPE_CHECKING:
    from x402 import x402Client, x402Facilitator, x402ResourceServer
    from ..signer import ClientEvmSigner, FacilitatorEvmSigner


def register_exact_evm_client(
    client: "x402Client",
    signer: "ClientEvmSigner",
    networks: str | list[str] | None = None,
    policies: list | None = None,
) -> "x402Client":
    """Register EVM exact payment schemes to x402Client.

    Registers:
    - V2: eip155:* wildcard (or specific networks if provided)
    - V1: All supported EVM networks

    Args:
        client: x402Client instance.
        signer: EVM signer for payment authorizations.
        networks: Optional specific network(s) (default: wildcard).
        policies: Optional payment policies.

    Returns:
        Client for chaining.
    """
    from .client import ExactEvmScheme as ExactEvmClientScheme
    from .v1.client import ExactEvmSchemeV1 as ExactEvmClientSchemeV1

    scheme = ExactEvmClientScheme(signer)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            client.register(network, scheme)
    else:
        client.register("eip155:*", scheme)

    # Register V1 for all legacy networks
    v1_scheme = ExactEvmClientSchemeV1(signer)
    for network in V1_NETWORKS:
        client.register_v1(network, v1_scheme)

    if policies:
        for policy in policies:
            client.register_policy(policy)

    return client


def register_exact_evm_server(
    server: "x402ResourceServer",
    networks: str | list[str] | None = None,
) -> "x402ResourceServer":
    """Register EVM exact payment schemes to x402ResourceServer.

    V2 only (no server-side for V1).

    Args:
        server: x402ResourceServer instance.
        networks: Optional specific network(s) (default: wildcard).

    Returns:
        Server for chaining.
    """
    from .server import ExactEvmScheme as ExactEvmServerScheme

    scheme = ExactEvmServerScheme()

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            server.register(network, scheme)
    else:
        server.register("eip155:*", scheme)

    return server


def register_exact_evm_facilitator(
    facilitator: "x402Facilitator",
    signer: "FacilitatorEvmSigner",
    networks: str | list[str],
    deploy_erc4337_with_eip6492: bool = False,
) -> "x402Facilitator":
    """Register EVM exact payment schemes to x402Facilitator.

    Registers:
    - V2: Specified networks
    - V1: All supported EVM networks

    Args:
        facilitator: x402Facilitator instance.
        signer: EVM signer for verification/settlement.
        networks: Network(s) to register.
        deploy_erc4337_with_eip6492: Enable smart wallet deployment.

    Returns:
        Facilitator for chaining.
    """
    from .facilitator import ExactEvmScheme as ExactEvmFacilitatorScheme
    from .facilitator import ExactEvmSchemeConfig
    from .v1.facilitator import ExactEvmSchemeV1 as ExactEvmFacilitatorSchemeV1
    from .v1.facilitator import ExactEvmSchemeV1Config

    config = ExactEvmSchemeConfig(deploy_erc4337_with_eip6492=deploy_erc4337_with_eip6492)
    scheme = ExactEvmFacilitatorScheme(signer, config)

    if isinstance(networks, str):
        networks = [networks]
    facilitator.register(networks, scheme)

    # Register V1
    v1_config = ExactEvmSchemeV1Config(deploy_erc4337_with_eip6492=deploy_erc4337_with_eip6492)
    v1_scheme = ExactEvmFacilitatorSchemeV1(signer, v1_config)
    facilitator.register_v1(V1_NETWORKS, v1_scheme)

    return facilitator
