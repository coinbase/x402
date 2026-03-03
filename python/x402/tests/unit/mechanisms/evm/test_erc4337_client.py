"""Tests for ERC-4337 client scheme."""

from unittest.mock import MagicMock

import pytest

from x402.mechanisms.evm.erc4337_types import UserOperation07Json
from x402.mechanisms.evm.exact.erc4337_client import (
    ExactEvmSchemeERC4337,
    _build_erc20_transfer_calldata,
)
from x402.mechanisms.evm.exact.erc4337_errors import PaymentCreationError, parse_aa_error
from x402.schemas import PaymentRequirements


def _make_mock_signer(address="0xSender", signature="0xMockSig"):
    signer = MagicMock()
    signer.address = address
    signer.sign_user_operation.return_value = signature
    return signer


def _make_mock_bundler(user_op=None):
    bundler = MagicMock()
    if user_op is None:
        user_op = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="",
        )
    bundler.prepare_user_operation.return_value = user_op
    return bundler


def _make_requirements(**kwargs):
    req = MagicMock(spec=PaymentRequirements)
    req.network = kwargs.get("network", "eip155:84532")
    req.amount = kwargs.get("amount", "1000000")
    req.asset = kwargs.get("asset", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")
    req.pay_to = kwargs.get("pay_to", "0xRecipient")
    req.extra = kwargs.get("extra", {
        "userOperation": {
            "supported": True,
            "bundlerUrl": "https://bundler.example.com",
            "entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
    })
    return req


class TestExactEvmSchemeERC4337Client:
    def test_scheme(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
        )
        assert scheme.scheme == "exact"

    def test_create_payload_success(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        payload = scheme.create_payment_payload(_make_requirements())
        assert "userOperation" in payload
        assert "entryPoint" in payload
        assert payload["userOperation"]["signature"] == "0xMockSig"

    def test_missing_entrypoint(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            bundler_url="https://bundler.example.com",
        )

        req = _make_requirements()
        req.extra = None

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(req)
        assert exc.value.phase == "validation"

    def test_missing_bundler_url(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        )

        req = _make_requirements()
        req.extra = None

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(req)
        assert exc.value.phase == "validation"

    def test_missing_amount(self):
        """create_payment_payload raises PaymentCreationError when amount is empty."""
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        req = _make_requirements(amount="")

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(req)
        assert exc.value.phase == "validation"
        assert "Missing amount" in str(exc.value)

    def test_preparation_fails(self):
        bundler = _make_mock_bundler()
        bundler.prepare_user_operation.side_effect = Exception("AA21 error")

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=bundler,
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.phase == "preparation"

    def test_signing_fails(self):
        signer = _make_mock_signer()
        signer.sign_user_operation.side_effect = Exception("signing error")

        scheme = ExactEvmSchemeERC4337(
            signer=signer,
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.phase == "signing"

    def test_entrypoint_from_requirements(self):
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            bundler_url="https://bundler.example.com",
        )

        payload = scheme.create_payment_payload(_make_requirements())
        assert payload["entryPoint"] == "0x0000000071727De22E5E9d8BAf0edAc6f37da032"

    def test_return_value_structure(self):
        """create_payment_payload returns dict with type=erc4337 and bundlerRpcUrl."""
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        payload = scheme.create_payment_payload(_make_requirements())
        assert payload["type"] == "erc4337"
        assert payload["bundlerRpcUrl"] == "https://bundler.example.com"
        assert payload["entryPoint"] == "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        assert isinstance(payload["userOperation"], dict)
        assert "sender" in payload["userOperation"]
        assert "signature" in payload["userOperation"]

    def test_aa_error_code_propagation(self):
        """PaymentCreationError includes AA code when error message contains one."""
        bundler = _make_mock_bundler()
        bundler.prepare_user_operation.side_effect = Exception(
            "AA24 Signature validation failed"
        )

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=bundler,
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.code == "AA24"
        assert exc.value.phase == "preparation"
        assert "Signature validation failed" in exc.value.reason

    def test_aa_error_code_in_signing_phase(self):
        """PaymentCreationError includes AA code from signing phase errors."""
        signer = _make_mock_signer()
        signer.sign_user_operation.side_effect = Exception(
            "AA25 nonce validation failed"
        )

        scheme = ExactEvmSchemeERC4337(
            signer=signer,
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.code == "AA25"
        assert exc.value.phase == "signing"

    def test_non_aa_error_has_no_code(self):
        """PaymentCreationError has code=None for errors without AA codes."""
        bundler = _make_mock_bundler()
        bundler.prepare_user_operation.side_effect = Exception("generic timeout error")

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=bundler,
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.code is None
        assert exc.value.reason == "generic timeout error"

    def test_preparation_non_error_exception(self):
        """PaymentCreationError wraps non-standard exceptions (e.g. RuntimeError)."""
        bundler = _make_mock_bundler()
        bundler.prepare_user_operation.side_effect = RuntimeError("runtime failure")

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=bundler,
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.phase == "preparation"
        assert exc.value.code is None
        assert "runtime failure" in exc.value.reason

    def test_preparation_value_error_no_aa_code(self):
        """PaymentCreationError wraps ValueError with no AA code, code=None."""
        bundler = _make_mock_bundler()
        bundler.prepare_user_operation.side_effect = ValueError("bad value")

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=bundler,
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        with pytest.raises(PaymentCreationError) as exc:
            scheme.create_payment_payload(_make_requirements())
        assert exc.value.phase == "preparation"
        assert exc.value.code is None
        assert exc.value.reason == "bad value"

    def test_bundler_url_from_requirements_extra(self):
        """create_payment_payload resolves bundler_url from requirements.extra."""
        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            # No bundler_url in config
        )

        payload = scheme.create_payment_payload(_make_requirements())
        assert payload["bundlerRpcUrl"] == "https://bundler.example.com"

    def test_entrypoint_config_wins_over_capability(self):
        """Config entrypoint takes priority over capability entrypoint."""
        config_ep = "0xConfigEntryPoint1234567890123456789012"
        capability_ep = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(),
            entrypoint=config_ep,
            bundler_url="https://bundler.example.com",
        )

        req = _make_requirements(extra={
            "userOperation": {
                "supported": True,
                "bundlerUrl": "https://bundler.example.com",
                "entrypoint": capability_ep,
            }
        })

        payload = scheme.create_payment_payload(req)
        assert payload["entryPoint"] == config_ep

    def test_signed_user_op_optional_field_propagation(self):
        """Signed user op preserves factory, paymaster fields from prepare."""
        user_op = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="",
            factory="0xFactory",
            factory_data="0xFactoryData",
            paymaster="0xPaymaster",
            paymaster_data="0xPaymasterData",
            paymaster_verification_gas_limit="0x20000",
            paymaster_post_op_gas_limit="0x30000",
        )

        scheme = ExactEvmSchemeERC4337(
            signer=_make_mock_signer(),
            bundler_client=_make_mock_bundler(user_op=user_op),
            entrypoint="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            bundler_url="https://bundler.example.com",
        )

        payload = scheme.create_payment_payload(_make_requirements())
        op = payload["userOperation"]
        assert op["factory"] == "0xFactory"
        assert op["factoryData"] == "0xFactoryData"
        assert op["paymaster"] == "0xPaymaster"
        assert op["paymasterData"] == "0xPaymasterData"
        assert op["paymasterVerificationGasLimit"] == "0x20000"
        assert op["paymasterPostOpGasLimit"] == "0x30000"


class TestBuildErc20TransferCalldata:
    """Tests for _build_erc20_transfer_calldata()."""

    def test_correct_function_selector(self):
        """Calldata starts with the transfer(address,uint256) selector 0xa9059cbb."""
        result = _build_erc20_transfer_calldata("0x1234567890abcdef1234567890abcdef12345678", 1000)
        assert result.startswith("0xa9059cbb")

    def test_address_padding_to_32_bytes(self):
        """Address is left-padded with zeros to 32 bytes (64 hex chars)."""
        addr = "0x1234567890abcdef1234567890abcdef12345678"
        result = _build_erc20_transfer_calldata(addr, 1000)
        # Strip selector: 0x + 8 selector chars = 10 chars
        address_part = result[10:74]  # Next 64 hex chars
        assert len(address_part) == 64
        # Address without 0x is 40 chars, so we expect 24 leading zeros
        assert address_part == "0000000000000000000000001234567890abcdef1234567890abcdef12345678"

    def test_amount_encoding(self):
        """Amount is correctly encoded as uint256 (32 bytes, hex)."""
        result = _build_erc20_transfer_calldata("0x1234567890abcdef1234567890abcdef12345678", 1000000)
        amount_part = result[74:]  # After selector + address
        assert len(amount_part) == 64
        # 1000000 = 0xF4240
        assert amount_part == "00000000000000000000000000000000000000000000000000000000000f4240"

    def test_zero_amount(self):
        """Zero amount produces all-zero uint256."""
        result = _build_erc20_transfer_calldata("0x1234567890abcdef1234567890abcdef12345678", 0)
        amount_part = result[74:]
        assert amount_part == "0" * 64

    def test_large_amount(self):
        """Large amount (uint256-scale) is encoded correctly."""
        large_amount = 2**128 - 1  # 170141183460469231731687303715884105727
        result = _build_erc20_transfer_calldata("0x1234567890abcdef1234567890abcdef12345678", large_amount)
        amount_part = result[74:]
        assert len(amount_part) == 64
        expected_hex = hex(large_amount)[2:].zfill(64)
        assert amount_part == expected_hex

    def test_total_calldata_length(self):
        """Total calldata is 0x + 4-byte selector + 32-byte address + 32-byte amount = 138 chars."""
        result = _build_erc20_transfer_calldata("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", 42)
        # 2 (0x) + 8 (selector) + 64 (address) + 64 (amount) = 138
        assert len(result) == 138


class TestParseAAError:
    def test_found_aa21(self):
        result = parse_aa_error("AA21 insufficient funds for gas prefund")
        assert result is not None
        assert result["code"] == "AA21"
        assert result["reason"] == "Insufficient funds for gas prefund"

    def test_found_aa24(self):
        result = parse_aa_error(Exception("AA24 signature error"))
        assert result is not None
        assert result["code"] == "AA24"

    def test_no_aa_code(self):
        result = parse_aa_error("some generic error")
        assert result is None

    def test_none(self):
        result = parse_aa_error(None)
        assert result is None
