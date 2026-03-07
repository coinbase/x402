"""Registration helpers for Stellar exact scheme."""

from stellar_sdk import Keypair

from .client import ExactStellarClient
from .facilitator import ExactStellarScheme
from .server import ExactStellarServer


def register_stellar_exact_client(
    keypair: Keypair,
    rpc_url: str | None = None,
) -> ExactStellarClient:
    """Create and return a Stellar exact client."""
    return ExactStellarClient(keypair=keypair, rpc_url=rpc_url)


def register_stellar_exact_facilitator(
    keypair: Keypair,
    rpc_url: str | None = None,
    are_fees_sponsored: bool = True,
    max_fee_stroops: int = 50_000,
) -> ExactStellarScheme:
    """Create and return a Stellar exact facilitator."""
    return ExactStellarScheme(
        keypair=keypair,
        rpc_url=rpc_url,
        are_fees_sponsored=are_fees_sponsored,
        max_fee_stroops=max_fee_stroops,
    )


def register_stellar_exact_server(
    are_fees_sponsored: bool = True,
) -> ExactStellarServer:
    """Create and return a Stellar exact server."""
    return ExactStellarServer(are_fees_sponsored=are_fees_sponsored)
