"""ERC-4337 server implementation for the Exact payment scheme."""

from ....schemas import AssetAmount, Network, PaymentRequirements, Price, SupportedKind
from ..erc4337_networks import ERC4337_SUPPORTED_CHAINS, get_erc4337_chain, resolve_erc4337_chain_id
from ..erc4337_types import extract_user_operation_capability
from .server import ExactEvmScheme


class ExactEvmSchemeERC4337(ExactEvmScheme):
    """ERC-4337 server for the Exact payment scheme.

    Extends ExactEvmScheme with:
    - Preservation of UserOperation capability in payment requirements
    - Extended network support from ERC-4337 registry

    Attributes:
        scheme: The scheme identifier ("exact").
    """

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        extension_keys: list[str],
    ) -> PaymentRequirements:
        """Enhance requirements while preserving UserOperation capability.

        Args:
            requirements: Base payment requirements.
            supported_kind: Supported kind from facilitator.
            extension_keys: Extension keys being used.

        Returns:
            Enhanced payment requirements with UserOperation preserved.
        """
        # Extract userOperation capability before enhancement
        user_op_cap = extract_user_operation_capability(getattr(requirements, "extra", None))

        # Try parent enhancement
        try:
            enhanced = super().enhance_payment_requirements(
                requirements, supported_kind, extension_keys
            )
        except (ValueError, KeyError):
            # Parent failed — try ERC-4337 registry
            enhanced = self._enhance_from_erc4337_registry(
                requirements, supported_kind, extension_keys
            )

        # Preserve userOperation capability if present
        if user_op_cap is not None:
            if enhanced.extra is None:
                enhanced.extra = {}
            enhanced.extra["userOperation"] = {
                "supported": user_op_cap.supported,
                "bundlerUrl": user_op_cap.bundler_url,
                "paymaster": user_op_cap.paymaster,
                "entrypoint": user_op_cap.entrypoint,
            }

        return enhanced

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        """Parse price with extended ERC-4337 network support.

        Args:
            price: Price to parse.
            network: Network identifier.

        Returns:
            AssetAmount with amount, asset, and extra fields.
        """
        try:
            return super().parse_price(price, network)
        except (ValueError, KeyError):
            pass

        # Try ERC-4337 registry
        try:
            chain_id = resolve_erc4337_chain_id(str(network))
            chain = get_erc4337_chain(chain_id)
            if chain:
                return AssetAmount(
                    amount=str(price),
                    asset=chain.usdc_address,
                    extra={"name": "USD Coin", "version": "2"},
                )
        except ValueError:
            pass

        raise ValueError(f"Unsupported network: {network}")

    def _enhance_from_erc4337_registry(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        extension_keys: list[str],
    ) -> PaymentRequirements:
        """Enhance using ERC-4337 network registry."""
        network_str = str(requirements.network)
        chain_id = resolve_erc4337_chain_id(network_str)
        chain = get_erc4337_chain(chain_id)
        if chain is None:
            raise ValueError(f"Chain {chain_id} not in ERC-4337 registry")

        if not requirements.asset:
            requirements.asset = chain.usdc_address

        if requirements.extra is None:
            requirements.extra = {}
        if "name" not in requirements.extra:
            requirements.extra["name"] = "USD Coin"
        if "version" not in requirements.extra:
            requirements.extra["version"] = "2"

        return requirements

    def get_supported_networks(self) -> list[str]:
        """Return all supported networks including ERC-4337 registry."""
        networks = set()

        # Add ERC-4337 registry networks
        for chain in ERC4337_SUPPORTED_CHAINS.values():
            networks.add(chain.caip2)

        return list(networks)
