"""Tests for upto ERC-3009 payloads, verification, and settlement."""

from __future__ import annotations

import json
import time
from copy import deepcopy
from typing import Any

import pytest
from eth_account import Account

from x402.mechanisms.evm.constants import (
    ERR_UPTO_EIP3009_AMOUNT_MISMATCH,
    ERR_UPTO_EIP3009_INSUFFICIENT_BALANCE,
    ERR_UPTO_EIP3009_INVALID_SIGNATURE,
    ERR_UPTO_EIP3009_NONCE_ALREADY_USED,
    ERR_UPTO_EIP3009_NONCE_MISMATCH,
    ERR_UPTO_EIP3009_RECEIVER_MISMATCH,
    ERR_UPTO_EIP3009_RECIPIENT_MISMATCH,
    ERR_UPTO_EIP3009_SETTLER_MISMATCH,
    ERR_UPTO_EIP3009_SIMULATION_FAILED,
    ERR_UPTO_EIP3009_VALID_AFTER,
    ERR_UPTO_EIP3009_VALID_BEFORE,
    ERR_UPTO_INVALID_PAYLOAD,
    ERR_UPTO_PENDING_MISMATCH,
    ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT,
    ERR_UPTO_TRANSACTION_FAILED,
    X402_UPTO_EIP3009_PROXY_ADDRESS,
)
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.mechanisms.evm.types import (
    TransactionReceipt,
    UptoEIP3009Authorization,
    UptoEIP3009Payload,
    UptoEIP3009PaymentInfo,
    is_upto_eip3009_payload,
    is_upto_permit2_payload,
)
from x402.mechanisms.evm.upto import (
    UptoEvmClientScheme,
    UptoEvmFacilitatorScheme,
    create_upto_eip3009_nonce,
)
from x402.mechanisms.evm.upto.eip3009_utils import settle_upto_eip3009
from x402.pending_settlement_store import InMemoryPendingSettlementStore
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo

NETWORK = "eip155:84532"
TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
PAYER = "0x1111111111111111111111111111111111111111"
PAY_TO = "0x2222222222222222222222222222222222222222"
SETTLER = "0x3333333333333333333333333333333333333333"
SALT = "0x" + "44" * 32
MAXIMUM = "1000"


def make_requirements(
    *,
    amount: str = MAXIMUM,
    pay_to: str = PAY_TO,
    settler: str = SETTLER,
) -> PaymentRequirements:
    return PaymentRequirements(
        scheme="upto",
        network=NETWORK,
        asset=TOKEN,
        amount=amount,
        pay_to=pay_to,
        max_timeout_seconds=300,
        extra={
            "assetTransferMethod": "eip3009",
            "name": "USDC",
            "version": "2",
            "settlerAddress": settler,
        },
    )


def make_eip3009_payload(
    *,
    receiver: str = X402_UPTO_EIP3009_PROXY_ADDRESS,
    value: str = MAXIMUM,
    pay_to: str = PAY_TO,
    settler: str = SETTLER,
    salt: str = SALT,
    nonce: str | None = None,
    valid_after: str | None = None,
    valid_before: str | None = None,
    signature: str = "0x" + "aa" * 65,
) -> UptoEIP3009Payload:
    return UptoEIP3009Payload(
        signature=signature,
        authorization=UptoEIP3009Authorization(
            from_address=PAYER,
            to=receiver,
            value=value,
            valid_after=valid_after or "0",
            valid_before=valid_before or str(int(time.time()) + 300),
            nonce=nonce or create_upto_eip3009_nonce(pay_to, settler, salt),
        ),
        payment_info=UptoEIP3009PaymentInfo(pay_to=pay_to, settler=settler, salt=salt),
    )


def make_payment_payload(eip3009_payload: UptoEIP3009Payload | None = None) -> PaymentPayload:
    requirements = make_requirements()
    return PaymentPayload(
        x402_version=2,
        resource=ResourceInfo(
            url="https://example.com", description="", mime_type="application/json"
        ),
        accepted=requirements,
        payload=(eip3009_payload or make_eip3009_payload()).to_dict(),
    )


