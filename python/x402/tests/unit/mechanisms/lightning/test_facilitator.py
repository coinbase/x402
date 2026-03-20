"""Tests for Lightning exact facilitator."""

import pytest

from x402.mechanisms.lightning.constants import (
    ASSET_BTC,
    ERR_REPLAY,
    LIGHTNING_REGTEST,
    MOCK_LIGHTNING_PAYEE_PUBKEY,
    SCHEME_EXACT,
)
from x402.mechanisms.lightning.exact import (
    ExactLightningClientScheme,
    ExactLightningFacilitatorScheme,
)
from x402.mechanisms.lightning.exact.mock import MockLightningBackend
from x402.mechanisms.lightning.invoice import payment_hash_from_preimage
from x402.mechanisms.lightning.utils import parse_preimage_hex
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo


@pytest.fixture
def backend_and_requirements() -> tuple[PaymentRequirements, str]:
    pytest.importorskip("bolt11")
    backend = MockLightningBackend()
    inv, pk = backend.create_invoice(network=LIGHTNING_REGTEST, amount_msat=99_000)
    req = PaymentRequirements(
        scheme=SCHEME_EXACT,
        network=LIGHTNING_REGTEST,
        asset=ASSET_BTC,
        amount="99000",
        pay_to=pk,
        max_timeout_seconds=60,
        extra={"invoice": inv},
    )
    return req, inv


@pytest.fixture
def payload_for(
    backend_and_requirements: tuple[PaymentRequirements, str],
) -> tuple[PaymentPayload, PaymentRequirements]:
    req, _ = backend_and_requirements
    inner = ExactLightningClientScheme().create_payment_payload(req)
    payload = PaymentPayload(
        x402_version=2,
        payload=inner,
        accepted=req,
        resource=ResourceInfo(url="https://example.com/r"),
    )
    return payload, req


def test_verify_and_settle(
    payload_for: tuple[PaymentPayload, PaymentRequirements],
) -> None:
    payload, req = payload_for
    fac = ExactLightningFacilitatorScheme(MOCK_LIGHTNING_PAYEE_PUBKEY)
    vr = fac.verify(payload, req)
    assert vr.is_valid is True

    sr = fac.settle(payload, req)
    assert sr.success is True
    preimage = parse_preimage_hex(payload.payload["preimage"])
    assert sr.transaction == payment_hash_from_preimage(preimage)


def test_replay_rejected(
    payload_for: tuple[PaymentPayload, PaymentRequirements],
) -> None:
    payload, req = payload_for
    fac = ExactLightningFacilitatorScheme(MOCK_LIGHTNING_PAYEE_PUBKEY)
    assert fac.verify(payload, req).is_valid is True
    fac.settle(payload, req)
    vr2 = fac.verify(payload, req)
    assert vr2.is_valid is False
    assert vr2.invalid_reason == ERR_REPLAY
