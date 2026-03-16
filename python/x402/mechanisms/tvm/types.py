"""TVM-specific payload and data types."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


@dataclass
class TvmPaymentPayload:
    """TON-specific payment payload sent by the client.

    In the self-relay architecture, the client sends:
    - A signed W5 internal_signed BoC (wrapped in external message for transport)
    - Their public key for verification
    """

    sender: str  # "from" in JSON
    to: str
    token_master: str
    amount: str
    valid_until: int
    nonce: str
    settlement_boc: str = ""
    wallet_public_key: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "from": self.sender,
            "to": self.to,
            "tokenMaster": self.token_master,
            "amount": self.amount,
            "validUntil": self.valid_until,
            "nonce": self.nonce,
            "settlementBoc": self.settlement_boc,
            "walletPublicKey": self.wallet_public_key,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TvmPaymentPayload:
        """Create from dictionary."""
        return cls(
            sender=data.get("from", ""),
            to=data.get("to", ""),
            token_master=data.get("tokenMaster", ""),
            amount=data.get("amount", ""),
            valid_until=int(data.get("validUntil", 0)),
            nonce=data.get("nonce", ""),
            settlement_boc=data.get("settlementBoc", ""),
            wallet_public_key=data.get("walletPublicKey", ""),
        )


@dataclass
class W5ParsedMessage:
    """Parsed contents of a W5 external message."""

    seqno: int
    valid_until: int
    internal_messages: list[dict[str, Any]]
    raw_body_hash: str


@dataclass
class JettonTransferInfo:
    """Extracted jetton transfer details from an internal message."""

    destination: str
    amount: int
    response_destination: str | None = None
    forward_ton_amount: int = 0
    jetton_wallet: str = ""


@dataclass
class VerifyResult:
    """Result of a single verification check."""

    ok: bool
    reason: str = ""


class PaymentState(str, Enum):
    """Payment lifecycle states."""

    SEEN = "seen"
    VERIFIED = "verified"
    SETTLING = "settling"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    EXPIRED = "expired"
