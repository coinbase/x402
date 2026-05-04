"""Tests for the V1 legacy ExactEvmSchemeV1 facilitator."""

from __future__ import annotations

import time

import pytest

try:
    from eth_abi import encode as abi_encode
except ImportError:
    pytest.skip("eth-abi not available", allow_module_level=True)

from x402.mechanisms.evm import ERC6492_MAGIC_VALUE
from x402.mechanisms.evm.constants import (
    ERR_AUTHORIZATION_VALUE_MISMATCH,
    ERR_FAILED_TO_GET_NETWORK_CONFIG,
    ERR_FAILED_TO_VERIFY_SIGNATURE,
    ERR_INSUFFICIENT_BALANCE,
    ERR_INVALID_SIGNATURE,
    ERR_MISSING_EIP712_DOMAIN,
    ERR_NETWORK_MISMATCH,
    ERR_NONCE_ALREADY_USED,
    ERR_RECIPIENT_MISMATCH,
    ERR_SMART_WALLET_DEPLOYMENT_FAILED,
    ERR_TOKEN_NAME_MISMATCH,
    ERR_TRANSACTION_FAILED,
    ERR_TRANSACTION_SIMULATION_FAILED,
    ERR_UNDEPLOYED_SMART_WALLET,
    ERR_UNSUPPORTED_SCHEME,
    ERR_VALID_AFTER_FUTURE,
    ERR_VALID_BEFORE_EXPIRED,
)
from x402.mechanisms.evm.exact.v1.facilitator import (
    ExactEvmSchemeV1,
    ExactEvmSchemeV1Config,
)
from x402.mechanisms.evm.types import TransactionReceipt
from x402.schemas.v1 import PaymentPayloadV1, PaymentRequirementsV1

NETWORK = "base"
TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
PAYER = "0x1234567890123456789012345678901234567890"
RECIPIENT = "0x0987654321098765432109876543210987654321"
FACILITATOR = "0x1111111111111111111111111111111111111111"
FACTORY = "0x2222222222222222222222222222222222222222"
NONCE = "0x" + "11" * 32


def make_payment_payload_v1(
    *,
    signature: str = "0x" + "00" * 65,
    scheme: str = "exact",
    network: str = NETWORK,
    amount: str = "100000",
    authorization_overrides: dict | None = None,
) -> PaymentPayloadV1:
    now = int(time.time())
    authorization = {
        "from": PAYER,
        "to": RECIPIENT,
        "value": amount,
        "validAfter": str(now - 60),
        "validBefore": str(now + 600),
        "nonce": NONCE,
    }
    if authorization_overrides:
        authorization.update(authorization_overrides)

    return PaymentPayloadV1(
        x402_version=1,
        scheme=scheme,
        network=network,
        payload={"authorization": authorization, "signature": signature},
    )


def make_requirements_v1(
    *,
    scheme: str = "exact",
    network: str = NETWORK,
    amount: str = "100000",
    pay_to: str = RECIPIENT,
    extra: dict | None = None,
) -> PaymentRequirementsV1:
    return PaymentRequirementsV1(
        scheme=scheme,
        network=network,
        asset=TOKEN_ADDRESS,
        max_amount_required=amount,
        pay_to=pay_to,
        max_timeout_seconds=3600,
        resource="http://example.com/protected",
        extra=extra if extra is not None else {"name": "USD Coin", "version": "2"},
    )


def encode_result(abi_type: str, value):
    return abi_encode([abi_type], [value])


def make_diagnostic_results(
    *,
    balance: int = 100000,
    name: str = "USD Coin",
    version: str = "2",
    nonce_used: bool = False,
    authorization_state_supported: bool = True,
) -> list[tuple[bool, bytes]]:
    return [
        (True, encode_result("uint256", balance)),
        (True, encode_result("string", name)),
        (True, encode_result("string", version)),
        (
            authorization_state_supported,
            encode_result("bool", nonce_used) if authorization_state_supported else b"",
        ),
    ]


def make_erc6492_signature(inner_signature: bytes) -> str:
    payload = abi_encode(
        ["address", "bytes", "bytes"], [FACTORY, b"\xde\xad\xbe\xef", inner_signature]
    )
    return "0x" + (payload + ERC6492_MAGIC_VALUE).hex()


