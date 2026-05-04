"""Tests for ExactSvmSchemeV1 facilitator (legacy V1 SVM exact scheme)."""

import base64
from unittest.mock import MagicMock, patch

import pytest
from solders.hash import Hash
from solders.keypair import Keypair

from x402.mechanisms.svm import (
    SOLANA_DEVNET_CAIP2,
    USDC_DEVNET_ADDRESS,
)
from x402.mechanisms.svm.constants import (
    MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
    TOKEN_PROGRAM_ADDRESS,
)
from x402.mechanisms.svm.exact.v1.client import ExactSvmSchemeV1 as ExactSvmClientV1
from x402.mechanisms.svm.exact.v1.facilitator import ExactSvmSchemeV1
from x402.mechanisms.svm.settlement_cache import SettlementCache
from x402.mechanisms.svm.signers import KeypairSigner
from x402.schemas import VerifyResponse
from x402.schemas.v1 import PaymentPayloadV1, PaymentRequirementsV1


class MockFacilitatorSigner:
    """Mock facilitator signer for V1 facilitator tests."""

    def __init__(
        self,
        addresses: list[str] | None = None,
        sign_raises: Exception | None = None,
        send_raises: Exception | None = None,
        confirm_raises: Exception | None = None,
        simulate_raises: Exception | None = None,
    ):
        self._addresses = addresses or ["FeePayer1111111111111111111111111111"]
        self._sign_raises = sign_raises
        self._send_raises = send_raises
        self._confirm_raises = confirm_raises
        self._simulate_raises = simulate_raises
        self.send_calls: list[tuple[str, str]] = []
        self.confirm_calls: list[tuple[str, str]] = []

    def get_addresses(self) -> list[str]:
        return self._addresses

    def sign_transaction(self, tx_base64: str, fee_payer: str, network: str) -> str:
        if self._sign_raises is not None:
            raise self._sign_raises
        return tx_base64

    def simulate_transaction(self, tx_base64: str, network: str) -> None:
        if self._simulate_raises is not None:
            raise self._simulate_raises

    def send_transaction(self, tx_base64: str, network: str) -> str:
        self.send_calls.append((tx_base64, network))
        if self._send_raises is not None:
            raise self._send_raises
        return "mockSignature123"

    def confirm_transaction(self, signature: str, network: str) -> None:
        self.confirm_calls.append((signature, network))
        if self._confirm_raises is not None:
            raise self._confirm_raises


# Stable valid base58 Solana pubkeys generated once for fixture stability.
PAY_TO = "3jRL86NVtGwDSLUXWwu4oSa1ZAn3PaNVHY2RaCKTF1RT"


def _client_keypair() -> Keypair:
    return Keypair.from_seed(bytes([7] * 32))


def _fee_payer_keypair() -> Keypair:
    return Keypair.from_seed(bytes([2] * 32))


def _make_requirements(
    *,
    network: str = "solana-devnet",
    asset: str = USDC_DEVNET_ADDRESS,
    pay_to: str = PAY_TO,
    max_amount_required: str = "100000",
    extra: dict | None = None,
    fee_payer_str: str | None = None,
) -> PaymentRequirementsV1:
    if extra is None:
        if fee_payer_str is None:
            fee_payer_str = str(_fee_payer_keypair().pubkey())
        extra = {"feePayer": fee_payer_str}
    return PaymentRequirementsV1(
        scheme="exact",
        network=network,
        max_amount_required=max_amount_required,
        resource="http://example.com/protected",
        description="Test resource",
        mime_type="application/json",
        pay_to=pay_to,
        max_timeout_seconds=3600,
        asset=asset,
        extra=extra,
    )


def _make_payload(
    *,
    transaction: str = "base64transaction==",
    scheme: str = "exact",
    network: str = "solana-devnet",
) -> PaymentPayloadV1:
    return PaymentPayloadV1(
        scheme=scheme,
        network=network,
        payload={"transaction": transaction},
    )


def _mock_solana_client_for_client():
    """RPC mock used to drive ExactSvmClientV1.create_payment_payload."""

    rpc = MagicMock()

    mint_data = bytearray(82)
    mint_data[44] = 6  # decimals
    mint_value = MagicMock()
    mint_value.owner = TOKEN_PROGRAM_ADDRESS
    mint_value.data = bytes(mint_data)
    mint_resp = MagicMock()
    mint_resp.value = mint_value
    rpc.get_account_info.return_value = mint_resp

    blockhash_resp = MagicMock()
    blockhash_resp.value.blockhash = Hash.default()
    rpc.get_latest_blockhash.return_value = blockhash_resp

    return rpc


