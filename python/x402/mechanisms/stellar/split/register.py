"""Registration helpers for Stellar split scheme."""

from stellar_sdk import Keypair

from .facilitator import SplitStellarScheme
from .server import SplitStellarServer


def register_stellar_split_facilitator(
    keypair: Keypair,
    rpc_url: str | None = None,
    are_fees_sponsored: bool = True,
    max_fee_stroops: int = 50_000,
) -> SplitStellarScheme:
    """Create and return a Stellar split facilitator."""
    return SplitStellarScheme(
        keypair=keypair,
        rpc_url=rpc_url,
        are_fees_sponsored=are_fees_sponsored,
        max_fee_stroops=max_fee_stroops,
    )


def register_stellar_split_server(
    are_fees_sponsored: bool = True,
) -> SplitStellarServer:
    """Create and return a Stellar split server."""
    return SplitStellarServer(are_fees_sponsored=are_fees_sponsored)
