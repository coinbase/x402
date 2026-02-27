"""Stellar server implementation for the Exact payment scheme."""

from typing import Any

from ....schemas import PaymentRequirements
from ..constants import DEFAULT_TIMEOUT_SECONDS, DEFAULT_TOKEN_DECIMALS
from ..utils import is_stellar_network, validate_stellar_asset_address
from .constants import SCHEME_EXACT


class ExactStellarServer:
    """Stellar server for the Exact payment scheme.

    Handles price parsing and payment requirements construction
    for Stellar token payments.
    """

    scheme = SCHEME_EXACT

    def __init__(self, are_fees_sponsored: bool = True):
        self._are_fees_sponsored = are_fees_sponsored

    def create_payment_requirements(
        self,
        network: str,
        asset: str,
        pay_to: str,
        amount: str | int,
        max_timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        decimals: int = DEFAULT_TOKEN_DECIMALS,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Create PaymentRequirements for an exact Stellar payment."""
        if not is_stellar_network(network):
            raise ValueError(f"Not a Stellar network: {network}")

        if not validate_stellar_asset_address(asset):
            raise ValueError(f"Invalid Stellar asset address: {asset}")

        # Convert human-readable amount to atomic units if needed
        if isinstance(amount, (int, float)):
            atomic_amount = str(int(amount * (10 ** decimals)))
        else:
            atomic_amount = str(amount)

        return {
            "scheme": SCHEME_EXACT,
            "network": network,
            "amount": atomic_amount,
            "asset": asset,
            "payTo": pay_to,
            "maxTimeoutSeconds": max_timeout_seconds,
            "extra": {
                "areFeesSponsored": self._are_fees_sponsored,
            },
        }
