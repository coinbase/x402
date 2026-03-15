"""TVM-specific payload and data types."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


@dataclass
class SignedW5Message:
    """A signed W5 internal message (from TONAPI gasless flow)."""

    address: str
    amount: str
    payload: str = ""
    state_init: str | None = None


@dataclass
class TvmPaymentPayload:
    """TON-specific payment payload sent by the client."""

    sender: str  # "from" in JSON
    to: str
    token_master: str
    amount: str
    valid_until: int
    nonce: str
    signed_messages: list[SignedW5Message] = field(default_factory=list)
    commission: str = "0"
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
            "signedMessages": [
                {
                    "address": m.address,
                    "amount": m.amount,
                    "payload": m.payload,
                    **({"stateInit": m.state_init} if m.state_init else {}),
                }
                for m in self.signed_messages
            ],
            "commission": self.commission,
            "settlementBoc": self.settlement_boc,
            "walletPublicKey": self.wallet_public_key,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TvmPaymentPayload:
        """Create from dictionary."""
        signed_msgs = [
            SignedW5Message(
                address=m.get("address", ""),
                amount=m.get("amount", ""),
                payload=m.get("payload", ""),
                state_init=m.get("stateInit"),
            )
            for m in data.get("signedMessages", [])
        ]
        return cls(
            sender=data.get("from", ""),
            to=data.get("to", ""),
            token_master=data.get("tokenMaster", ""),
            amount=data.get("amount", ""),
            valid_until=int(data.get("validUntil", 0)),
            nonce=data.get("nonce", ""),
            signed_messages=signed_msgs,
            commission=data.get("commission", "0"),
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
