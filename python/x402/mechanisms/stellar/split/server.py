"""Stellar server implementation for the Split payment scheme."""

from typing import Any

from ..constants import DEFAULT_TIMEOUT_SECONDS, DEFAULT_TOKEN_DECIMALS
from ..utils import is_stellar_network, validate_stellar_asset_address, validate_stellar_destination_address
from .constants import SCHEME_SPLIT
from .types import StellarSplitRecipient


class SplitStellarServer:
    """Stellar server for the Split payment scheme.

    Handles price parsing and split payment requirements construction.
    """

    scheme = SCHEME_SPLIT

    def __init__(self, are_fees_sponsored: bool = True):
        self._are_fees_sponsored = are_fees_sponsored

    def create_payment_requirements(
        self,
        network: str,
        asset: str,
        pay_to: str,
        amount: str | int,
        recipients: list[dict[str, Any]],
        max_timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        decimals: int = DEFAULT_TOKEN_DECIMALS,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Create PaymentRequirements for a split Stellar payment.

        Args:
            network: CAIP-2 network identifier.
            asset: Token contract address (C-account).
            pay_to: Facilitator escrow address.
            amount: Total payment amount (human-readable or atomic).
            recipients: List of {address, bps} dicts.
            max_timeout_seconds: Max timeout in seconds.
            decimals: Token decimals (default 7 for USDC).
        """
        if not is_stellar_network(network):
            raise ValueError(f"Not a Stellar network: {network}")

        if not validate_stellar_asset_address(asset):
            raise ValueError(f"Invalid Stellar asset address: {asset}")

        # Validate recipients
        if not recipients:
            raise ValueError("At least one recipient is required")

        total_bps = 0
        for r in recipients:
            addr = r.get("address", "")
            bps = int(r.get("bps", 0))
            if not validate_stellar_destination_address(addr):
                raise ValueError(f"Invalid recipient address: {addr}")
            if bps < 1 or bps > 10000:
                raise ValueError(f"Invalid bps {bps} for {addr}")
            total_bps += bps

        if total_bps != 10000:
            raise ValueError(f"Recipient bps must sum to 10000, got {total_bps}")

        # Convert amount
        if isinstance(amount, (int, float)):
            atomic_amount = str(int(amount * (10 ** decimals)))
        else:
            atomic_amount = str(amount)

        return {
            "scheme": SCHEME_SPLIT,
            "network": network,
            "amount": atomic_amount,
            "asset": asset,
            "payTo": pay_to,
            "maxTimeoutSeconds": max_timeout_seconds,
            "extra": {
                "areFeesSponsored": self._are_fees_sponsored,
                "recipients": recipients,
            },
        }
