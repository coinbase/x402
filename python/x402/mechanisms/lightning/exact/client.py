"""Lightning client for the Exact payment scheme (V2)."""

from __future__ import annotations

from typing import Any

from ....schemas import PaymentRequirements
from ..constants import SCHEME_EXACT
from ..invoice import decode_bolt11, payment_hash_from_preimage
from ..utils import derive_mock_preimage, parse_preimage_hex


class ExactLightningScheme:
    """Builds preimage + invoice payloads for Lightning ``exact`` (V2).

    Expects ``requirements.extra["invoice"]`` from the resource server. The
    preimage is derived with :func:`x402.mechanisms.lightning.utils.derive_mock_preimage`
    for the mock backend; production clients should supply preimage from their
    wallet after paying the invoice (inject via ``preimage_fn``).
    """

    scheme = SCHEME_EXACT

    def __init__(
        self,
        preimage_fn: Any | None = None,
    ) -> None:
        """Create ExactLightningScheme.

        Args:
            preimage_fn: Optional ``Callable[[PaymentRequirements], str]`` returning
                preimage hex. When omitted, uses deterministic mock derivation
                (must match server-side mock backend).
        """
        self._preimage_fn = preimage_fn

    def create_payment_payload(
        self,
        requirements: PaymentRequirements,
    ) -> dict[str, Any]:
        extra = requirements.extra or {}
        invoice = extra.get("invoice")
        if not invoice or not isinstance(invoice, str):
            raise ValueError("payment requirements missing extra.invoice (BOLT11 string)")

        if self._preimage_fn is not None:
            preimage_hex = self._preimage_fn(requirements)
        else:
            preimage_bytes = derive_mock_preimage(
                str(requirements.network),
                int(requirements.amount),
                requirements.pay_to,
            )
            preimage_hex = preimage_bytes.hex()

        parse_preimage_hex(preimage_hex)  # validate 32-byte hex

        decoded = decode_bolt11(invoice)
        if decoded.payment_hash != payment_hash_from_preimage(bytes.fromhex(preimage_hex)):
            raise ValueError("preimage does not match BOLT11 payment hash")

        return {"invoice": invoice, "preimage": preimage_hex}