class MockFacilitatorSigner:
    """Mock signer that exposes just enough behavior for facilitator tests."""

    def __init__(
        self,
        *,
        addresses: list[str] | None = None,
        typed_data_valid: bool = True,
        code: bytes = b"",
        transfer_simulation_should_revert: bool = False,
        multicall_results: list[tuple[bool, bytes]] | None = None,
        deploy_tx_hash: str = "0x" + "12" * 32,
        deploy_receipt_status: int = 1,
        settle_receipt_status: int = 1,
        write_should_raise: Exception | None = None,
    ):
        self._addresses = addresses or [FACILITATOR]
        self.typed_data_valid = typed_data_valid
        self.code = code
        self.transfer_simulation_should_revert = transfer_simulation_should_revert
        self.multicall_results = multicall_results or []
        self.deploy_tx_hash = deploy_tx_hash
        self.deploy_receipt_status = deploy_receipt_status
        self.settle_receipt_status = settle_receipt_status
        self.write_should_raise = write_should_raise
        self.transfer_simulation_calls = 0
        self.write_calls = 0
        self.send_calls = 0

    def get_addresses(self) -> list[str]:
        return self._addresses

    def read_contract(self, address: str, abi: list[dict], function_name: str, *args):
        if function_name == "tryAggregate":
            return self.multicall_results

        if function_name == "transferWithAuthorization":
            self.transfer_simulation_calls += 1
            if self.transfer_simulation_should_revert:
                raise RuntimeError("simulation reverted")
            return None

        raise AssertionError(f"unexpected read_contract call: {function_name}")

    def verify_typed_data(
        self,
        address: str,
        domain,
        types,
        primary_type: str,
        message: dict,
        signature: bytes,
    ) -> bool:
        return self.typed_data_valid

    def write_contract(self, address: str, abi: list[dict], function_name: str, *args) -> str:
        self.write_calls += 1
        if self.write_should_raise is not None:
            raise self.write_should_raise
        return "0x" + "34" * 32

    def send_transaction(self, to: str, data: bytes) -> str:
        self.send_calls += 1
        return self.deploy_tx_hash

    def wait_for_transaction_receipt(self, tx_hash: str) -> TransactionReceipt:
        if tx_hash == self.deploy_tx_hash:
            return TransactionReceipt(
                status=self.deploy_receipt_status, block_number=1, tx_hash=tx_hash
            )
        return TransactionReceipt(
            status=self.settle_receipt_status, block_number=1, tx_hash=tx_hash
        )

    def get_balance(self, address: str, token_address: str) -> int:
        return 1_000_000_000

    def get_chain_id(self) -> int:
        return 8453

    def get_code(self, address: str) -> bytes:
        return self.code


