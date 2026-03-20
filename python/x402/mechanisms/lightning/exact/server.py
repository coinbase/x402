"""Lightning server for the Exact payment scheme (V2)."""

from __future__ import annotations

from ....schemas import AssetAmount, Network, PaymentRequirements, Price, SupportedKind
from ..backends.base import LightningInvoiceBackend
from ..constants import ASSET_BTC, SCHEME_EXACT
from ..utils import money_to_btc_msat


class ExactLightningScheme:
    """Parses BTC/msat prices and attaches BOLT11 invoices via a backend."""

    scheme = SCHEME_EXACT

    def __init__(self, backend: LightningInvoiceBackend) -> None:
        self._backend = backend

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        if isinstance(price, dict) and "amount" in price:
            return AssetAmount(
                amount=price["amount"],
                asset=price.get("asset") or ASSET_BTC,
                extra=price.get("extra"),
            )

        if isinstance(price, AssetAmount):
            return price

        # Money → interpret as BTC → msat (reject '$' inside strings)
        if isinstance(price, str) and "$" in price:
            raise ValueError(
                "USD-denominated prices are not supported for Lightning; "
                "use BTC amounts or an explicit AssetAmount"
            )
        msat = money_to_btc_msat(price)
        return AssetAmount(amount=str(msat), asset=ASSET_BTC, extra={})

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind: SupportedKind,
        extension_keys: list[str],
    ) -> PaymentRequirements:
        _ = (supported_kind, extension_keys)

        requirements.asset = ASSET_BTC
        amount_msat = int(requirements.amount)
        invoice, pubkey = self._backend.create_invoice(
            network=str(requirements.network),
            amount_msat=amount_msat,
        )
        requirements.pay_to = pubkey
        if requirements.extra is None:
            requirements.extra = {}
        requirements.extra["invoice"] = invoice
        return requirements
