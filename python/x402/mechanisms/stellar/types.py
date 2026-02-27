"""Types for Stellar x402 mechanisms."""

from dataclasses import dataclass
from typing import Any


@dataclass
class ExactStellarPayloadV2:
    """Exact Stellar payload containing a base64-encoded Stellar transaction."""

    transaction: str

    @classmethod
    def from_dict(cls, data: dict[str, Any] | str) -> "ExactStellarPayloadV2":
        if isinstance(data, str):
            return cls(transaction=data)
        if isinstance(data, dict):
            return cls(transaction=data["transaction"])
        raise ValueError(f"Cannot parse Stellar payload from {type(data)}")

    def to_dict(self) -> dict[str, Any]:
        return {"transaction": self.transaction}
