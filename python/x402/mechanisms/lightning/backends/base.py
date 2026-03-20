"""Abstract Lightning invoice backend (sync)."""

from __future__ import annotations

from abc import ABC, abstractmethod


class LightningInvoiceBackend(ABC):
    """Creates BOLT11 invoices and identifies the payee node pubkey (hex)."""

    @abstractmethod
    def create_invoice(
        self,
        *,
        network: str,
        amount_msat: int,
    ) -> tuple[str, str]:
        """Return ``(bolt11_invoice, payee_pubkey_hex)``.

        Args:
            network: ``lightning:mainnet|testnet|regtest``.
            amount_msat: Invoice amount in millisatoshis.

        Raises:
            ValueError: If inputs are invalid for this backend.
        """
        ...
