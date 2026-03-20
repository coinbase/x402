"""Registration helpers for Lightning exact payment schemes."""

from __future__ import annotations

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

ClientT = TypeVar("ClientT", "x402Client", "x402ClientSync")
ServerT = TypeVar("ServerT", "x402ResourceServer", "x402ResourceServerSync")
FacilitatorT = TypeVar("FacilitatorT", "x402Facilitator", "x402FacilitatorSync")


def register_exact_lightning_client(
    client: ClientT,
    networks: str | list[str] | None = None,
    policies: list | None = None,
    preimage_fn: Any | None = None,
) -> ClientT:
    """Register Lightning exact payment schemes on ``x402Client`` (V2).

    Registers ``lightning:*`` by default, or explicit network ids.

    Args:
        client: x402 client instance.
        networks: Optional list of ``lightning:mainnet|testnet|regtest`` or wildcard.
        policies: Optional payment policies.
        preimage_fn: Optional callable ``(PaymentRequirements) -> preimage_hex``.

    Returns:
        The client instance for chaining.
    """
    from .client import ExactLightningScheme as ExactLightningClientScheme

    scheme = ExactLightningClientScheme(preimage_fn=preimage_fn)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            client.register(network, scheme)
    else:
        client.register("lightning:*", scheme)

    if policies:
        for policy in policies:
            client.register_policy(policy)

    return client


def register_exact_lightning_server(
    server: ServerT,
    backend: Any,
    networks: str | list[str] | None = None,
) -> ServerT:
    """Register Lightning exact scheme on ``x402ResourceServer`` (V2).

    Args:
        server: Resource server instance.
        backend: :class:`~x402.mechanisms.lightning.backends.base.LightningInvoiceBackend`.
        networks: Optional explicit networks or default ``lightning:*``.

    Returns:
        The server instance for chaining.
    """
    from .server import ExactLightningScheme as ExactLightningServerScheme

    scheme = ExactLightningServerScheme(backend)

    if networks:
        if isinstance(networks, str):
            networks = [networks]
        for network in networks:
            server.register(network, scheme)
    else:
        server.register("lightning:*", scheme)

    return server


def register_exact_lightning_facilitator(
    facilitator: FacilitatorT,
    payee_pubkey: str,
    networks: str | list[str],
) -> FacilitatorT:
    """Register Lightning exact facilitator (V2).

    Args:
        facilitator: Facilitator instance.
        payee_pubkey: Expected destination pubkey hex (must match invoices).
        networks: One or more ``lightning:...`` ids to register.

    Returns:
        The facilitator instance for chaining.
    """
    from .facilitator import ExactLightningScheme as ExactLightningFacilitatorScheme

    scheme = ExactLightningFacilitatorScheme(payee_pubkey)

    if isinstance(networks, str):
        networks = [networks]
    facilitator.register(networks, scheme)

    return facilitator
