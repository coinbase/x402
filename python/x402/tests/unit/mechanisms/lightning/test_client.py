"""Tests for Lightning exact client."""

import pytest

from x402.mechanisms.lightning.constants import ASSET_BTC, LIGHTNING_REGTEST
from x402.mechanisms.lightning.exact import ExactLightningClientScheme
from x402.mechanisms.lightning.exact.mock import MockLightningBackend
from x402.schemas import PaymentRequirements


@pytest.fixture
def requirements_with_invoice() -> PaymentRequirements:
    backend = MockLightningBackend()
    inv, pk = backend.create_invoice(network=LIGHTNING_REGTEST, amount_msat=50_000)
    return PaymentRequirements(
        scheme="exact",
        network=LIGHTNING_REGTEST,
        asset=ASSET_BTC,
        amount="50000",
        pay_to=pk,
        max_timeout_seconds=60,
        extra={"invoice": inv},
    )


def test_create_payment_payload_returns_invoice_and_preimage(
    requirements_with_invoice: PaymentRequirements,
) -> None:
    pytest.importorskip("bolt11")
    client = ExactLightningClientScheme()
    payload = client.create_payment_payload(requirements_with_invoice)
    assert "invoice" in payload and "preimage" in payload
    assert payload["invoice"] == requirements_with_invoice.extra["invoice"]
    assert len(payload["preimage"]) == 64
