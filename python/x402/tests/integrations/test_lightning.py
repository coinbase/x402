"""Integration tests for Lightning (Polar / LND) — opt-in via environment."""

import os

import pytest

from x402.mechanisms.lightning.constants import (
    ASSET_BTC,
    ERR_PAYMENT_HASH_MISMATCH,
    ERR_REPLAY,
    LIGHTNING_REGTEST,
    SCHEME_EXACT,
)
from x402.mechanisms.lightning.exact import ExactLightningFacilitatorScheme
from x402.mechanisms.lightning.invoice import decode_bolt11, payment_hash_from_preimage
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo

from .lightning_regtest import LndRestClient

pytestmark = [
    pytest.mark.requires_lightning_regtest,
    pytest.mark.skipif(
        os.environ.get("X402_LIGHTNING_LND_INTEGRATION") != "1",
        reason="Set X402_LIGHTNING_LND_INTEGRATION=1 and LND REST env to run",
    ),
]


class TestLightningRegtest:
    """Layer 3 tests against real LND nodes on Polar regtest."""

    def setup_method(self) -> None:
        self.alice = LndRestClient.from_env(prefix="LND_ALICE")
        self.bob = LndRestClient.from_env(prefix="LND_BOB")
        alice_info = self.alice.get_info()
        self.alice_pubkey = str(alice_info["identity_pubkey"])
        self.facilitator = ExactLightningFacilitatorScheme(self.alice_pubkey)

    def test_real_lnd_invoice_decodable(self) -> None:
        amount_sats = 17
        invoice_response = self.alice.create_invoice(
            amount_sats=amount_sats,
            memo="x402-layer3-decode",
        )
        invoice = str(invoice_response["payment_request"])
        decoded = decode_bolt11(invoice)

        assert decoded.currency == "bcrt"
        assert len(decoded.payment_hash) == 64
        assert decoded.amount_msat == amount_sats * 1000
        assert decoded.payee_pubkey == self.alice_pubkey

    def test_real_payment_preimage_matches_hash(self) -> None:
        invoice_response = self.alice.create_invoice(
            amount_sats=19,
            memo="x402-layer3-preimage",
        )
        invoice = str(invoice_response["payment_request"])
        pay_response = self.bob.pay_invoice(bolt11=invoice)
        preimage_hex = LndRestClient.extract_preimage_hex(pay_response)
        expected_hash = decode_bolt11(invoice).payment_hash
        actual_hash = payment_hash_from_preimage(bytes.fromhex(preimage_hex))

        assert actual_hash == expected_hash

    def test_facilitator_verify_accepts_real_preimage(self) -> None:
        payload, requirements = self._create_paid_payload(amount_sats=21, memo="x402-layer3-verify")
        response = self.facilitator.verify(payload, requirements)

        assert response.is_valid is True

    def test_facilitator_settle_real_payment(self) -> None:
        payload, requirements = self._create_paid_payload(amount_sats=23, memo="x402-layer3-settle")
        response = self.facilitator.settle(payload, requirements)
        decoded = decode_bolt11(payload.payload["invoice"])

        assert response.success is True
        assert response.transaction == decoded.payment_hash
        assert response.network == LIGHTNING_REGTEST

    def test_replay_rejected_real_payment(self) -> None:
        payload, requirements = self._create_paid_payload(amount_sats=29, memo="x402-layer3-replay")
        first = self.facilitator.settle(payload, requirements)
        second = self.facilitator.settle(payload, requirements)

        assert first.success is True
        assert second.success is False
        assert second.error_reason == ERR_REPLAY

    def test_wrong_preimage_rejected_for_real_invoice(self) -> None:
        invoice_response = self.alice.create_invoice(
            amount_sats=31,
            memo="x402-layer3-wrong-preimage",
        )
        invoice = str(invoice_response["payment_request"])
        decoded = decode_bolt11(invoice)
        wrong_preimage = "00" * 32
        if payment_hash_from_preimage(bytes.fromhex(wrong_preimage)) == decoded.payment_hash:
            wrong_preimage = "01" * 32

        requirements = self._build_requirements(invoice=invoice, amount_msat=31_000)
        payload = self._build_payload(requirements=requirements, preimage_hex=wrong_preimage)
        response = self.facilitator.verify(payload, requirements)

        assert response.is_valid is False
        assert response.invalid_reason == ERR_PAYMENT_HASH_MISMATCH

    def _create_paid_payload(
        self,
        *,
        amount_sats: int,
        memo: str,
    ) -> tuple[PaymentPayload, PaymentRequirements]:
        invoice_response = self.alice.create_invoice(amount_sats=amount_sats, memo=memo)
        invoice = str(invoice_response["payment_request"])
        payment_response = self.bob.pay_invoice(bolt11=invoice)
        preimage_hex = LndRestClient.extract_preimage_hex(payment_response)
        requirements = self._build_requirements(invoice=invoice, amount_msat=amount_sats * 1000)
        payload = self._build_payload(requirements=requirements, preimage_hex=preimage_hex)
        return payload, requirements

    def _build_requirements(self, *, invoice: str, amount_msat: int) -> PaymentRequirements:
        return PaymentRequirements(
            scheme=SCHEME_EXACT,
            network=LIGHTNING_REGTEST,
            asset=ASSET_BTC,
            amount=str(amount_msat),
            pay_to=self.alice_pubkey,
            max_timeout_seconds=300,
            extra={"invoice": invoice},
        )

    def _build_payload(
        self,
        *,
        requirements: PaymentRequirements,
        preimage_hex: str,
    ) -> PaymentPayload:
        return PaymentPayload(
            payload={
                "invoice": requirements.extra["invoice"],
                "preimage": preimage_hex,
            },
            accepted=requirements,
            resource=ResourceInfo(url="https://example.com/layer3"),
        )
