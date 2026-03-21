"""Lightning integration tests against Docker-backed LND regtest."""

import os

import pytest

from x402 import x402ClientSync, x402FacilitatorSync, x402ResourceServerSync
from x402.mechanisms.lightning.constants import (
    ASSET_BTC,
    ERR_AMOUNT_MISMATCH,
    ERR_PAY_TO_MISMATCH,
    ERR_PAYMENT_HASH_MISMATCH,
    ERR_REPLAY,
    LIGHTNING_REGTEST,
    SCHEME_EXACT,
)
from x402.mechanisms.lightning.exact import (
    ExactLightningFacilitatorScheme,
    register_exact_lightning_client,
    register_exact_lightning_facilitator,
    register_exact_lightning_server,
)
from x402.mechanisms.lightning.invoice import decode_bolt11, payment_hash_from_preimage
from x402.schemas import AssetAmount, PaymentPayload, PaymentRequirements, ResourceConfig, ResourceInfo

from .lightning_regtest import (
    LightningFacilitatorClientSync,
    LndInvoiceBackend,
    LndPreimageProvider,
    LndRestClient,
)

pytestmark = [
    pytest.mark.requires_lightning_regtest,
    pytest.mark.skipif(
        os.environ.get("X402_LIGHTNING_LND_INTEGRATION") != "1",
        reason="Set X402_LIGHTNING_LND_INTEGRATION=1 and LND REST env to run",
    ),
]


class TestLightningIntegrationV2:
    """Integration tests for Lightning V2 orchestration against real regtest infra."""

    def setup_method(self) -> None:
        self.alice = LndRestClient.from_env(prefix="LND_ALICE")
        self.bob = LndRestClient.from_env(prefix="LND_BOB")
        self.alice_pubkey = str(self.alice.get_info()["identity_pubkey"])

        self.client = register_exact_lightning_client(
            x402ClientSync(),
            networks=[LIGHTNING_REGTEST],
            preimage_fn=LndPreimageProvider(self.bob),
        )
        self.facilitator = register_exact_lightning_facilitator(
            x402FacilitatorSync(),
            self.alice_pubkey,
            [LIGHTNING_REGTEST],
        )
        facilitator_client = LightningFacilitatorClientSync(self.facilitator)
        self.server = register_exact_lightning_server(
            x402ResourceServerSync(facilitator_client),
            LndInvoiceBackend(self.alice, payee_pubkey=self.alice_pubkey),
            networks=[LIGHTNING_REGTEST],
        )
        self.server.initialize()

    def test_server_should_successfully_verify_and_settle_lightning_payment_from_client(self) -> None:
        accepts = self.server.build_payment_requirements(
            ResourceConfig(
                scheme=SCHEME_EXACT,
                pay_to=self.alice_pubkey,
                price="0.00000023",
                network=LIGHTNING_REGTEST,
            )
        )
        payment_required = self.server.create_payment_required_response(
            accepts,
            ResourceInfo(
                url="https://api.example.com/premium",
                description="Premium API Access",
                mime_type="application/json",
            ),
        )
        assert payment_required.x402_version == 2

        payment_payload = self.client.create_payment_payload(payment_required)
        assert payment_payload.x402_version == 2
        assert payment_payload.accepted.scheme == SCHEME_EXACT
        assert payment_payload.accepted.network == LIGHTNING_REGTEST
        assert "invoice" in payment_payload.payload
        assert "preimage" in payment_payload.payload

        accepted = self.server.find_matching_requirements(accepts, payment_payload)
        assert accepted is not None

        verify_response = self.server.verify_payment(payment_payload, accepted)
        assert verify_response.is_valid is True

        settle_response = self.server.settle_payment(payment_payload, accepted)
        decoded = decode_bolt11(str(payment_payload.payload["invoice"]))

        assert settle_response.success is True
        assert settle_response.network == LIGHTNING_REGTEST
        assert settle_response.transaction == decoded.payment_hash

    def test_client_creates_valid_lightning_payment_payload(self) -> None:
        accepts = self.server.build_payment_requirements(
            ResourceConfig(
                scheme=SCHEME_EXACT,
                pay_to=self.alice_pubkey,
                price="0.00000017",
                network=LIGHTNING_REGTEST,
            )
        )
        payment_required = self.server.create_payment_required_response(accepts)
        payload = self.client.create_payment_payload(payment_required)

        assert payload.x402_version == 2
        assert payload.accepted.scheme == SCHEME_EXACT
        assert payload.accepted.network == LIGHTNING_REGTEST
        assert payload.accepted.asset == ASSET_BTC
        assert "invoice" in payload.payload
        assert "preimage" in payload.payload
        assert len(str(payload.payload["preimage"])) == 64

    def test_invalid_recipient_fails_verification(self) -> None:
        accepts = self.server.build_payment_requirements(
            ResourceConfig(
                scheme=SCHEME_EXACT,
                pay_to=self.alice_pubkey,
                price="0.00000019",
                network=LIGHTNING_REGTEST,
            )
        )
        payment_required = self.server.create_payment_required_response(accepts)
        payload = self.client.create_payment_payload(payment_required)

        requirements = _copy_requirements(accepts[0], pay_to=f"02{'11' * 32}")
        verify_response = self.server.verify_payment(payload, requirements)

        assert verify_response.is_valid is False
        assert verify_response.invalid_reason == ERR_PAY_TO_MISMATCH

    def test_insufficient_amount_fails_verification(self) -> None:
        accepts = self.server.build_payment_requirements(
            ResourceConfig(
                scheme=SCHEME_EXACT,
                pay_to=self.alice_pubkey,
                price="0.00000029",
                network=LIGHTNING_REGTEST,
            )
        )
        payment_required = self.server.create_payment_required_response(accepts)
        payload = self.client.create_payment_payload(payment_required)

        original_amount = int(accepts[0].amount)
        requirements = _copy_requirements(accepts[0], amount=str(original_amount + 1000))
        verify_response = self.server.verify_payment(payload, requirements)

        assert verify_response.is_valid is False
        assert verify_response.invalid_reason == ERR_AMOUNT_MISMATCH

    def test_facilitator_get_supported(self) -> None:
        supported = self.facilitator.get_supported()

        assert len(supported.kinds) >= 1
        lightning_support = None
        for kind in supported.kinds:
            if kind.network == LIGHTNING_REGTEST and kind.scheme == SCHEME_EXACT:
                lightning_support = kind
                break

        assert lightning_support is not None
        assert lightning_support.x402_version == 2


