"""Types for Stellar split scheme."""

from dataclasses import dataclass
from typing import Any


@dataclass
class StellarSplitRecipient:
    """A recipient in a split payment."""

    address: str
    bps: int  # Basis points (1-10000)

    def validate(self) -> None:
        if not self.address:
            raise ValueError("Recipient address cannot be empty")
        if self.bps < 1 or self.bps > 10000:
            raise ValueError(f"bps must be 1-10000, got {self.bps}")


@dataclass
class StellarSplitConfig:
    """Configuration for a split payment."""

    recipients: list[StellarSplitRecipient]

    def validate(self) -> None:
        if not self.recipients:
            raise ValueError("At least one recipient is required")

        total_bps = sum(r.bps for r in self.recipients)
        if total_bps != 10000:
            raise ValueError(f"Recipient bps must sum to 10000, got {total_bps}")

        for r in self.recipients:
            r.validate()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StellarSplitConfig":
        recipients = [
            StellarSplitRecipient(
                address=r["address"],
                bps=int(r["bps"]),
            )
            for r in data.get("recipients", [])
        ]
        return cls(recipients=recipients)


def calculate_split_amounts(
    total_amount: int,
    recipients: list[StellarSplitRecipient],
) -> list[tuple[str, int]]:
    """Calculate per-recipient amounts from total and basis points.

    Uses floor division. Remainder (dust) goes to the first recipient.

    Returns:
        List of (address, amount) tuples.
    """
    splits: list[tuple[str, int]] = []
    allocated = 0

    for recipient in recipients:
        share = (total_amount * recipient.bps) // 10000
        splits.append((recipient.address, share))
        allocated += share

    # Assign dust to first recipient
    dust = total_amount - allocated
    if dust > 0 and splits:
        addr, amt = splits[0]
        splits[0] = (addr, amt + dust)

    return splits