class MockSigner:
    def __init__(
        self,
        *,
        addresses: list[str] | None = None,
        signature_valid: bool = True,
        balance: int = int(MAXIMUM),
        authorization_used: bool = False,
        simulation_ok: bool = True,
        receipt_ok: bool = True,
        receipt_error: Exception | None = None,
        payer_code: bytes = b"\x60",
    ) -> None:
        self.addresses = addresses if addresses is not None else [SETTLER]
        self.signature_valid = signature_valid
        self.balance = balance
        self.authorization_used = authorization_used
        self.simulation_ok = simulation_ok
        self.receipt_ok = receipt_ok
        self.receipt_error = receipt_error
        self.payer_code = payer_code
        self.legacy_verify_calls = 0
        self.read_calls: list[tuple[Any, ...]] = []
        self.write_calls: list[tuple[Any, ...]] = []

    def get_addresses(self) -> list[str]:
        return self.addresses

    def get_code(self, address: str) -> bytes:
        return b"\x60" if address.lower() == TOKEN.lower() else self.payer_code

    def verify_typed_data(self, *args: Any, **kwargs: Any) -> bool:
        self.legacy_verify_calls += 1
        return self.signature_valid

    def read_contract(self, address: str, abi: list[dict], function_name: str, *args: Any) -> Any:
        self.read_calls.append((address, function_name, args))
        if function_name == "balanceOf":
            return self.balance
        if function_name == "authorizationState":
            return self.authorization_used
        if function_name == "isValidSignature":
            return b"\x16\x26\xba\x7e" if self.signature_valid else b"\xff\xff\xff\xff"
        if function_name == "settle":
            if not self.simulation_ok:
                raise RuntimeError("simulation failed")
            return None
        raise AssertionError(function_name)

    def write_contract(
        self,
        address: str,
        abi: list[dict],
        function_name: str,
        *args: Any,
        data_suffix: str | None = None,
    ) -> str:
        self.write_calls.append((address, function_name, args, data_suffix))
        return "0x" + "12" * 32

    def wait_for_transaction_receipt(self, tx_hash: str) -> TransactionReceipt:
        if self.receipt_error is not None:
            raise self.receipt_error
        return TransactionReceipt(
            status=1 if self.receipt_ok else 0, block_number=1, tx_hash=tx_hash
        )


class TestUptoEIP3009Types:
    def test_proxy_address_matches_canonical_deployment(self):
        assert X402_UPTO_EIP3009_PROXY_ADDRESS == "0x40203Fa50150e6ec970DE91F3330e82cDF640006"

    def test_nonce_golden_vector(self):
        nonce = create_upto_eip3009_nonce(
            "0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
            "0x3333333333333333333333333333333333333333333333333333333333333333",
        )
        assert nonce == "0xbb2cf01051588e1c1c809cf1357c11cf9132a08bb4cff35b57dc1a38f28ca0fa"

    def test_payload_round_trip(self):
        payload = make_eip3009_payload()
        assert UptoEIP3009Payload.from_dict(payload.to_dict()) == payload
        assert is_upto_eip3009_payload(payload.to_dict())

    @pytest.mark.parametrize(
        ("path", "key"),
        [
            ((), "signature"),
            (("authorization",), "nonce"),
            (("paymentInfo",), "salt"),
        ],
    )
    def test_guard_rejects_missing_fields(self, path: tuple[str, ...], key: str):
        raw = make_eip3009_payload().to_dict()
        target = raw
        for part in path:
            target = target[part]
        del target[key]
        assert not is_upto_eip3009_payload(raw)
        with pytest.raises(ValueError, match="invalid upto EIP-3009 payload"):
            UptoEIP3009Payload.from_dict(raw)

    def test_guards_reject_mixed_payload(self):
        raw = make_eip3009_payload().to_dict()
        raw["permit2Authorization"] = {}
        assert not is_upto_eip3009_payload(raw)
        assert not is_upto_permit2_payload(raw)