class TestLightningRegtestInvariants:
    """LND-specific invariants validated against real invoice/payment behavior."""

    def setup_method(self) -> None:
        self.alice = LndRestClient.from_env(prefix="LND_ALICE")
        self.bob = LndRestClient.from_env(prefix="LND_BOB")
        self.alice_pubkey = str(self.alice.get_info()["identity_pubkey"])
        self.facilitator = ExactLightningFacilitatorScheme(self.alice_pubkey)

    def test_real_lnd_invoice_decodable(self) -> None:
        amount_sats = 31
        invoice = str(
            self.alice.create_invoice(
                amount_sats=amount_sats,
                memo="x402-layer3-invariant-decode",
            )["payment_request"]
        )
        decoded = decode_bolt11(invoice)

        assert decoded.currency == "bcrt"
        assert len(decoded.payment_hash) == 64
        assert decoded.amount_msat == amount_sats * 1000
        assert decoded.payee_pubkey == self.alice_pubkey

    def test_real_payment_preimage_matches_hash(self) -> None:
        invoice = str(
            self.alice.create_invoice(
                amount_sats=37,
                memo="x402-layer3-invariant-preimage",
            )["payment_request"]
        )
        pay_response = self.bob.pay_invoice(bolt11=invoice)
        preimage_hex = LndRestClient.extract_preimage_hex(pay_response)
        expected_hash = decode_bolt11(invoice).payment_hash

        assert payment_hash_from_preimage(bytes.fromhex(preimage_hex)) == expected_hash

    def test_facilitator_verify_accepts_real_preimage(self) -> None:
        payload, requirements = self._create_paid_payload(
            amount_sats=41,
            memo="x402-layer3-invariant-verify",
        )
        response = self.facilitator.verify(payload, requirements)

        assert response.is_valid is True

    def test_replay_rejected_real_payment(self) -> None:
        payload, requirements = self._create_paid_payload(
            amount_sats=43,
            memo="x402-layer3-invariant-replay",
        )
        first = self.facilitator.settle(payload, requirements)
        second = self.facilitator.settle(payload, requirements)

        assert first.success is True
        assert second.success is False
        assert second.error_reason == ERR_REPLAY

    def test_wrong_preimage_rejected_for_real_invoice(self) -> None:
        invoice = str(
            self.alice.create_invoice(
                amount_sats=47,
                memo="x402-layer3-invariant-wrong-preimage",
            )["payment_request"]
        )
        decoded = decode_bolt11(invoice)
        wrong_preimage = "00" * 32
        if payment_hash_from_preimage(bytes.fromhex(wrong_preimage)) == decoded.payment_hash:
            wrong_preimage = "01" * 32

        requirements = self._build_requirements(invoice=invoice, amount_msat=47_000)
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
        invoice = str(self.alice.create_invoice(amount_sats=amount_sats, memo=memo)["payment_request"])
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


