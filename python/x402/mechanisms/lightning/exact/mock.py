"""Deterministic mock Lightning backend for tests (BOLT11 + preimage)."""

from __future__ import annotations

import hashlib

from ..backends.base import LightningInvoiceBackend
from ..constants import MOCK_LIGHTNING_PAYEE_PUBKEY
from ..invoice import payment_hash_from_preimage
from ..utils import derive_mock_preimage

# Private key used only by the mock backend (64 hex chars). Payee pubkey is ``MOCK_LIGHTNING_PAYEE_PUBKEY``.
_MOCK_SIGNING_PRIVATE_KEY_HEX = "11" * 32

# Fixed invoice metadata for reproducible strings in tests
_MOCK_INVOICE_DATE = 1_700_000_000
_MOCK_DESCRIPTION = "x402-mock"


def _bolt11_currency(network: str) -> str:
    if network == "lightning:mainnet":
        return "bc"
    if network == "lightning:testnet":
        return "tb"
    if network == "lightning:regtest":
        return "bcrt"
    raise ValueError(f"Unsupported Lightning network: {network}")


class MockLightningBackend(LightningInvoiceBackend):
    """Build valid BOLT11 invoices with preimage = HMAC(network, amount_msat, payee).

    The payee node pubkey is fixed (``MOCK_LIGHTNING_PAYEE_PUBKEY``) and matches
    the signing key ``_MOCK_SIGNING_PRIVATE_KEY_HEX``.
    """

    def create_invoice(self, *, network: str, amount_msat: int) -> tuple[str, str]:
        try:
            import bolt11
            from bolt11 import Bolt11, MilliSatoshi, encode
            from bolt11.models.features import Feature, Features, FeatureState
            from bolt11.models.tags import TagChar, Tags
        except ImportError as e:
            raise ImportError(
                "Mock Lightning backend requires bolt11. Install with: pip install x402[lightning]"
            ) from e

        payee = MOCK_LIGHTNING_PAYEE_PUBKEY
        preimage = derive_mock_preimage(network, amount_msat, payee)
        payment_hash_hex = payment_hash_from_preimage(preimage)
        payment_secret = hashlib.sha256(b"payment_secret|" + preimage).hexdigest()

        tags = Tags()
        tags.add(TagChar.payment_hash, payment_hash_hex)
        tags.add(TagChar.payment_secret, payment_secret)
        tags.add(TagChar.description, _MOCK_DESCRIPTION)
        tags.add(TagChar.expire_time, 3600)
        tags.add(TagChar.min_final_cltv_expiry, 18)
        tags.add(
            TagChar.features,
            Features.from_feature_list({Feature.payment_secret: FeatureState.required}),
        )

        currency = _bolt11_currency(network)
        inv = Bolt11(
            currency=currency,
            date=_MOCK_INVOICE_DATE,
            tags=tags,
            amount_msat=MilliSatoshi(amount_msat),
        )
        bolt11_str = encode(
            inv,
            private_key=_MOCK_SIGNING_PRIVATE_KEY_HEX,
            keep_payee=True,
        )
        # Sanity check (optional)
        _ = bolt11.decode(bolt11_str)
        return bolt11_str, payee
