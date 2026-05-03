"""Tests for the EVM Multicall3 batching helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from eth_abi import encode
from eth_utils import keccak

from x402.mechanisms.evm.constants import (
    MULTICALL3_ADDRESS,
    MULTICALL3_TRY_AGGREGATE_ABI,
)
from x402.mechanisms.evm.multicall import (
    MulticallCall,
    MulticallResult,
    encode_contract_call,
    multicall,
)

ERC20_BALANCE_OF_ABI: list[dict[str, object]] = [
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    }
]

ERC20_NAME_ABI: list[dict[str, object]] = [
    {
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    }
]

MULTI_OUTPUT_ABI: list[dict[str, object]] = [
    {
        "inputs": [],
        "name": "snapshot",
        "outputs": [
            {"name": "balance", "type": "uint256"},
            {"name": "active", "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    }
]

NO_OUTPUT_ABI: list[dict[str, object]] = [
    {
        "inputs": [],
        "name": "ping",
        "outputs": [],
        "stateMutability": "view",
        "type": "function",
    }
]

TUPLE_INPUT_ABI: list[dict[str, object]] = [
    {
        "inputs": [
            {
                "name": "request",
                "type": "tuple",
                "components": [
                    {"name": "from", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
            }
        ],
        "name": "submit",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    }
]

TARGET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
TARGET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
HOLDER = "0x1234567890123456789012345678901234567890"


def _make_signer_returning(results: list[object]) -> MagicMock:
    """Build a FacilitatorEvmSigner mock whose read_contract returns *results*."""
    signer = MagicMock()
    signer.read_contract = MagicMock(return_value=results)
    return signer


def _balance_return(value: int) -> bytes:
    return encode(["uint256"], [value])


def _string_return(value: str) -> bytes:
    return encode(["string"], [value])


class TestMulticall3Constant:
    """Cover MULTICALL3_ADDRESS and MULTICALL3_TRY_AGGREGATE_ABI shape."""

    def test_multicall3_address_matches_canonical_deployment(self):
        # Canonical Multicall3 across all major chains.
        assert MULTICALL3_ADDRESS == "0xcA11bde05977b3631167028862bE2a173976CA11"

    def test_try_aggregate_abi_describes_function_named_tryAggregate(self):
        function = MULTICALL3_TRY_AGGREGATE_ABI[0]
        assert function["type"] == "function"
        assert function["name"] == "tryAggregate"

    def test_try_aggregate_abi_inputs_match_multicall3_signature(self):
        function = MULTICALL3_TRY_AGGREGATE_ABI[0]
        inputs = function["inputs"]
        assert inputs[0]["type"] == "bool"
        assert inputs[1]["type"] == "tuple[]"
        components = inputs[1]["components"]
        assert [c["type"] for c in components] == ["address", "bytes"]


class TestEncodeContractCall:
    """encode_contract_call: selector + ABI-encoded arguments."""

    def test_encodes_function_with_address_argument(self):
        encoded = encode_contract_call(ERC20_BALANCE_OF_ABI, "balanceOf", HOLDER)
        selector = keccak(text="balanceOf(address)")[:4]
        expected_args = encode(["address"], [HOLDER])
        assert encoded == selector + expected_args

    def test_encodes_function_with_no_arguments(self):
        encoded = encode_contract_call(ERC20_NAME_ABI, "name")
        selector = keccak(text="name()")[:4]
        # Selector only — eth_abi.encode([], []) is empty bytes.
        assert encoded == selector

    def test_canonicalizes_tuple_argument_in_signature(self):
        encoded = encode_contract_call(
            TUPLE_INPUT_ABI,
            "submit",
            (HOLDER, 1234),
        )
        signature = "submit((address,uint256))"
        selector = keccak(text=signature)[:4]
        assert encoded.startswith(selector)

    def test_raises_when_function_not_in_abi(self):
        with pytest.raises(ValueError, match="Function transfer not found"):
            encode_contract_call(ERC20_BALANCE_OF_ABI, "transfer", HOLDER)

    def test_skips_non_function_abi_entries(self):
        abi = [
            {"type": "event", "name": "Transfer", "inputs": []},
            {"type": "function", "name": "decimals", "inputs": [], "outputs": []},
        ]
        encoded = encode_contract_call(abi, "decimals")
        assert encoded == keccak(text="decimals()")[:4]


class TestMulticallEmptyAndArgs:
    """Behavior around empty inputs and signer arguments."""

    def test_returns_empty_list_for_no_calls(self):
        signer = MagicMock()
        assert multicall(signer, []) == []
        signer.read_contract.assert_not_called()

    def test_passes_multicall3_address_and_try_aggregate_args(self):
        signer = _make_signer_returning(
            [(True, _balance_return(7))],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        multicall(signer, [call])

        signer.read_contract.assert_called_once()
        args, _ = signer.read_contract.call_args
        contract_address, abi, function_name, require_success, aggregate_calls = args
        assert contract_address == MULTICALL3_ADDRESS
        assert abi is MULTICALL3_TRY_AGGREGATE_ABI
        assert function_name == "tryAggregate"
        assert require_success is False
        # tryAggregate(false, ...) so partial failures don't revert the batch.
        assert isinstance(aggregate_calls, list)
        assert len(aggregate_calls) == 1


class TestMulticallTypedCalls:
    """ABI/function_name path that decodes return data into Python values."""

    def test_decodes_single_uint_output(self):
        signer = _make_signer_returning(
            [(True, _balance_return(123_456))],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        results = multicall(signer, [call])

        assert len(results) == 1
        assert results[0].success is True
        assert results[0].error is None
        assert results[0].result == 123_456

    def test_decodes_string_output(self):
        signer = _make_signer_returning(
            [(True, _string_return("USD Coin"))],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_NAME_ABI,
            function_name="name",
        )
        results = multicall(signer, [call])
        assert results[0].result == "USD Coin"

    def test_returns_list_for_multi_output_function(self):
        signer = _make_signer_returning(
            [(True, encode(["uint256", "bool"], [42, True]))],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=MULTI_OUTPUT_ABI,
            function_name="snapshot",
        )
        results = multicall(signer, [call])
        assert results[0].result == [42, True]

    def test_returns_none_for_function_without_outputs(self):
        signer = _make_signer_returning(
            [(True, b"")],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=NO_OUTPUT_ABI,
            function_name="ping",
        )
        results = multicall(signer, [call])
        assert results[0].success is True
        assert results[0].result is None

    def test_marks_decode_failure_as_unsuccessful_with_error(self):
        # Return data is too short to decode as uint256.
        signer = _make_signer_returning(
            [(True, b"\x01")],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        results = multicall(signer, [call])
        assert results[0].success is False
        assert results[0].error is not None


class TestMulticallRawCallData:
    """call_data path: caller pre-encoded and does not want decoding."""

    def test_raw_call_data_skips_decoding_and_signals_success(self):
        signer = _make_signer_returning(
            [(True, _balance_return(99))],
        )
        raw = encode_contract_call(ERC20_BALANCE_OF_ABI, "balanceOf", HOLDER)
        call = MulticallCall(address=TARGET_A, call_data=raw)
        results = multicall(signer, [call])

        assert results[0].success is True
        # No ABI was supplied, so no decoded result is attached.
        assert results[0].result is None
        assert results[0].error is None

    def test_raw_call_data_propagates_to_aggregate_calls(self):
        signer = _make_signer_returning(
            [(True, _balance_return(0))],
        )
        raw = b"\xde\xad\xbe\xef"
        call = MulticallCall(address=TARGET_A, call_data=raw)
        multicall(signer, [call])

        aggregate_calls = signer.read_contract.call_args[0][4]
        assert aggregate_calls == [(TARGET_A, raw)]

    def test_raw_call_data_failure_records_revert_error(self):
        signer = _make_signer_returning(
            [(False, b"")],
        )
        raw = b"\xab\xcd\x12\x34"
        call = MulticallCall(address=TARGET_A, call_data=raw)
        results = multicall(signer, [call])

        assert results[0].success is False
        assert isinstance(results[0].error, RuntimeError)
        assert "multicall: call reverted" in str(results[0].error)


class TestMulticallTypedRequiresAbi:
    """Typed entries (no call_data) must include an ABI and a function name."""

    def test_missing_abi_raises_value_error(self):
        signer = MagicMock()
        call = MulticallCall(address=TARGET_A, function_name="balanceOf", args=(HOLDER,))
        with pytest.raises(ValueError, match="typed multicall entries require ABI"):
            multicall(signer, [call])
        signer.read_contract.assert_not_called()

    def test_missing_function_name_raises_value_error(self):
        signer = MagicMock()
        call = MulticallCall(address=TARGET_A, abi=ERC20_BALANCE_OF_ABI, args=(HOLDER,))
        with pytest.raises(ValueError, match="typed multicall entries require ABI"):
            multicall(signer, [call])


class TestMulticallMixedArrayAndOrdering:
    """Mixed typed/raw entries preserve input order in the output list."""

    def test_mixed_typed_and_raw_calls_preserve_order(self):
        signer = _make_signer_returning(
            [
                (True, _balance_return(1)),
                (True, _string_return("Token")),
                (False, b""),
            ],
        )
        typed_call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        raw_call = MulticallCall(
            address=TARGET_B,
            call_data=b"\x01\x02\x03\x04",
        )
        another_typed = MulticallCall(
            address=TARGET_A,
            abi=ERC20_NAME_ABI,
            function_name="name",
        )
        results = multicall(signer, [typed_call, another_typed, raw_call])

        assert results[0].success is True
        assert results[0].result == 1
        assert results[1].success is True
        assert results[1].result == "Token"
        assert results[2].success is False
        assert isinstance(results[2].error, RuntimeError)

    def test_revert_on_typed_call_marks_failure_without_decoding(self):
        signer = _make_signer_returning(
            [(False, b"")],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        results = multicall(signer, [call])
        assert results[0].success is False
        assert results[0].result is None
        assert isinstance(results[0].error, RuntimeError)


class TestMulticallNormalization:
    """_normalize_results: accept tuple, list, dict, and SimpleNamespace shapes."""

    def test_accepts_dict_entries_with_string_returnData(self):
        signer = _make_signer_returning(
            [{"success": True, "returnData": "0x" + _balance_return(5).hex()}],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        results = multicall(signer, [call])
        assert results[0].result == 5

    def test_accepts_objects_with_success_and_returnData_attributes(self):
        class Entry:
            def __init__(self, success: bool, return_data: bytes) -> None:
                self.success = success
                self.returnData = return_data

        signer = _make_signer_returning(
            [Entry(True, _balance_return(11))],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        results = multicall(signer, [call])
        assert results[0].result == 11

    def test_accepts_tuple_entries(self):
        signer = _make_signer_returning(
            [(True, _balance_return(2))],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        results = multicall(signer, [call])
        assert results[0].result == 2

    def test_rejects_non_sequence_response(self):
        signer = _make_signer_returning("not a sequence")  # type: ignore[arg-type]
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        with pytest.raises(ValueError, match="multicall returned"):
            multicall(signer, [call])

    def test_rejects_entry_of_unexpected_shape(self):
        signer = _make_signer_returning([42])
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        with pytest.raises(ValueError, match="unexpected type"):
            multicall(signer, [call])

    def test_rejects_entry_with_non_bytes_returnData(self):
        signer = _make_signer_returning(
            [(True, 12345)],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        with pytest.raises(ValueError, match="returnData has unexpected type"):
            multicall(signer, [call])


class TestMulticallLengthMismatch:
    """A length mismatch between calls and results must raise."""

    def test_too_few_results_raises_value_error(self):
        signer = _make_signer_returning(
            [(True, _balance_return(1))],
        )
        call_a = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        call_b = MulticallCall(
            address=TARGET_B,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        with pytest.raises(ValueError, match="length mismatch"):
            multicall(signer, [call_a, call_b])

    def test_too_many_results_raises_value_error(self):
        signer = _make_signer_returning(
            [
                (True, _balance_return(1)),
                (True, _balance_return(2)),
            ],
        )
        call = MulticallCall(
            address=TARGET_A,
            abi=ERC20_BALANCE_OF_ABI,
            function_name="balanceOf",
            args=(HOLDER,),
        )
        with pytest.raises(ValueError, match="length mismatch"):
            multicall(signer, [call])


class TestMulticallResultDataclass:
    """MulticallResult shape sanity checks."""

    def test_defaults_match_failure_with_no_error(self):
        result = MulticallResult(success=False)
        assert result.success is False
        assert result.result is None
        assert result.error is None

    def test_carries_error_for_failed_call(self):
        err = RuntimeError("boom")
        result = MulticallResult(success=False, error=err)
        assert result.error is err
