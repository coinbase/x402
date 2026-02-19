"""Exact scheme server implementation for Hypercore L1."""

import re
from collections.abc import Callable

from x402.schemas import (
    AssetAmount,
    Network,
    PaymentRequirements,
    SupportedKind,
)

from ..constants import NETWORK_CONFIGS, SCHEME_EXACT

# Type alias for money parser
MoneyParser = Callable[[float, str], AssetAmount | None]


class ExactHypercoreScheme:
    """Server scheme for Hypercore L1 exact payments."""

    def __init__(self):
        """Initialize server scheme."""
        self.scheme = SCHEME_EXACT
        self._money_parsers: list[MoneyParser] = []

    def register_money_parser(self, parser: MoneyParser) -> "ExactHypercoreScheme":
        """Register custom money parser in the parser chain.

        Multiple parsers can be registered - tried in registration order.
        Each parser receives decimal amount (e.g., 1.50 for $1.50).
        If parser returns None, next parser is tried.
        Default parser is always the final fallback.

        Args:
            parser: Custom function to convert amount to AssetAmount.

        Returns:
            Self for chaining.
        """
        self._money_parsers.append(parser)
        return self

    def parse_price(self, price: str | float | AssetAmount, network: Network) -> AssetAmount:
        """Parse price into asset amount.

        If price is already AssetAmount, returns it directly.
        If price is Money (str|float), parses and tries custom parsers.
        Falls back to default conversion.

        Args:
            price: Price to parse (string, number, or AssetAmount dict).
            network: Network identifier.

        Returns:
            AssetAmount with amount, asset, and extra fields.

        Raises:
            ValueError: If asset address is missing for AssetAmount input.
        """
        # Already an AssetAmount (dict with 'amount' key)
        if isinstance(price, dict) and "amount" in price:
            if not price.get("asset"):
                raise ValueError(f"Asset required for AssetAmount on {network}")
            return AssetAmount(
                amount=price["amount"],
                asset=price["asset"],
                extra=price.get("extra", {}),
            )

        # Already an AssetAmount object
        if isinstance(price, AssetAmount):
            if not price.asset:
                raise ValueError(f"Asset required for AssetAmount on {network}")
            return price

        # Parse Money to decimal
        decimal_amount = self._parse_money_to_decimal(price)

        # Try custom parsers
        for parser in self._money_parsers:
            result = parser(decimal_amount, str(network))
            if result is not None:
                return result

        # Default conversion
        return self._default_money_conversion(decimal_amount, str(network))

    def _parse_money_to_decimal(self, money: str | float) -> float:
        """Parse Money to decimal number.

        Args:
            money: Money value to parse.

        Returns:
            Decimal amount.

        Raises:
            ValueError: If money format is invalid.
        """
        if isinstance(money, (int, float)):
            return float(money)

        price_str = str(money)
        match = re.search(r"[\d.]+", price_str)
        if not match:
            raise ValueError(f"Invalid money format: {price_str}")

        return float(match.group())

    def _default_money_conversion(self, amount: float, network: str) -> AssetAmount:
        """Convert decimal amount to default AssetAmount.

        Args:
            amount: Decimal amount (e.g., 1.50).
            network: Network identifier.

        Returns:
            AssetAmount in default token.

        Raises:
            ValueError: If network has no default asset configured.
        """
        config = NETWORK_CONFIGS.get(network)
        if not config:
            raise ValueError(f"No default asset configured for network {network}")

        asset = config["default_asset"]
        token_amount = int(amount * (10 ** asset["decimals"]))

        return AssetAmount(
            amount=str(token_amount),
            asset=asset["token"],
            extra={"name": asset["name"]},
        )

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        facilitator_extensions: list[str],
    ) -> PaymentRequirements:
        """Enhance payment requirements with Hypercore-specific metadata.

        Args:
            requirements: Base payment requirements.
            supported_kind: Supported kind from facilitator.
            facilitator_extensions: List of facilitator extensions.

        Returns:
            Enhanced payment requirements with extra metadata.
        """
        extra = requirements.extra or {}
        extra["signatureChainId"] = 999
        extra["isMainnet"] = str(supported_kind.network) == "hypercore:mainnet"
        requirements.extra = extra

        return requirements
