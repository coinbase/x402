"""TVM server implementation for the Exact payment scheme."""

from __future__ import annotations

from typing import Any

from ..constants import DEFAULT_DECIMALS, SCHEME_EXACT, USDT_MASTER


class ExactTvmScheme:
    """TVM server for the 'exact' payment scheme.

    Implements the SchemeNetworkServer protocol from x402 SDK.

    Attributes:
        scheme: The scheme identifier ("exact").
    """

    scheme = SCHEME_EXACT

    def __init__(self, default_asset: str = USDT_MASTER):
        self._default_asset = default_asset

    def parse_price(self, price: str | float | dict, network: str) -> dict[str, Any]:
        """Convert USD price to USDT nano amount.

        USDT on TON has 6 decimals, so $0.01 = 10000 nano.

        Args:
            price: Price as string ("$0.01", "0.01"), float, or AssetAmount dict.
            network: Network identifier (unused, kept for interface).

        Returns:
            AssetAmount dict with 'amount' and 'asset'.
        """
        # Pass-through for AssetAmount dicts
        if isinstance(price, dict) and "amount" in price:
            if not price.get("asset"):
                raise ValueError(f"Asset address required for AssetAmount on {network}")
            return {
                "amount": price["amount"],
                "asset": price["asset"],
                "extra": price.get("extra", {}),
            }

        if isinstance(price, str):
            clean = price.replace("$", "").strip()
            usd = float(clean)
        else:
            usd = float(price)

        nano = int(usd * (10 ** DEFAULT_DECIMALS))

        return {
            "amount": str(nano),
            "asset": self._default_asset,
        }

    def enhance_payment_requirements(
        self,
        requirements: dict[str, Any],
        supported_kind: dict[str, Any] | None = None,
        extensions: list[str] | None = None,
    ) -> dict[str, Any]:
        """Add TVM-specific fields to payment requirements.

        Args:
            requirements: Base payment requirements.
            supported_kind: Supported kind from facilitator (may have facilitatorUrl).
            extensions: List of enabled extension keys.

        Returns:
            Enhanced requirements dict.
        """
        extra = dict(requirements.get("extra", {}))

        if supported_kind and supported_kind.get("extra"):
            sk_extra = supported_kind["extra"]
            if "facilitatorUrl" in sk_extra:
                extra["facilitatorUrl"] = sk_extra["facilitatorUrl"]

        requirements = dict(requirements)
        requirements["extra"] = extra
        return requirements