class TestUptoEIP3009Client:
    def test_explicit_eip3009_creates_receive_authorization(self):
        account = Account.create()
        requirements = make_requirements()
        requirements.extra["settlerAddress"] = SETTLER
        payload = UptoEvmClientScheme(EthAccountSigner(account)).create_payment_payload(
            requirements,
            extensions={"erc20ApprovalGasSponsoring": {}},
        )
        assert is_upto_eip3009_payload(payload)
        assert payload["authorization"]["from"] == account.address
        assert payload["authorization"]["to"] == X402_UPTO_EIP3009_PROXY_ADDRESS
        assert payload["authorization"]["value"] == MAXIMUM
        assert payload["paymentInfo"]["settler"].lower() == SETTLER.lower()
        assert "__extensions" not in payload

    def test_requires_domain_and_settler(self):
        account = Account.create()
        requirements = make_requirements()
        del requirements.extra["name"]
        with pytest.raises(ValueError, match="domain parameters"):
            UptoEvmClientScheme(account).create_payment_payload(requirements)

        requirements = make_requirements()
        del requirements.extra["settlerAddress"]
        with pytest.raises(ValueError, match="settlerAddress"):
            UptoEvmClientScheme(account).create_payment_payload(requirements)

    def test_missing_timeout_uses_default_validity_period(self):
        account = Account.create()
        requirements = make_requirements()
        requirements.max_timeout_seconds = None
        before = int(time.time())

        payload = UptoEvmClientScheme(account).create_payment_payload(requirements)

        valid_before = int(payload["authorization"]["validBefore"])
        assert before + 3599 <= valid_before <= int(time.time()) + 3600