class TestLightningPriceParsing:
    """Integration tests for Lightning server price parsing with real invoice backend."""

    def setup_method(self) -> None:
        self.alice = LndRestClient.from_env(prefix="LND_ALICE")
        self.alice_pubkey = str(self.alice.get_info()["identity_pubkey"])
        self.facilitator = register_exact_lightning_facilitator(
            x402FacilitatorSync(),
            self.alice_pubkey,
            [LIGHTNING_REGTEST],
        )
        facilitator_client = LightningFacilitatorClientSync(self.facilitator)
        self.server = register_exact_lightning_server(
            x402ResourceServerSync(facilitator_client),
            LndInvoiceBackend(self.alice, payee_pubkey=self.alice_pubkey),
            networks=[LIGHTNING_REGTEST],
        )
        self.server.initialize()

    def test_parse_price_btc_formats(self) -> None:
        test_cases = [
            ("0.00000017", "17000"),
            ("0.00000050", "50000"),
            (0.00000019, "19000"),
        ]
        for input_price, expected_amount in test_cases:
            requirements = self.server.build_payment_requirements(
                ResourceConfig(
                    scheme=SCHEME_EXACT,
                    pay_to=self.alice_pubkey,
                    price=input_price,
                    network=LIGHTNING_REGTEST,
                )
            )
            assert len(requirements) == 1
            assert requirements[0].amount == expected_amount
            assert requirements[0].asset == ASSET_BTC
            assert str(requirements[0].extra.get("invoice", "")).startswith("lnbcrt")

    def test_asset_amount_passthrough(self) -> None:
        custom_asset = AssetAmount(
            amount="88000",
            asset=ASSET_BTC,
            extra={"tier": "custom"},
        )
        requirements = self.server.build_payment_requirements(
            ResourceConfig(
                scheme=SCHEME_EXACT,
                pay_to=self.alice_pubkey,
                price=custom_asset,
                network=LIGHTNING_REGTEST,
            )
        )

        assert len(requirements) == 1
        assert requirements[0].amount == "88000"
        assert requirements[0].asset == ASSET_BTC
        assert requirements[0].extra.get("tier") == "custom"
        assert str(requirements[0].extra.get("invoice", "")).startswith("lnbcrt")

    def test_usd_string_rejected(self) -> None:
        with pytest.raises(ValueError, match="USD"):
            self.server.build_payment_requirements(
                ResourceConfig(
                    scheme=SCHEME_EXACT,
                    pay_to=self.alice_pubkey,
                    price="$1.00",
                    network=LIGHTNING_REGTEST,
                )
            )


def _copy_requirements(
    requirements: PaymentRequirements,
    *,
    pay_to: str | None = None,
    amount: str | None = None,
) -> PaymentRequirements:
    return PaymentRequirements(
        scheme=requirements.scheme,
        network=requirements.network,
        asset=requirements.asset,
        amount=amount if amount is not None else requirements.amount,
        pay_to=pay_to if pay_to is not None else requirements.pay_to,
        max_timeout_seconds=requirements.max_timeout_seconds,
        extra=dict(requirements.extra or {}),
    )
