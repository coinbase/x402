"""Registration helpers for SVM exact payment schemes."""

from typing import TYPE_CHECKING

from ..constants import V1_NETWORKS

if TYPE_CHECKING:
    from x402 import x402Client, x402Facilitator, x402ResourceServer

    from ..signer import ClientSvmSigner, FacilitatorSvmSigner


def register_exact_svm_client(
    client: "x402Client",
    signer: "ClientSvmSigner",
    networks: str | list[str] | None = None,
    policies: list | None = None,
    rpc_url: str | None = None,
) -> "x402Client":
    """Register SVM exact payment schemes to x402Client.

    Registers:
    - V2: solana:* wildcard (or specific networks if provided)
    - V1: All supported SVM networks

    Args:
        client: x402Client instance.
        signer: SVM signer for payment authorizations.
        networks: Optional specific network(s) (default: wildcard).
        policies: Optional payment policies.
        rpc_url: Optional custom RPC URL.

    Returns:
        Client for chaining.
    """
    from .client import ExactSvmScheme as ExactSvmClientScheme
    from .v1.client import ExactSvmSchemeV1 as ExactSvmClientSchemeV1

    scheme = ExactSvmClientScheme(signer, rpc_url)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            client.register(network, scheme)
    else:
        client.register("solana:*", scheme)

    # Register V1 for all legacy networks
    v1_scheme = ExactSvmClientSchemeV1(signer, rpc_url)
    for network in V1_NETWORKS:
        client.register_v1(network, v1_scheme)

    if policies:
        for policy in policies:
            client.register_policy(policy)

    return client


def register_exact_svm_server(
    server: "x402ResourceServer",
    networks: str | list[str] | None = None,
) -> "x402ResourceServer":
    """Register SVM exact payment schemes to x402ResourceServer.

    V2 only (no server-side for V1).

    Args:
        server: x402ResourceServer instance.
        networks: Optional specific network(s) (default: wildcard).

    Returns:
        Server for chaining.
    """
    from .server import ExactSvmScheme as ExactSvmServerScheme

    scheme = ExactSvmServerScheme()

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            server.register(network, scheme)
    else:
        server.register("solana:*", scheme)

    return server


def register_exact_svm_facilitator(
    facilitator: "x402Facilitator",
    signer: "FacilitatorSvmSigner",
    networks: str | list[str],
) -> "x402Facilitator":
    """Register SVM exact payment schemes to x402Facilitator.

    Registers:
    - V2: Specified networks
    - V1: All supported SVM networks

    Args:
        facilitator: x402Facilitator instance.
        signer: SVM signer for verification/settlement.
        networks: Network(s) to register.

    Returns:
        Facilitator for chaining.
    """
    from .facilitator import ExactSvmScheme as ExactSvmFacilitatorScheme
    from .v1.facilitator import ExactSvmSchemeV1 as ExactSvmFacilitatorSchemeV1

    scheme = ExactSvmFacilitatorScheme(signer)

    if isinstance(networks, str):
        networks = [networks]
    facilitator.register(networks, scheme)

    # Register V1
    v1_scheme = ExactSvmFacilitatorSchemeV1(signer)
    facilitator.register_v1(V1_NETWORKS, v1_scheme)

    return facilitator