class TestExactEvmSchemeV1Constructor:
    def test_creates_instance_with_default_config(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        assert facilitator.scheme == "exact"
        assert facilitator._config.deploy_erc4337_with_eip6492 is False
        assert facilitator._config.simulate_in_settle is False

    def test_creates_instance_with_custom_config(self):
        signer = MockFacilitatorSigner()
        config = ExactEvmSchemeV1Config(
            deploy_erc4337_with_eip6492=True,
            simulate_in_settle=True,
        )

        facilitator = ExactEvmSchemeV1(signer, config)

        assert facilitator._config.deploy_erc4337_with_eip6492 is True
        assert facilitator._config.simulate_in_settle is True


class TestExactEvmSchemeV1Attributes:
    def test_scheme_attribute_is_exact(self):
        facilitator = ExactEvmSchemeV1(MockFacilitatorSigner())
        assert facilitator.scheme == "exact"

    def test_caip_family_attribute(self):
        facilitator = ExactEvmSchemeV1(MockFacilitatorSigner())
        assert facilitator.caip_family == "eip155:*"

    def test_get_extra_returns_none(self):
        facilitator = ExactEvmSchemeV1(MockFacilitatorSigner())
        assert facilitator.get_extra(NETWORK) is None

    def test_get_signers_returns_signer_addresses(self):
        addresses = [
            "0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
        ]
        facilitator = ExactEvmSchemeV1(MockFacilitatorSigner(addresses=addresses))
        assert facilitator.get_signers(NETWORK) == addresses


class TestVerifyV1:
    def test_rejects_wrong_payload_scheme(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(scheme="other"),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_UNSUPPORTED_SCHEME
        assert result.payer == PAYER

    def test_rejects_wrong_requirements_scheme(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(),
            make_requirements_v1(scheme="other"),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_UNSUPPORTED_SCHEME

    def test_rejects_network_mismatch(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(network="base-sepolia"),
            make_requirements_v1(network="base"),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_NETWORK_MISMATCH

    def test_rejects_unknown_legacy_network(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(network="not-a-network"),
            make_requirements_v1(network="not-a-network"),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_FAILED_TO_GET_NETWORK_CONFIG
        assert "not-a-network" in (result.invalid_message or "")

    def test_rejects_missing_eip712_domain(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(),
            make_requirements_v1(extra={}),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_EIP712_DOMAIN

    def test_rejects_missing_only_version_key(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(),
            make_requirements_v1(extra={"name": "USD Coin"}),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_EIP712_DOMAIN

    def test_rejects_recipient_mismatch(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(authorization_overrides={"to": FACILITATOR}),
            make_requirements_v1(pay_to=RECIPIENT),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_RECIPIENT_MISMATCH

    def test_rejects_amount_mismatch_underpayment(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(amount="50000"),
            make_requirements_v1(amount="100000"),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_AUTHORIZATION_VALUE_MISMATCH

    def test_rejects_amount_mismatch_overpayment(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(amount="150000"),
            make_requirements_v1(amount="100000"),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_AUTHORIZATION_VALUE_MISMATCH

    def test_rejects_valid_before_too_close_to_now(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)
        now = int(time.time())

        result = facilitator.verify(
            make_payment_payload_v1(
                authorization_overrides={"validBefore": str(now + 2)},
            ),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_VALID_BEFORE_EXPIRED

    def test_rejects_valid_after_in_future(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)
        now = int(time.time())

        result = facilitator.verify(
            make_payment_payload_v1(
                authorization_overrides={"validAfter": str(now + 600)},
            ),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_VALID_AFTER_FUTURE

    def test_rejects_empty_signature(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature=""),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_INVALID_SIGNATURE

    def test_eoa_invalid_signature_is_rejected(self):
        signer = MockFacilitatorSigner(typed_data_valid=False, code=b"")
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0x" + "00" * 65),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_INVALID_SIGNATURE

    def test_undeployed_smart_wallet_without_deployment_info_is_rejected(self):
        signer = MockFacilitatorSigner(typed_data_valid=False, code=b"")
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0x" + "22" * 66),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_UNDEPLOYED_SMART_WALLET

    def test_classify_signature_exception_returns_failed_to_verify(self):
        # An odd-length hex (excluding the 0x prefix) raises during hex_to_bytes
        # before classification — exercising the broad except in _verify.
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0xabc"),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_FAILED_TO_VERIFY_SIGNATURE
        assert result.invalid_message is not None

    def test_eoa_valid_signature_short_circuits_simulation(self):
        signer = MockFacilitatorSigner(typed_data_valid=True)
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(),
            make_requirements_v1(),
        )

        # EOA-valid signatures still go through transfer simulation
        # (classification.is_smart_wallet is False but classification.valid is True).
        # The default mock signer returns a successful simulation.
        assert result.is_valid is True
        assert result.payer == PAYER
        assert signer.transfer_simulation_calls == 1

    def test_deployed_erc1271_falls_back_to_simulation_success(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"\x01",
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0x" + "22" * 66),
            make_requirements_v1(),
        )

        assert result.is_valid is True
        assert result.payer == PAYER
        assert signer.transfer_simulation_calls == 1

    def test_undeployed_erc6492_passes_when_simulation_succeeds(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"",
            multicall_results=[(True, b""), (True, b"")],
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature=make_erc6492_signature(b"\x33" * 66)),
            make_requirements_v1(),
        )

        assert result.is_valid is True
        assert result.payer == PAYER

    def test_undeployed_erc6492_fails_when_simulation_fails(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"",
            multicall_results=[(True, b""), (False, b"")],
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature=make_erc6492_signature(b"\x33" * 66)),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_TRANSACTION_SIMULATION_FAILED

    def test_diagnostic_reports_token_name_mismatch(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"\x01",
            transfer_simulation_should_revert=True,
            multicall_results=make_diagnostic_results(name="Wrong Coin"),
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0x" + "22" * 66),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_TOKEN_NAME_MISMATCH

    def test_diagnostic_reports_nonce_already_used(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"\x01",
            transfer_simulation_should_revert=True,
            multicall_results=make_diagnostic_results(nonce_used=True),
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0x" + "22" * 66),
            make_requirements_v1(),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_NONCE_ALREADY_USED

    def test_diagnostic_reports_insufficient_balance(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"\x01",
            transfer_simulation_should_revert=True,
            multicall_results=make_diagnostic_results(balance=1),
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.verify(
            make_payment_payload_v1(signature="0x" + "22" * 66),
            make_requirements_v1(amount="100000"),
        )

        assert result.is_valid is False
        assert result.invalid_reason == ERR_INSUFFICIENT_BALANCE


class TestSettleV1:
    def test_settle_short_circuits_when_verification_fails(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.settle(
            make_payment_payload_v1(scheme="wrong"),
            make_requirements_v1(),
        )

        assert result.success is False
        assert result.error_reason == ERR_UNSUPPORTED_SCHEME
        assert result.network == NETWORK
        assert result.payer == PAYER
        assert result.transaction == ""
        assert signer.write_calls == 0

    def test_settle_success_path_skips_simulation_by_default(self):
        signer = MockFacilitatorSigner(typed_data_valid=True)
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.settle(
            make_payment_payload_v1(),
            make_requirements_v1(),
        )

        assert result.success is True
        assert result.network == NETWORK
        assert result.payer == PAYER
        assert result.transaction.startswith("0x")
        assert signer.transfer_simulation_calls == 0
        assert signer.write_calls == 1

    def test_settle_reruns_simulation_when_configured(self):
        signer = MockFacilitatorSigner(typed_data_valid=True)
        facilitator = ExactEvmSchemeV1(
            signer,
            ExactEvmSchemeV1Config(simulate_in_settle=True),
        )

        result = facilitator.settle(
            make_payment_payload_v1(),
            make_requirements_v1(),
        )

        assert result.success is True
        assert signer.transfer_simulation_calls == 1
        assert signer.write_calls == 1

    def test_settle_returns_transaction_failed_on_bad_receipt(self):
        signer = MockFacilitatorSigner(typed_data_valid=True, settle_receipt_status=0)
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.settle(
            make_payment_payload_v1(),
            make_requirements_v1(),
        )

        assert result.success is False
        assert result.error_reason == ERR_TRANSACTION_FAILED
        assert result.transaction.startswith("0x")
        assert result.network == NETWORK
        assert result.payer == PAYER

    def test_settle_wraps_write_exception_with_parsed_error(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=True,
            write_should_raise=RuntimeError("boom from chain"),
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.settle(
            make_payment_payload_v1(),
            make_requirements_v1(),
        )

        assert result.success is False
        assert result.error_reason is not None
        assert result.error_message == "boom from chain"
        assert result.transaction == ""
        assert result.payer == PAYER
        assert result.network == NETWORK

    def test_settle_rejects_undeployed_wallet_when_deploy_disabled(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"",
            multicall_results=[(True, b""), (True, b"")],
        )
        facilitator = ExactEvmSchemeV1(signer)

        result = facilitator.settle(
            make_payment_payload_v1(signature=make_erc6492_signature(b"\x33" * 66)),
            make_requirements_v1(),
        )

        assert result.success is False
        assert result.error_reason == ERR_UNDEPLOYED_SMART_WALLET
        assert signer.send_calls == 0
        assert signer.write_calls == 0

    def test_settle_deploys_then_writes_when_enabled(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"",
            multicall_results=[(True, b""), (True, b"")],
        )
        facilitator = ExactEvmSchemeV1(
            signer,
            ExactEvmSchemeV1Config(deploy_erc4337_with_eip6492=True),
        )

        result = facilitator.settle(
            make_payment_payload_v1(signature=make_erc6492_signature(b"\x33" * 66)),
            make_requirements_v1(),
        )

        assert result.success is True
        assert signer.send_calls == 1
        assert signer.write_calls == 1

    def test_settle_returns_smart_wallet_deployment_failed_on_bad_deploy_receipt(self):
        signer = MockFacilitatorSigner(
            typed_data_valid=False,
            code=b"",
            multicall_results=[(True, b""), (True, b"")],
            deploy_receipt_status=0,
        )
        facilitator = ExactEvmSchemeV1(
            signer,
            ExactEvmSchemeV1Config(deploy_erc4337_with_eip6492=True),
        )

        result = facilitator.settle(
            make_payment_payload_v1(signature=make_erc6492_signature(b"\x33" * 66)),
            make_requirements_v1(),
        )

        assert result.success is False
        assert result.error_reason == ERR_SMART_WALLET_DEPLOYMENT_FAILED
        assert signer.send_calls == 1
        assert signer.write_calls == 0
        assert result.transaction == ""
