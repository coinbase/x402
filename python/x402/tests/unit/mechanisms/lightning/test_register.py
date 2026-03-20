"""Tests for Lightning registration helpers."""

import pytest

from x402.client import x402ClientSync
from x402.facilitator import x402FacilitatorSync
from x402.mechanisms.lightning.constants import LIGHTNING_REGTEST, MOCK_LIGHTNING_PAYEE_PUBKEY
from x402.mechanisms.lightning.exact import (
    ExactLightningClientScheme,
    ExactLightningFacilitatorScheme,
    ExactLightningServerScheme,
    register_exact_lightning_client,
    register_exact_lightning_facilitator,
    register_exact_lightning_server,
)
from x402.mechanisms.lightning.exact.mock import MockLightningBackend
from x402.server import x402ResourceServerSync


def test_register_client_wildcard() -> None:
    c = x402ClientSync()
    register_exact_lightning_client(c)
    assert isinstance(c._schemes["lightning:*"]["exact"], ExactLightningClientScheme)


def test_register_server_wildcard() -> None:
    s = x402ResourceServerSync()
    register_exact_lightning_server(s, MockLightningBackend())
    assert isinstance(s._schemes["lightning:*"]["exact"], ExactLightningServerScheme)


def test_register_facilitator_networks() -> None:
    pytest.importorskip("bolt11")
    f = x402FacilitatorSync()
    register_exact_lightning_facilitator(
        f,
        MOCK_LIGHTNING_PAYEE_PUBKEY,
        [LIGHTNING_REGTEST],
    )
    assert any(
        isinstance(sd.facilitator, ExactLightningFacilitatorScheme)
        for sd in f._schemes
    )
