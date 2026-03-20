"""Lightning facilitator for the Exact payment scheme (V2)."""

from __future__ import annotations

from typing import Any

from ....interfaces import FacilitatorContext
from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import (
    ERR_AMOUNT_MISMATCH,
    ERR_INVALID_PAYLOAD,
    ERR_INVOICE_DECODE_FAILED,
    ERR_MISSING_INVOICE,
    ERR_MISSING_PREIMAGE,
    ERR_NETWORK_MISMATCH,
    ERR_PAY_TO_MISMATCH,
    ERR_PAYMENT_HASH_MISMATCH,
    ERR_REPLAY,
    ERR_UNSUPPORTED_SCHEME,
    SCHEME_EXACT,
)
from ..invoice import (
    decode_bolt11,
    lightning_network_for_bolt11_currency,
    payment_hash_from_preimage,
)
from ..utils import parse_preimage_hex


class ExactLightningScheme:
    """Verifies preimage vs BOLT11 and tracks settled payment hashes."""

    scheme = SCHEME_EXACT
    caip_family = "lightning:*"

    def __init__(self, payee_pubkey: str) -> None:
        self._payee_pubkey = payee_pubkey
        self._settled_hashes: set[str] = set()

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        _ = network
        return None

    def get_signers(self, network: Network) -> list[str]:
        _ = network
        return [self._payee_pubkey]

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context: FacilitatorContext | None = None,
    ) -> VerifyResponse:
        _ = context
        inner = payload.payload or {}
        payer_hint = _payer_from_payload(inner)

        if payload.accepted.scheme != SCHEME_EXACT or requirements.scheme != SCHEME_EXACT:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_UNSUPPORTED_SCHEME, payer=payer_hint
            )

        if str(payload.accepted.network) != str(requirements.network):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NETWORK_MISMATCH, payer=payer_hint
            )

        invoice_req = (requirements.extra or {}).get("invoice")
        if not invoice_req:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_MISSING_INVOICE, payer=payer_hint
            )

        invoice_pay = inner.get("invoice")
        if not invoice_pay or not isinstance(invoice_pay, str):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_MISSING_INVOICE, payer=payer_hint
            )
        if invoice_pay != invoice_req:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_MISSING_INVOICE, payer=payer_hint
            )

        preimage_hex = inner.get("preimage")
        if not preimage_hex or not isinstance(preimage_hex, str):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_MISSING_PREIMAGE, payer=payer_hint
            )

        try:
            preimage_bytes = parse_preimage_hex(preimage_hex)
        except ValueError as e:
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_INVALID_PAYLOAD,
                invalid_message=str(e),
                payer=payer_hint,
            )

        try:
            decoded = decode_bolt11(invoice_pay)
        except (ImportError, ValueError) as e:
            msg = str(e)
            if isinstance(e, ImportError):
                msg = "bolt11 is required to verify Lightning invoices"
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_INVOICE_DECODE_FAILED,
                invalid_message=msg,
                payer=payer_hint,
            )

        ph = payment_hash_from_preimage(preimage_bytes)
        if ph != decoded.payment_hash:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_PAYMENT_HASH_MISMATCH, payer=payer_hint
            )

        if ph in self._settled_hashes:
            return VerifyResponse(is_valid=False, invalid_reason=ERR_REPLAY, payer=payer_hint)

        expected_net = lightning_network_for_bolt11_currency(decoded.currency)
        if expected_net != str(requirements.network):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NETWORK_MISMATCH, payer=payer_hint
            )

        if decoded.amount_msat is not None and int(requirements.amount) != int(decoded.amount_msat):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_AMOUNT_MISMATCH, payer=payer_hint
            )

        if decoded.payee_pubkey and decoded.payee_pubkey != requirements.pay_to:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_PAY_TO_MISMATCH, payer=payer_hint
            )

        return VerifyResponse(is_valid=True, payer=payer_hint)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context: FacilitatorContext | None = None,
    ) -> SettleResponse:
        _ = context
        inner = payload.payload or {}
        payer_hint = _payer_from_payload(inner)

        vr = self.verify(payload, requirements)
        if not vr.is_valid:
            return SettleResponse(
                success=False,
                error_reason=vr.invalid_reason,
                error_message=vr.invalid_message,
                payer=payer_hint,
                transaction="",
                network=str(requirements.network),
            )

        preimage_hex = inner.get("preimage")
        assert isinstance(preimage_hex, str)
        preimage_bytes = parse_preimage_hex(preimage_hex)
        ph = payment_hash_from_preimage(preimage_bytes)

        if ph in self._settled_hashes:
            return SettleResponse(
                success=False,
                error_reason=ERR_REPLAY,
                payer=payer_hint,
                transaction="",
                network=str(requirements.network),
            )

        self._settled_hashes.add(ph)
        return SettleResponse(
            success=True,
            payer=payer_hint,
            transaction=ph,
            network=str(requirements.network),
        )


def _payer_from_payload(inner: dict[str, Any]) -> str:
    p = inner.get("preimage")
    if isinstance(p, str) and len(p) >= 16:
        return p[:16]
    return ""