def _build_real_v1_transaction(
    *,
    fee_payer_str: str,
    pay_to: str,
    max_amount_required: str = "100000",
    asset: str = USDC_DEVNET_ADDRESS,
    extra_overrides: dict | None = None,
) -> tuple[str, Keypair]:
    """Use the V1 client to build a real signed SVM transaction.

    Returns (transaction_base64, client_keypair) so tests can pass the bytes
    to the V1 facilitator.verify pipeline.
    """
    keypair = _client_keypair()
    extra = {"feePayer": fee_payer_str}
    if extra_overrides:
        extra.update(extra_overrides)
    requirements = _make_requirements(
        max_amount_required=max_amount_required,
        asset=asset,
        pay_to=pay_to,
        extra=extra,
    )
    client = ExactSvmClientV1(KeypairSigner(keypair))
    with patch.object(client, "_get_client", return_value=_mock_solana_client_for_client()):
        payload_dict = client.create_payment_payload(requirements)
    return payload_dict["transaction"], keypair


# ---------------------------------------------------------------------------
# Constructor + attributes
# ---------------------------------------------------------------------------


class TestExactSvmSchemeV1FacilitatorConstructor:
    """ExactSvmSchemeV1 facilitator constructor and exposed attributes."""

    def test_scheme_attribute_is_exact(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        assert facilitator.scheme == "exact"

    def test_caip_family_attribute(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        assert facilitator.caip_family == "solana:*"

    def test_creates_default_settlement_cache_when_none_provided(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        assert isinstance(facilitator._settlement_cache, SettlementCache)

    def test_uses_provided_settlement_cache(self):
        cache = SettlementCache()
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner(), settlement_cache=cache)

        assert facilitator._settlement_cache is cache


class TestGetExtraAndGetSigners:
    """get_extra / get_signers surface (V1 mirrors V2 here)."""

    def test_get_extra_returns_fee_payer_from_signer(self):
        signer = MockFacilitatorSigner(["TestFeePayer11111111111111111111111"])
        facilitator = ExactSvmSchemeV1(signer)

        extra = facilitator.get_extra(SOLANA_DEVNET_CAIP2)

        assert extra is not None
        assert extra["feePayer"] == "TestFeePayer11111111111111111111111"

    def test_get_extra_picks_one_of_multiple_addresses(self):
        addresses = [f"Signer{idx}" + "1" * (44 - len(f"Signer{idx}")) for idx in range(3)]
        signer = MockFacilitatorSigner(addresses)
        facilitator = ExactSvmSchemeV1(signer)

        extra = facilitator.get_extra("solana-devnet")

        assert extra is not None
        assert extra["feePayer"] in addresses

    def test_get_signers_returns_signer_addresses_as_list(self):
        addresses = [
            "Signer1111111111111111111111111111111",
            "Signer2222222222222222222222222222222",
        ]
        signer = MockFacilitatorSigner(addresses)
        facilitator = ExactSvmSchemeV1(signer)

        result = facilitator.get_signers(SOLANA_DEVNET_CAIP2)

        assert result == addresses
        # Returns a fresh list, not the signer's internal storage.
        assert result is not signer._addresses


# ---------------------------------------------------------------------------
# Verify - top-level scheme/network gates (V1 specifics)
# ---------------------------------------------------------------------------


class TestVerifyTopLevelGates:
    """V1 places scheme/network at the payload top level."""

    def test_rejects_when_payload_scheme_is_not_exact(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload(scheme="wrong")
        requirements = _make_requirements()

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "unsupported_scheme"
        assert result.payer == ""

    def test_rejects_when_requirements_scheme_is_not_exact(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload()
        requirements = _make_requirements()
        # Bypass validation by mutating after construction so we can simulate
        # the payload/requirements scheme drift the facilitator guards against.
        requirements.scheme = "wrong"

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "unsupported_scheme"

    def test_rejects_when_payload_network_does_not_match_requirements(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload(network="solana")  # mainnet
        requirements = _make_requirements(network="solana-devnet")

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "network_mismatch"
        assert result.payer == ""


# ---------------------------------------------------------------------------
# Verify - feePayer gates
# ---------------------------------------------------------------------------


class TestVerifyFeePayerGates:
    def test_rejects_when_fee_payer_extra_is_missing(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload()
        requirements = _make_requirements(extra={})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_missing_fee_payer"

    def test_rejects_when_extra_is_none(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload()
        requirements = _make_requirements()
        requirements.extra = None

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_missing_fee_payer"

    def test_rejects_when_fee_payer_is_not_a_string(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload()
        requirements = _make_requirements(extra={"feePayer": 1234})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_missing_fee_payer"

    def test_rejects_when_fee_payer_not_managed_by_facilitator(self):
        facilitator = ExactSvmSchemeV1(
            MockFacilitatorSigner(["ManagedPayer111111111111111111111111"])
        )

        payload = _make_payload()
        requirements = _make_requirements(extra={"feePayer": "UnmanagedPayer1111111111111111111"})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "fee_payer_not_managed_by_facilitator"


# ---------------------------------------------------------------------------
# Verify - transaction decoding / structural gates
# ---------------------------------------------------------------------------


class TestVerifyTransactionStructure:
    def test_rejects_when_transaction_cannot_be_decoded(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))

        payload = _make_payload(transaction="!!!not-base64!!!")
        requirements = _make_requirements(extra={"feePayer": fee_payer})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        # Error from base64 decode or transaction parse — both surface the same reason.
        assert "invalid_exact_svm_payload" in result.invalid_reason

    def test_rejects_when_transaction_is_empty_base64(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))

        payload = _make_payload(transaction=base64.b64encode(b"").decode())
        requirements = _make_requirements(extra={"feePayer": fee_payer})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "invalid_exact_svm_payload" in result.invalid_reason


# ---------------------------------------------------------------------------
# Verify - happy and near-happy paths against a real V1 transaction
# ---------------------------------------------------------------------------


class TestVerifyAgainstRealTransaction:
    def test_accepts_valid_v1_transaction(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _client_kp = _build_real_v1_transaction(fee_payer_str=fee_payer, pay_to=PAY_TO)

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(extra={"feePayer": fee_payer})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is True
        assert result.payer  # payer pubkey extracted from transaction

    def test_rejects_when_amount_below_max_amount_required(self):
        """V1-specific: facilitator compares against max_amount_required."""
        fee_payer = str(_fee_payer_keypair().pubkey())
        # Client creates a transfer for 50000, requirements demand 100000.
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
            max_amount_required="50000",
        )

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(
            extra={"feePayer": fee_payer},
            max_amount_required="100000",
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_amount_insufficient"
        assert result.payer  # payer surfaces even when amount fails

    def test_accepts_when_amount_meets_max_amount_required_exactly(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
            max_amount_required="100000",
        )

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(
            extra={"feePayer": fee_payer},
            max_amount_required="100000",
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is True

    def test_rejects_when_mint_does_not_match_requirements(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
            asset=USDC_DEVNET_ADDRESS,
        )

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        # Different asset address in requirements.
        requirements = _make_requirements(
            extra={"feePayer": fee_payer},
            asset="So11111111111111111111111111111111111111112",  # Wrapped SOL
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_mint_mismatch"

    def test_rejects_when_destination_ata_does_not_match_pay_to(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
        )

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        # Different recipient: derived ATA will diverge from the on-chain ATA.
        requirements = _make_requirements(
            extra={"feePayer": fee_payer},
            pay_to="11111111111111111111111111111111",
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_recipient_mismatch"

    def test_rejects_when_authority_is_a_facilitator_signer(self):
        """ERR_FEE_PAYER_TRANSFERRING: facilitator must not be the source authority."""
        fee_payer = str(_fee_payer_keypair().pubkey())
        client_kp = _client_keypair()
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
        )

        # Add the client (transfer authority) to the facilitator's managed addresses
        # so the safety check trips — this is what the constant guards against.
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer, str(client_kp.pubkey())]))
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(extra={"feePayer": fee_payer})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert (
            result.invalid_reason
            == "invalid_exact_svm_payload_transaction_fee_payer_transferring_funds"
        )

    def test_rejects_when_memo_extra_does_not_match_transaction_memo(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
            extra_overrides={"memo": "client-memo"},
        )

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(extra={"feePayer": fee_payer, "memo": "different-memo"})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_memo_mismatch"

    def test_accepts_when_memo_extra_matches_transaction_memo(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
            extra_overrides={"memo": "shared-memo"},
        )

        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(extra={"feePayer": fee_payer, "memo": "shared-memo"})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is True

    def test_simulation_failure_surfaces_invalid_message(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
        )

        facilitator = ExactSvmSchemeV1(
            MockFacilitatorSigner([fee_payer], simulate_raises=RuntimeError("rpc-down"))
        )
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(extra={"feePayer": fee_payer})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "transaction_simulation_failed"
        assert result.invalid_message == "rpc-down"

    def test_sign_failure_during_verify_surfaces_simulation_failed(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
        )

        facilitator = ExactSvmSchemeV1(
            MockFacilitatorSigner([fee_payer], sign_raises=RuntimeError("sign-fail"))
        )
        payload = _make_payload(transaction=tx_b64)
        requirements = _make_requirements(extra={"feePayer": fee_payer})

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "transaction_simulation_failed"
        assert result.invalid_message == "sign-fail"


# ---------------------------------------------------------------------------
# Verify - compute budget gates
# ---------------------------------------------------------------------------


class TestVerifyComputeBudgetGates:
    def test_rejects_when_compute_unit_price_exceeds_max(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
        )

        # Patch the constant so the tx the client built (priced at the default)
        # appears to exceed the maximum.
        with patch(
            "x402.mechanisms.svm.exact.v1.facilitator.MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS",
            0,
        ):
            facilitator = ExactSvmSchemeV1(MockFacilitatorSigner([fee_payer]))
            payload = _make_payload(transaction=tx_b64)
            requirements = _make_requirements(extra={"feePayer": fee_payer})

            result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert (
            result.invalid_reason
            == "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high"
        )

    def test_max_compute_unit_price_constant_is_known(self):
        """Sanity guard so changes to the constant get test-side review."""
        assert MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS == 5_000_000


# ---------------------------------------------------------------------------
# Settle paths
# ---------------------------------------------------------------------------


class TestSettleVerifyShortCircuit:
    def test_settle_short_circuits_on_unsupported_scheme(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload(scheme="wrong")
        requirements = _make_requirements()

        result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert result.error_reason == "unsupported_scheme"
        assert result.network == "solana-devnet"
        assert result.transaction == ""

    def test_settle_short_circuits_on_network_mismatch(self):
        facilitator = ExactSvmSchemeV1(MockFacilitatorSigner())

        payload = _make_payload(network="solana")
        requirements = _make_requirements(network="solana-devnet")

        result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert result.error_reason == "network_mismatch"
        # network reported on SettleResponse comes from payload.network in V1.
        assert result.network == "solana"


class TestSettleHappyPath:
    def test_settle_returns_signature_when_verify_succeeds(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmSchemeV1(signer)

        payload = _make_payload(transaction="happyTransaction==")
        requirements = _make_requirements()

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            result = facilitator.settle(payload, requirements)

        assert result.success is True
        assert result.transaction == "mockSignature123"
        assert result.network == "solana-devnet"
        assert result.payer == "PayerAddress"
        assert signer.send_calls == [("happyTransaction==", "solana-devnet")]
        assert signer.confirm_calls == [("mockSignature123", "solana-devnet")]


class TestSettleErrorPaths:
    def test_settle_send_failure_returns_transaction_failed(self):
        signer = MockFacilitatorSigner(send_raises=RuntimeError("network-down"))
        facilitator = ExactSvmSchemeV1(signer)

        payload = _make_payload(transaction="failingTx==")
        requirements = _make_requirements()

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert result.error_reason == "transaction_failed"
        assert result.error_message == "network-down"
        assert result.transaction == ""
        assert result.network == "solana-devnet"
        assert result.payer == "PayerAddress"

    def test_settle_confirm_failure_returns_transaction_failed(self):
        signer = MockFacilitatorSigner(confirm_raises=RuntimeError("timeout-on-confirm"))
        facilitator = ExactSvmSchemeV1(signer)

        payload = _make_payload(transaction="pendingTx==")
        requirements = _make_requirements()

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert result.error_reason == "transaction_failed"
        assert result.error_message == "timeout-on-confirm"
        assert result.transaction == ""

    def test_settle_missing_fee_payer_in_extra_returns_transaction_failed(self):
        """KeyError on extra['feePayer'] is caught and surfaced as transaction_failed.

        Verify's missing-fee-payer guard is bypassed here on purpose — we want to
        cover the settle-side except branch.
        """
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmSchemeV1(signer)

        payload = _make_payload(transaction="noFeePayer==")
        requirements = _make_requirements(extra={})

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert result.error_reason == "transaction_failed"
        assert result.transaction == ""

    def test_settle_uses_provided_fee_payer_for_signing(self):
        """settle pulls feePayer from requirements.extra and passes it to sign_transaction."""
        captured: dict = {}

        class CapturingSigner(MockFacilitatorSigner):
            def sign_transaction(self, tx_base64: str, fee_payer: str, network: str) -> str:
                captured["fee_payer"] = fee_payer
                captured["network"] = network
                return tx_base64

        unique_fee_payer = "ProvidedFeePayer11111111111111111111"
        signer = CapturingSigner(addresses=[unique_fee_payer])
        facilitator = ExactSvmSchemeV1(signer)

        payload = _make_payload(transaction="captureTx==")
        requirements = _make_requirements(extra={"feePayer": unique_fee_payer})

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            result = facilitator.settle(payload, requirements)

        assert result.success is True
        assert captured == {"fee_payer": unique_fee_payer, "network": "solana-devnet"}


class TestSettleDuplicateCache:
    def test_second_settle_with_same_transaction_is_rejected(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmSchemeV1(signer)

        payload = _make_payload(transaction="dupTx==")
        requirements = _make_requirements()

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            first = facilitator.settle(payload, requirements)
            second = facilitator.settle(payload, requirements)

        assert first.success is True
        assert second.success is False
        assert second.error_reason == "duplicate_settlement"
        assert second.network == "solana-devnet"
        assert second.payer == "PayerAddress"

    def test_distinct_transactions_both_settle(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmSchemeV1(signer)

        with patch.object(
            facilitator,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            first = facilitator.settle(_make_payload(transaction="txA=="), _make_requirements())
            second = facilitator.settle(_make_payload(transaction="txB=="), _make_requirements())

        assert first.success is True
        assert second.success is True

    def test_shared_cache_blocks_repeat_via_independent_facilitator(self):
        """A second V1 facilitator sharing the cache must reject the same tx."""
        signer = MockFacilitatorSigner()
        cache = SettlementCache()
        v1_a = ExactSvmSchemeV1(signer, settlement_cache=cache)
        v1_b = ExactSvmSchemeV1(signer, settlement_cache=cache)

        payload = _make_payload(transaction="sharedTx==")
        requirements = _make_requirements()

        with patch.object(
            v1_a,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            first = v1_a.settle(payload, requirements)
        with patch.object(
            v1_b,
            "verify",
            return_value=VerifyResponse(is_valid=True, payer="PayerAddress"),
        ):
            second = v1_b.settle(payload, requirements)

        assert first.success is True
        assert second.success is False
        assert second.error_reason == "duplicate_settlement"


# ---------------------------------------------------------------------------
# Coverage smoke: ensure helper builds a transaction the facilitator accepts.
# Keeps the helper honest if the V1 client output format ever drifts.
# ---------------------------------------------------------------------------


class TestHelperRoundTrip:
    def test_helper_transaction_decodes_into_six_or_fewer_instructions(self):
        fee_payer = str(_fee_payer_keypair().pubkey())
        tx_b64, _ = _build_real_v1_transaction(
            fee_payer_str=fee_payer,
            pay_to=PAY_TO,
        )

        from x402.mechanisms.svm.types import ExactSvmPayload
        from x402.mechanisms.svm.utils import decode_transaction_from_payload

        decoded = decode_transaction_from_payload(ExactSvmPayload(transaction=tx_b64))

        assert 3 <= len(decoded.message.instructions) <= 6


@pytest.mark.parametrize(
    "scheme,network",
    [
        ("exact", "solana-devnet"),
        ("exact", "solana"),
    ],
)
def test_make_payload_constructs_valid_v1_payloads(scheme, network):
    payload = _make_payload(scheme=scheme, network=network)

    assert payload.scheme == scheme
    assert payload.network == network
    assert payload.payload == {"transaction": "base64transaction=="}