class TestUptoEIP3009Verify:
    def verify(
        self,
        eip3009_payload: UptoEIP3009Payload | None = None,
        *,
        signer: MockSigner | None = None,
        requirements: PaymentRequirements | None = None,
    ):
        facilitator = UptoEvmFacilitatorScheme(signer or MockSigner())
        return facilitator.verify(
            make_payment_payload(eip3009_payload),
            requirements or make_requirements(),
        )

    def test_accepts_valid_payload_and_simulates_maximum(self):
        signer = MockSigner()
        result = self.verify(signer=signer)
        assert result.is_valid
        settle_read = next(call for call in signer.read_calls if call[1] == "settle")
        assert settle_read[2][1] == int(MAXIMUM)

    def test_simulation_uses_selected_settler_with_read_contract_from(self):
        class ReadFromSigner(MockSigner):
            def __init__(self):
                super().__init__(addresses=[PAY_TO, SETTLER])
                self.read_from_calls: list[tuple[Any, ...]] = []

            def read_contract_from(
                self,
                from_address: str,
                address: str,
                abi: list[dict],
                function_name: str,
                *args: Any,
            ) -> None:
                self.read_from_calls.append((from_address, address, function_name, args))

        signer = ReadFromSigner()

        result = self.verify(signer=signer)

        assert result.is_valid
        assert len(signer.read_from_calls) == 1
        assert signer.read_from_calls[0][0].lower() == SETTLER.lower()
        assert signer.read_from_calls[0][1] == X402_UPTO_EIP3009_PROXY_ADDRESS
        assert signer.read_from_calls[0][2] == "settle"
        assert not any(call[1] == "settle" for call in signer.read_calls)

    def test_simulation_rejects_multi_address_fallback_without_selected_read(self):
        signer = MockSigner(addresses=[PAY_TO, SETTLER])

        result = self.verify(signer=signer)

        assert not result.is_valid
        assert result.invalid_reason == ERR_UPTO_EIP3009_SIMULATION_FAILED
        assert not any(call[1] == "settle" for call in signer.read_calls)

    def test_get_extra_returns_same_selected_address_for_both_methods(self):
        extra = UptoEvmFacilitatorScheme(MockSigner()).get_extra(NETWORK)
        assert extra == {"facilitatorAddress": SETTLER, "settlerAddress": SETTLER}

    @pytest.mark.parametrize("asset_transfer_method", [None, "permit2", "EIP3009"])
    def test_requires_explicit_eip3009_asset_transfer_method(self, asset_transfer_method):
        requirements = make_requirements()
        if asset_transfer_method is None:
            del requirements.extra["assetTransferMethod"]
        else:
            requirements.extra["assetTransferMethod"] = asset_transfer_method

        result = self.verify(requirements=requirements)

        assert not result.is_valid
        assert result.invalid_reason == ERR_UPTO_INVALID_PAYLOAD

    @pytest.mark.parametrize(
        ("section", "field", "value"),
        [
            ("authorization", "from", "not-an-address"),
            ("authorization", "to", "not-an-address"),
            ("authorization", "value", "not-a-number"),
            ("authorization", "validAfter", "not-a-number"),
            ("authorization", "validBefore", "not-a-number"),
            ("authorization", "nonce", 123),
            ("paymentInfo", "payTo", "not-an-address"),
            ("paymentInfo", "settler", "not-an-address"),
            ("paymentInfo", "salt", "not-hex"),
        ],
    )
    def test_malformed_numeric_and_address_fields_return_invalid(
        self, section: str, field: str, value: Any
    ):
        payment = make_payment_payload()
        raw = deepcopy(payment.payload)
        raw[section][field] = value
        payment.payload = raw

        result = UptoEvmFacilitatorScheme(MockSigner()).verify(payment, make_requirements())

        assert not result.is_valid
        assert result.invalid_reason == ERR_UPTO_INVALID_PAYLOAD

    @pytest.mark.parametrize(
        ("payload", "requirements", "reason"),
        [
            (
                make_eip3009_payload(receiver="0x5555555555555555555555555555555555555555"),
                make_requirements(),
                ERR_UPTO_EIP3009_RECEIVER_MISMATCH,
            ),
            (
                make_eip3009_payload(value="999"),
                make_requirements(),
                ERR_UPTO_EIP3009_AMOUNT_MISMATCH,
            ),
            (
                make_eip3009_payload(pay_to="0x5555555555555555555555555555555555555555"),
                make_requirements(),
                ERR_UPTO_EIP3009_RECIPIENT_MISMATCH,
            ),
            (
                make_eip3009_payload(nonce="0x" + "00" * 32),
                make_requirements(),
                ERR_UPTO_EIP3009_NONCE_MISMATCH,
            ),
            (
                make_eip3009_payload(valid_before="1"),
                make_requirements(),
                ERR_UPTO_EIP3009_VALID_BEFORE,
            ),
            (
                make_eip3009_payload(valid_after=str(int(time.time()) + 100)),
                make_requirements(),
                ERR_UPTO_EIP3009_VALID_AFTER,
            ),
        ],
    )
    def test_rejects_invalid_commitments(self, payload, requirements, reason):
        result = self.verify(payload, requirements=requirements)
        assert not result.is_valid
        assert result.invalid_reason == reason

    def test_rejects_required_settler_mismatch(self):
        result = self.verify(requirements=make_requirements(settler=PAY_TO))
        assert result.invalid_reason == ERR_UPTO_EIP3009_SETTLER_MISMATCH

    def test_rejects_settler_not_owned_by_signer(self):
        result = self.verify(signer=MockSigner(addresses=[PAY_TO]))
        assert result.invalid_reason == ERR_UPTO_EIP3009_SETTLER_MISMATCH

    @pytest.mark.parametrize(
        ("signer", "reason"),
        [
            (MockSigner(signature_valid=False), ERR_UPTO_EIP3009_INVALID_SIGNATURE),
            (MockSigner(balance=999), ERR_UPTO_EIP3009_INSUFFICIENT_BALANCE),
            (MockSigner(authorization_used=True), ERR_UPTO_EIP3009_NONCE_ALREADY_USED),
            (MockSigner(simulation_ok=False), ERR_UPTO_EIP3009_SIMULATION_FAILED),
        ],
    )
    def test_rejects_onchain_validation_failures(self, signer: MockSigner, reason: str):
        result = self.verify(signer=signer)
        assert not result.is_valid
        assert result.invalid_reason == reason

    def test_strict_code_routing_rejects_delegate_without_eoa_fallback(self):
        account = Account.from_key("0x" + "a" * 64)
        requirements = make_requirements()
        raw_payload = UptoEvmClientScheme(account).create_payment_payload(requirements)
        payment = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="https://example.com", description="", mime_type="application/json"
            ),
            accepted=requirements,
            payload=raw_payload,
        )
        signer = MockSigner(
            signature_valid=False,
            payer_code=b"\xef\x01\x00" + bytes(20),
        )

        result = UptoEvmFacilitatorScheme(signer).verify(payment, requirements)

        assert not result.is_valid
        assert result.invalid_reason == ERR_UPTO_EIP3009_INVALID_SIGNATURE
        assert signer.legacy_verify_calls == 0


