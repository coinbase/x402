"""EVM split scheme types."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SplitRecipient:
    """A recipient in a split payment.

    Attributes:
        address: Wallet address (EVM hex format).
        bps: Basis points allocation (1-10000, where 10000 = 100%).
        label: Optional human-readable label.
    """

    address: str
    bps: int
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"address": self.address, "bps": self.bps}
        if self.label:
            d["label"] = self.label
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SplitRecipient":
        return cls(
            address=data["address"],
            bps=data["bps"],
            label=data.get("label", ""),
        )


@dataclass
class SplitConfig:
    """Configuration for a split payment.

    Attributes:
        recipients: List of split recipients.
    """

    recipients: list[SplitRecipient] = field(default_factory=list)

    def validate(self) -> None:
        """Validate split configuration.

        Raises:
            ValueError: If recipients are invalid.
        """
        if not self.recipients:
            raise ValueError("Split must have at least 1 recipient")

        total_bps = sum(r.bps for r in self.recipients)
        if total_bps != 10000:
            raise ValueError(
                f"Recipient bps must sum to 10000, got {total_bps}"
            )

        for r in self.recipients:
            if not 1 <= r.bps <= 10000:
                raise ValueError(
                    f"Each recipient bps must be 1-10000, got {r.bps} for {r.address}"
                )

    def calculate_shares(self, total_amount: int) -> list[tuple[str, int]]:
        """Calculate each recipient's share of the total amount.

        Uses floor division with remainder allocated to first recipient.

        Args:
            total_amount: Total amount in smallest unit (e.g., USDC micro-units).

        Returns:
            List of (address, amount) tuples.
        """
        shares: list[tuple[str, int]] = []
        distributed = 0

        for i, recipient in enumerate(self.recipients):
            if i == len(self.recipients) - 1:
                # Last recipient gets remainder to avoid dust
                share = total_amount - distributed
            else:
                share = (total_amount * recipient.bps) // 10000
            shares.append((recipient.address, share))
            distributed += share

        return shares

    def to_dict_list(self) -> list[dict[str, Any]]:
        return [r.to_dict() for r in self.recipients]

    @classmethod
    def from_dict_list(cls, data: list[dict[str, Any]]) -> "SplitConfig":
        return cls(recipients=[SplitRecipient.from_dict(d) for d in data])
