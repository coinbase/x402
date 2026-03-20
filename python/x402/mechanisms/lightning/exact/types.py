"""Lightning exact scheme types."""

from __future__ import annotations

from typing import TypedDict


class LightningExactPayload(TypedDict):
    """Inner x402 payload for Lightning ``exact`` payments."""

    invoice: str
    preimage: str  # 32-byte preimage as lowercase hex (64 chars)