class TestUptoEIP3009Settle:
    def test_partial_settlement_calls_proxy_with_actual_amount(self):
        signer = MockSigner()
        facilitator = UptoEvmFacilitatorScheme(signer)
        result = facilitator.settle(make_payment_payload(), make_requirements(amount="400"))
        assert result.success
        assert result.amount == "400"
        assert len(signer.write_calls) == 1
        address, function_name, args, _ = signer.write_calls[0]
        assert address == X402_UPTO_EIP3009_PROXY_ADDRESS
        assert function_name == "settle"
        assert args[1] == 400
        settle_read = next(call for call in signer.read_calls if call[1] == "settle")
        assert settle_read[2][1] == 400

    def test_actual_amount_simulation_failure_blocks_broadcast(self):
        signer = MockSigner(simulation_ok=False)
        result = UptoEvmFacilitatorScheme(signer).settle(
            make_payment_payload(), make_requirements(amount="400")
        )

        assert not result.success
        assert result.error_reason == ERR_UPTO_EIP3009_SIMULATION_FAILED
        assert signer.write_calls == []

    def test_zero_skips_proxy_write_after_reverification(self):
        signer = MockSigner()
        result = UptoEvmFacilitatorScheme(signer).settle(
            make_payment_payload(), make_requirements(amount="0")
        )
        assert result.success
        assert result.amount == "0"
        assert signer.write_calls == []

    def test_actual_above_maximum_fails(self):
        signer = MockSigner()
        result = UptoEvmFacilitatorScheme(signer).settle(
            make_payment_payload(), make_requirements(amount="1001")
        )
        assert not result.success
        assert result.error_reason == ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT
        assert signer.write_calls == []

    def test_settlement_reverifies_authorized_maximum(self):
        signer = MockSigner()
        payment = make_payment_payload()
        requirements = make_requirements(amount="400")
        requirements.extra = deepcopy(payment.accepted.extra)
        result = UptoEvmFacilitatorScheme(signer).settle(payment, requirements)
        assert result.success
        balance_call = next(call for call in signer.read_calls if call[1] == "balanceOf")
        assert balance_call

    def test_appends_resolved_data_suffix(self):
        class BuilderExtension:
            def build_data_suffix(self, payload, requirements):
                return "0x1234"

        class Context:
            def get_extension(self, key: str):
                return BuilderExtension() if key == "builder-code" else None

        signer = MockSigner()
        result = UptoEvmFacilitatorScheme(signer).settle(
            make_payment_payload(),
            make_requirements(amount="400"),
            Context(),
        )

        assert result.success
        assert signer.write_calls[0][3] == "0x1234"

    def test_pending_store_is_keyed_by_signature_and_retry_does_not_rebroadcast(self):
        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        facilitator = UptoEvmFacilitatorScheme(signer)
        payment = make_payment_payload()
        signature = payment.payload["signature"]

        first = facilitator.settle(payment, make_requirements(amount="400"))
        assert not first.success
        stored_record = json.loads(facilitator._pending_store.get(signature))
        assert stored_record["txHash"] == first.transaction
        assert stored_record["fingerprint"]["amount"] == "400"
        assert len(signer.write_calls) == 1

        signer.receipt_error = None
        second = facilitator.settle(payment, make_requirements(amount="400"))
        assert second.success
        assert second.transaction == first.transaction
        assert len(signer.write_calls) == 1
        assert facilitator._pending_store.get(signature) is None

    @pytest.mark.parametrize(
        "mutation",
        ["network", "amount", "payer", "asset", "payTo", "payloadPayTo", "nonce"],
    )
    def test_pending_retry_mismatch_preserves_pending_state(self, mutation: str):
        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        facilitator = UptoEvmFacilitatorScheme(signer)
        payment = make_payment_payload()
        requirements = make_requirements(amount="400")
        first = facilitator.settle(payment, requirements)
        signature = payment.payload["signature"]
        stored_record = facilitator._pending_store.get(signature)

        retry_payment = deepcopy(payment)
        retry_requirements = deepcopy(requirements)
        if mutation == "network":
            retry_requirements.network = "eip155:1"
        elif mutation == "amount":
            retry_requirements.amount = "401"
        elif mutation == "payer":
            retry_payment.payload["authorization"]["from"] = PAY_TO
        elif mutation == "asset":
            retry_requirements.asset = PAY_TO
        elif mutation == "payTo":
            retry_requirements.pay_to = PAYER
        elif mutation == "payloadPayTo":
            retry_payment.payload["paymentInfo"]["payTo"] = PAYER
        else:
            retry_payment.payload["authorization"]["nonce"] = "0x" + "55" * 32

        second = facilitator.settle(retry_payment, retry_requirements)

        assert not first.success
        assert not second.success
        assert second.error_reason == ERR_UPTO_PENDING_MISMATCH
        assert len(signer.write_calls) == 1
        assert facilitator._pending_store.get(signature) == stored_record

    def test_pending_retry_rejects_malformed_record_without_deleting_state(self):
        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        facilitator = UptoEvmFacilitatorScheme(signer)
        payment = make_payment_payload()
        requirements = make_requirements(amount="400")
        first = facilitator.settle(payment, requirements)
        signature = payment.payload["signature"]
        facilitator._pending_store.set(signature, '{"txHash":"tampered"}')

        second = facilitator.settle(payment, requirements)

        assert not first.success
        assert second.error_reason == ERR_UPTO_PENDING_MISMATCH
        assert facilitator._pending_store.get(signature) == '{"txHash":"tampered"}'

    def test_pending_retry_rejects_invalid_hash_without_deleting_valid_fingerprint(self):
        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        facilitator = UptoEvmFacilitatorScheme(signer)
        payment = make_payment_payload()
        requirements = make_requirements(amount="400")
        first = facilitator.settle(payment, requirements)
        signature = payment.payload["signature"]
        record = json.loads(facilitator._pending_store.get(signature))
        record["txHash"] = "tampered"
        tampered_record = json.dumps(record, sort_keys=True, separators=(",", ":"))
        facilitator._pending_store.set(signature, tampered_record)

        second = facilitator.settle(payment, requirements)

        assert not first.success
        assert second.error_reason == ERR_UPTO_PENDING_MISMATCH
        assert facilitator._pending_store.get(signature) == tampered_record
        assert len(signer.write_calls) == 1

    def test_pending_read_error_does_not_broadcast(self):
        class ReadFailingStore(InMemoryPendingSettlementStore):
            def get(self, key: str) -> str | None:
                raise RuntimeError("pending store unavailable")

        signer = MockSigner()
        facilitator = UptoEvmFacilitatorScheme(signer, pending_store=ReadFailingStore())

        result = facilitator.settle(make_payment_payload(), make_requirements(amount="400"))

        assert not result.success
        assert result.error_reason == ERR_UPTO_PENDING_MISMATCH
        assert "failed to read pending settlement record" in result.error_message
        assert signer.write_calls == []

    def test_pending_retry_terminal_failure_cleans_metadata(self):
        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        facilitator = UptoEvmFacilitatorScheme(signer)
        payment = make_payment_payload()
        requirements = make_requirements(amount="400")
        first = facilitator.settle(payment, requirements)
        signature = payment.payload["signature"]

        signer.receipt_error = None
        signer.receipt_ok = False
        second = facilitator.settle(payment, requirements)

        assert not first.success
        assert not second.success
        assert second.error_reason == ERR_UPTO_TRANSACTION_FAILED
        assert facilitator._pending_store.get(signature) is None

    def test_atomic_record_set_failure_requires_manual_reconciliation(self):
        class SetFailingStore(InMemoryPendingSettlementStore):
            def set(self, key: str, tx_hash: str) -> None:
                raise RuntimeError("pending store unavailable")

        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        store = SetFailingStore()
        facilitator = UptoEvmFacilitatorScheme(signer, pending_store=store)
        payment = make_payment_payload()
        signature = payment.payload["signature"]

        result = facilitator.settle(payment, make_requirements(amount="400"))

        assert not result.success
        assert result.error_reason == ERR_UPTO_TRANSACTION_FAILED
        assert result.transaction == "0x" + "12" * 32
        assert "settlement_pending" in result.error_message
        assert "manual reconciliation required" in result.error_message
        assert store.get(signature) is None

    def test_no_pending_store_requires_manual_reconciliation(self):
        signer = MockSigner(receipt_error=TimeoutError("receipt timeout"))
        payment = make_payment_payload()
        requirements = make_requirements(amount="400")

        result = settle_upto_eip3009(
            signer,
            payment,
            requirements,
            make_eip3009_payload(),
            pending_store=None,
        )

        assert not result.success
        assert result.error_reason == ERR_UPTO_TRANSACTION_FAILED
        assert result.transaction == "0x" + "12" * 32
        assert result.network == NETWORK
        assert result.payer == PAYER
        assert result.amount == "400"
        assert "settlement_pending" in result.error_message
        assert "manual reconciliation required" in result.error_message
        assert len(signer.write_calls) == 1

    def test_multi_address_signer_without_write_from_fails_before_broadcast(self):
        signer = MockSigner(addresses=[SETTLER, PAY_TO])
        result = UptoEvmFacilitatorScheme(signer).settle(
            make_payment_payload(), make_requirements(amount="400")
        )

        assert not result.success
        assert result.error_reason == ERR_UPTO_EIP3009_SIMULATION_FAILED
        assert signer.write_calls == []

    def test_invalid_transaction_hash_fails_terminally(self):
        class InvalidHashSigner(MockSigner):
            def write_contract(
                self,
                address: str,
                abi: list[dict],
                function_name: str,
                *args: Any,
                data_suffix: str | None = None,
            ) -> str:
                return "0x1234"

        facilitator = UptoEvmFacilitatorScheme(InvalidHashSigner())
        result = facilitator.settle(make_payment_payload(), make_requirements(amount="400"))

        assert not result.success
        assert result.error_reason == ERR_UPTO_TRANSACTION_FAILED
        assert facilitator._pending_store.get(make_eip3009_payload().signature) is None

    def test_write_contract_from_uses_bound_settler(self):
        class WriteFromSigner(MockSigner):
            def __init__(self):
                super().__init__(addresses=[SETTLER, PAY_TO])
                self.read_from_calls: list[tuple[Any, ...]] = []
                self.write_from_calls: list[tuple[Any, ...]] = []

            def read_contract_from(
                self,
                from_address: str,
                address: str,
                abi: list[dict],
                function_name: str,
                *args: Any,
            ) -> Any:
                self.read_from_calls.append((from_address, address, function_name, args))
                return self.read_contract(address, abi, function_name, *args)

            def write_contract_from(
                self,
                from_address: str,
                address: str,
                abi: list[dict],
                function_name: str,
                *args: Any,
                data_suffix: str | None = None,
            ) -> str:
                self.write_from_calls.append(
                    (from_address, address, function_name, args, data_suffix)
                )
                return "0x" + "34" * 32

        signer = WriteFromSigner()
        result = UptoEvmFacilitatorScheme(signer).settle(
            make_payment_payload(), make_requirements(amount="400")
        )

        assert result.success
        assert len(signer.read_from_calls) == 1
        assert signer.read_from_calls[0][0].lower() == SETTLER.lower()
        assert signer.write_calls == []
        assert len(signer.write_from_calls) == 1
        assert signer.write_from_calls[0][0].lower() == SETTLER.lower()
        assert signer.write_from_calls[0][1] == X402_UPTO_EIP3009_PROXY_ADDRESS
