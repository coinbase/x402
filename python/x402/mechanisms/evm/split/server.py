"""EVM server implementation for the Split payment scheme."""

from collections.abc import Callable

from ....schemas import AssetAmount, Network, PaymentRequirements, Price, SupportedKind
from ..utils import (
    get_asset_info,
    get_network_config,
    parse_amount,
    parse_money_to_decimal,
)
from .constants import SCHEME_SPLIT
from .types import SplitConfig

# Type alias for money parser (sync)
MoneyParser = Callable[[float, str], AssetAmount | None]


class SplitEvmScheme:
    """EVM server implementation for the Split payment scheme.

    Parses prices and enhances payment requirements with split recipients
    and EIP-712 domain info.

    Attributes:
        scheme: The scheme identifier ("split").
    """

    scheme = SCHEME_SPLIT

    def __init__(self) -> None:
        """Create SplitEvmScheme."""
        self._money_parsers: list[MoneyParser] = []

    def register_money_parser(self, parser: MoneyParser) -> "SplitEvmScheme":
        """Register custom money parser.

        Args:
            parser: Custom function to convert amount to AssetAmount.

        Returns:
            Self for chaining.
        """
        self._money_parsers.append(parser)
        return self

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        """Parse price into asset amount.

        Same as exact scheme — parses total price.

        Args:
            price: Price to parse (string, number, or AssetAmount dict).
            network: Network identifier.

        Returns:
            AssetAmount with amount, asset, and extra fields.
        """
        # Already an AssetAmount (dict with 'amount' key)
        if isinstance(price, dict) and "amount" in price:
            if not price.get("asset"):
                raise ValueError(f"Asset address required for AssetAmount on {network}")
            return AssetAmount(
                amount=price["amount"],
                asset=price["asset"],
                extra=price.get("extra", {}),
            )

        # Already an AssetAmount object
        if isinstance(price, AssetAmount):
            if not price.asset:
                raise ValueError(f"Asset address required for AssetAmount on {network}")
            return price

        # Parse Money to decimal
        decimal_amount = parse_money_to_decimal(price)

        # Try custom parsers
        for parser in self._money_parsers:
            result = parser(decimal_amount, str(network))
            if result is not None:
                return result

        # Default: convert to USDC
        return self._default_money_conversion(decimal_amount, str(network))

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        extension_keys: list[str],
    ) -> PaymentRequirements:
        """Add split-specific enhancements to payment requirements.

        - Validates split recipients if present
        - Fills in default asset if not specified
        - Adds EIP-712 domain parameters
        - Converts decimal amounts to smallest unit

        Args:
            requirements: Base payment requirements.
            supported_kind: Supported kind from facilitator.
            extension_keys: Extension keys being used.

        Returns:
            Enhanced payment requirements with validated split config.
        """
        config = get_network_config(str(requirements.network))

        # Default asset
        if not requirements.asset:
            requirements.asset = config["default_asset"]["address"]

        asset_info = get_asset_info(str(requirements.network), requirements.asset)

        # Ensure amount is in smallest unit
        if "." in requirements.amount:
            requirements.amount = str(parse_amount(requirements.amount, asset_info["decimals"]))

        # Add EIP-712 domain params
        if requirements.extra is None:
            requirements.extra = {}
        if "name" not in requirements.extra:
            requirements.extra["name"] = asset_info["name"]
        if "version" not in requirements.extra:
            requirements.extra["version"] = asset_info["version"]

        # Validate split recipients if present
        if "recipients" in requirements.extra:
            split_config = SplitConfig.from_dict_list(requirements.extra["recipients"])
            split_config.validate()

        return requirements

    def _default_money_conversion(self, amount: float, network: str) -> AssetAmount:
        """Convert decimal amount to USDC AssetAmount.

        Args:
            amount: Decimal amount (e.g., 1.50).
            network: Network identifier.

        Returns:
            AssetAmount in USDC.
        """
        config = get_network_config(network)
        asset = config["default_asset"]

        token_amount = int(amount * (10 ** asset["decimals"]))

        return AssetAmount(
            amount=str(token_amount),
            asset=asset["address"],
            extra={"name": asset["name"], "version": asset["version"]},
        )
