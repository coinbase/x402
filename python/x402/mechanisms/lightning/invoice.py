"""BOLT11 invoice decoding (optional bolt11 extra)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DecodedBolt11:
    """Fields used by the Lightning exact facilitator."""

    currency: str
    """BOLT11 currency code (``bc``, ``tb``, ``bcrt``)."""

    payment_hash: str
    """Lowercase hex payment hash (32 bytes)."""

    amount_msat: int | None
    """Millisatoshi amount when encoded on the invoice; None if unknown."""

    payee_pubkey: str | None
    """Destination pubkey hex if present."""


def _require_bolt11() -> Any:
    try:
        import bolt11
    except ImportError as e:
        raise ImportError(
            "BOLT11 support requires the bolt11 package. Install with: pip install x402[lightning]"
        ) from e
    return bolt11


def decode_bolt11(bolt11_str: str) -> DecodedBolt11:
    """Decode a BOLT11 invoice and extract payment hash, amount (msat), and payee.

    Args:
        bolt11_str: Lightning payment request string.

    Returns:
        DecodedBolt11 with payment_hash, optional amount_msat, optional payee pubkey.

    Raises:
        ImportError: If bolt11 is not installed.
        ValueError: If decoding fails.
    """
    bolt11 = _require_bolt11()
    try:
        inv = bolt11.decode(bolt11_str)
    except Exception as e:
        raise ValueError(f"Invalid BOLT11 invoice: {e}") from e

    ph = getattr(inv, "payment_hash", None)
    if ph is None:
        raise ValueError("BOLT11 invoice missing payment_hash")
    payment_hash = str(ph).lower()
    if len(payment_hash) != 64 or any(c not in "0123456789abcdef" for c in payment_hash):
        raise ValueError("Invalid payment_hash from BOLT11 decoder")

    amount_msat: int | None
    raw_msat = getattr(inv, "amount_msat", None)
    if raw_msat is not None:
        amount_msat = int(raw_msat)
    else:
        amount_sat = getattr(inv, "amount", None)
        if amount_sat is None:
            amount_msat = None
        else:
            amount_msat = int(amount_sat) * 1000

    payee = getattr(inv, "payee", None)
    payee_pubkey = str(payee) if payee else None

    currency = str(getattr(inv, "currency", "") or "")

    return DecodedBolt11(
        currency=currency,
        payment_hash=payment_hash,
        amount_msat=amount_msat,
        payee_pubkey=payee_pubkey,
    )


def payment_hash_from_preimage(preimage: bytes) -> str:
    """Compute BOLT11 payment hash (SHA256 of preimage) as lowercase hex."""
    return hashlib.sha256(preimage).hexdigest()


def lightning_network_for_bolt11_currency(currency: str) -> str:
    """Map BOLT11 currency code to ``lightning:*`` network id."""
    if currency == "bc":
        return "lightning:mainnet"
    if currency == "tb":
        return "lightning:testnet"
    if currency == "bcrt":
        return "lightning:regtest"
    raise ValueError(f"Unsupported BOLT11 currency: {currency!r}")
