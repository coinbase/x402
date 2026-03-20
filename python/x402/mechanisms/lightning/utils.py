"""Lightning mechanism helpers (sync)."""

from __future__ import annotations

import hashlib
import hmac
import re
from decimal import Decimal, InvalidOperation

from .constants import LIGHTNING_NETWORKS, MSAT_PER_BTC

# Shared with ``MockLightningBackend`` / client preimage derivation for tests.
MOCK_PREIMAGE_HMAC_KEY = b"x402-lightning-mock-preimage-v1"


def is_lightning_network(network: str) -> bool:
    """Return True if network is a known lightning:* identifier."""
    return network in LIGHTNING_NETWORKS


def money_to_btc_msat(price: str | int | float) -> int:
    """Interpret Money as a BTC amount and convert to millisatoshis.

    Rejects strings containing '$' to avoid implicit USD FX conversion.

    Args:
        price: Numeric or string without currency symbols (BTC amount).

    Raises:
        ValueError: If '$' is present or value cannot be parsed as BTC.
    """
    if isinstance(price, str):
        if "$" in price:
            raise ValueError(
                "USD-denominated prices are not supported for Lightning; "
                "use an explicit BTC AssetAmount or a numeric BTC amount without '$'"
            )
        clean = price.strip()
        if not clean:
            raise ValueError("Empty price string")
    else:
        clean = str(price)

    try:
        btc = Decimal(clean)
    except InvalidOperation as e:
        raise ValueError(f"Invalid BTC amount: {price!r}") from e

    if btc < 0:
        raise ValueError("BTC amount must be non-negative")

    # Decimal -> msat without float precision loss for reasonable inputs
    msat_dec = btc * Decimal(MSAT_PER_BTC)
    if msat_dec != msat_dec.to_integral_value():
        raise ValueError("BTC amount must resolve to a whole millisatoshi amount")
    return int(msat_dec)


def parse_preimage_hex(preimage: str) -> bytes:
    """Parse a 32-byte preimage from hex string."""
    h = preimage.strip().lower()
    if h.startswith("0x"):
        h = h[2:]
    if not re.fullmatch(r"[0-9a-f]{64}", h):
        raise ValueError("preimage must be 64 hex characters (32 bytes)")
    return bytes.fromhex(h)


def derive_mock_preimage(network: str, amount_msat: int, payee_pubkey: str) -> bytes:
    """Deterministic 32-byte preimage for mock / test Lightning flows.

    Must match the preimage used when building the mock BOLT11 invoice for the
    same ``network``, ``amount_msat``, and payee pubkey.
    """
    msg = f"{network}|{amount_msat}|{payee_pubkey}".encode()
    return hmac.new(MOCK_PREIMAGE_HMAC_KEY, msg, hashlib.sha256).digest()
