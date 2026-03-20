"""Tests for BOLT11 decoding helpers."""

import pytest

from x402.mechanisms.lightning.exact.mock import MockLightningBackend
from x402.mechanisms.lightning.invoice import (
    decode_bolt11,
    lightning_network_for_bolt11_currency,
    payment_hash_from_preimage,
)


@pytest.fixture
def sample_invoice() -> str:
    backend = MockLightningBackend()
    inv, _ = backend.create_invoice(network="lightning:regtest", amount_msat=21_000)
    return inv


def test_payment_hash_from_preimage_roundtrip() -> None:
    preimage = b"\x01" * 32
    ph = payment_hash_from_preimage(preimage)
    assert len(ph) == 64


def test_lightning_network_for_bolt11_currency() -> None:
    assert lightning_network_for_bolt11_currency("bc") == "lightning:mainnet"
    assert lightning_network_for_bolt11_currency("tb") == "lightning:testnet"
    assert lightning_network_for_bolt11_currency("bcrt") == "lightning:regtest"


def test_decode_bolt11_mock_invoice(sample_invoice: str) -> None:
    d = decode_bolt11(sample_invoice)
    assert d.currency == "bcrt"
    assert len(d.payment_hash) == 64
    assert d.amount_msat == 21_000
    assert d.payee_pubkey


def test_decode_bolt11_requires_extra() -> None:
    pytest.importorskip("bolt11")
    with pytest.raises(ValueError):
        decode_bolt11("not_an_invoice")
