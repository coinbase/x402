"""Unit tests for x402.mechanisms.evm.exact.eip3009_utils.

Covers every public helper plus the ``_split_signature_parts`` private helper
that gates ECDSA signature handling for ``transferWithAuthorization``.

Heavy-duty paths (multicall, read_contract, write_contract) are exercised by
mocking the FacilitatorEvmSigner protocol — the goal is to lock in the
control-flow contracts (which ABI is chosen, which error code is returned,
which arguments are forwarded), not to replay an actual EVM RPC.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from x402.mechanisms.evm.constants import (
    ERR_EIP3009_NOT_SUPPORTED,
    ERR_INSUFFICIENT_BALANCE,
    ERR_INVALID_SIGNATURE,
    ERR_NONCE_ALREADY_USED,
    ERR_TOKEN_NAME_MISMATCH,
    ERR_TOKEN_VERSION_MISMATCH,
    ERR_TRANSACTION_FAILED,
    ERR_TRANSACTION_SIMULATION_FAILED,
    ERR_VALID_AFTER_FUTURE,
    ERR_VALID_BEFORE_EXPIRED,
    FUNCTION_TRANSFER_WITH_AUTHORIZATION,
    TRANSFER_WITH_AUTHORIZATION_BYTES_ABI,
    TRANSFER_WITH_AUTHORIZATION_VRS_ABI,
)
from x402.mechanisms.evm.exact.eip3009_utils import (
    EIP3009SignatureClassification,
    ParsedEIP3009Authorization,
    _split_signature_parts,
    classify_eip3009_signature,
    diagnose_eip3009_simulation_failure,
    execute_transfer_with_authorization,
    parse_eip3009_authorization,
    parse_eip3009_transfer_error,
    simulate_eip3009_transfer,
)
from x402.mechanisms.evm.multicall import MulticallResult
from x402.mechanisms.evm.types import (
    ERC6492SignatureData,
    ExactEIP3009Authorization,
)

# ---------------------------------------------------------------------------
# Test fixtures / helpers
# ---------------------------------------------------------------------------

PAYER = "0x1234567890123456789012345678901234567890"
RECIPIENT = "0x0987654321098765432109876543210987654321"
TOKEN_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
FACTORY = "0x1111111111111111111111111111111111111111"
NONCE_HEX = "0x" + "ab" * 32  # 32 bytes


def _make_authorization(
    *,
    from_address: str = PAYER,
    to: str = RECIPIENT,
    value: str = "1000000",
    valid_after: str = "1700000000",
    valid_before: str = "1700001000",
    nonce: str = NONCE_HEX,
) -> ExactEIP3009Authorization:
    return ExactEIP3009Authorization(
        from_address=from_address,
        to=to,
        value=value,
        valid_after=valid_after,
        valid_before=valid_before,
        nonce=nonce,
    )


def _make_eoa_sig_data(*, sig_len: int = 65) -> ERC6492SignatureData:
    return ERC6492SignatureData(
        factory=b"\x00" * 20,
        factory_calldata=b"",
        inner_signature=b"\x01" * sig_len,
    )


def _make_deployed_sig_data(*, sig_len: int = 65) -> ERC6492SignatureData:
    return ERC6492SignatureData(
        factory=bytes.fromhex(FACTORY[2:]),
        factory_calldata=b"\xde\xad\xbe\xef",
        inner_signature=b"\x01" * sig_len,
    )


def _signer_mock() -> MagicMock:
    """A stand-in FacilitatorEvmSigner with all touched methods stubbed."""
    signer = MagicMock()
    signer.verify_typed_data.return_value = False
    signer.get_code.return_value = b""
    signer.read_contract.return_value = None
    signer.write_contract.return_value = "0x" + "00" * 32
    return signer


# ---------------------------------------------------------------------------
# parse_eip3009_authorization
# ---------------------------------------------------------------------------


class TestParseEip3009Authorization:
    def test_valid_authorization_round_trips_fields(self) -> None:
        auth = _make_authorization()
        parsed = parse_eip3009_authorization(auth)

        assert isinstance(parsed, ParsedEIP3009Authorization)
        assert parsed.from_address == PAYER
        assert parsed.to == RECIPIENT
        assert parsed.value == 1_000_000
        assert parsed.valid_after == 1_700_000_000
        assert parsed.valid_before == 1_700_001_000
        assert parsed.nonce == bytes.fromhex("ab" * 32)
        assert len(parsed.nonce) == 32

    def test_string_numerics_are_converted_to_int(self) -> None:
        parsed = parse_eip3009_authorization(
            _make_authorization(value="42", valid_after="0", valid_before="999")
        )
        assert isinstance(parsed.value, int) and parsed.value == 42
        assert isinstance(parsed.valid_after, int) and parsed.valid_after == 0
        assert isinstance(parsed.valid_before, int) and parsed.valid_before == 999

    def test_nonce_without_0x_prefix_is_accepted(self) -> None:
        bare_nonce = "ab" * 32
        parsed = parse_eip3009_authorization(_make_authorization(nonce=bare_nonce))
        assert parsed.nonce == bytes.fromhex(bare_nonce)

    def test_short_nonce_raises_value_error(self) -> None:
        short_nonce = "0x" + "ab" * 16  # 16 bytes
        with pytest.raises(ValueError, match="invalid nonce length"):
            parse_eip3009_authorization(_make_authorization(nonce=short_nonce))

    def test_long_nonce_raises_value_error(self) -> None:
        long_nonce = "0x" + "ab" * 33
        with pytest.raises(ValueError, match="invalid nonce length"):
            parse_eip3009_authorization(_make_authorization(nonce=long_nonce))

    def test_empty_nonce_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="invalid nonce length"):
            parse_eip3009_authorization(_make_authorization(nonce="0x"))

    def test_non_numeric_value_raises(self) -> None:
        with pytest.raises(ValueError):
            parse_eip3009_authorization(_make_authorization(value="not-a-number"))


# ---------------------------------------------------------------------------
# _split_signature_parts
# ---------------------------------------------------------------------------


class TestSplitSignatureParts:
    def test_v27_passes_through(self) -> None:
        sig = b"\xaa" * 32 + b"\xbb" * 32 + bytes([27])
        v, r, s = _split_signature_parts(sig)
        assert v == 27
        assert r == b"\xaa" * 32
        assert s == b"\xbb" * 32

    def test_v28_passes_through(self) -> None:
        sig = b"\x11" * 32 + b"\x22" * 32 + bytes([28])
        v, r, s = _split_signature_parts(sig)
        assert v == 28
        assert r == b"\x11" * 32
        assert s == b"\x22" * 32

    def test_v0_is_normalized_to_27(self) -> None:
        sig = b"\x01" * 32 + b"\x02" * 32 + bytes([0])
        v, _r, _s = _split_signature_parts(sig)
        assert v == 27

    def test_v1_is_normalized_to_28(self) -> None:
        sig = b"\x01" * 32 + b"\x02" * 32 + bytes([1])
        v, _r, _s = _split_signature_parts(sig)
        assert v == 28

    def test_short_signature_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid ECDSA signature length"):
            _split_signature_parts(b"\x00" * 64)

    def test_long_signature_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid ECDSA signature length"):
            _split_signature_parts(b"\x00" * 66)

    def test_empty_signature_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid ECDSA signature length"):
            _split_signature_parts(b"")

    def test_high_v_value_passes_through_unchanged(self) -> None:
        sig = b"\x00" * 32 + b"\x00" * 32 + bytes([35])
        v, _r, _s = _split_signature_parts(sig)
        assert v == 35


# ---------------------------------------------------------------------------
# parse_eip3009_transfer_error
# ---------------------------------------------------------------------------


class TestParseEip3009TransferError:
    @pytest.mark.parametrize(
        "msg",
        ["authorization is expired", "AuthorizationExpired"],
    )
    def test_expired_messages_map_to_valid_before(self, msg: str) -> None:
        assert parse_eip3009_transfer_error(Exception(msg)) == ERR_VALID_BEFORE_EXPIRED

    @pytest.mark.parametrize(
        "msg",
        ["authorization is not yet valid", "AuthorizationNotYetValid"],
    )
    def test_not_yet_valid_messages_map_to_valid_after(self, msg: str) -> None:
        assert parse_eip3009_transfer_error(Exception(msg)) == ERR_VALID_AFTER_FUTURE

    @pytest.mark.parametrize(
        "msg",
        [
            "authorization is used",
            "AuthorizationAlreadyUsed",
            "AuthorizationUsedOrCanceled",
        ],
    )
    def test_used_messages_map_to_nonce_already_used(self, msg: str) -> None:
        assert parse_eip3009_transfer_error(Exception(msg)) == ERR_NONCE_ALREADY_USED

    @pytest.mark.parametrize(
        "msg",
        [
            "ERC20: transfer amount exceeds balance",
            "ERC20InsufficientBalance(0x...)",
        ],
    )
    def test_balance_messages_map_to_insufficient_balance(self, msg: str) -> None:
        assert parse_eip3009_transfer_error(Exception(msg)) == ERR_INSUFFICIENT_BALANCE

    @pytest.mark.parametrize(
        "msg",
        [
            "Invalid signature",
            "SignerMismatch",
            "InvalidSignatureV",
            "InvalidSignatureS",
        ],
    )
    def test_signature_messages_map_to_invalid_signature(self, msg: str) -> None:
        assert parse_eip3009_transfer_error(Exception(msg)) == ERR_INVALID_SIGNATURE

    def test_unknown_message_falls_back_to_transaction_failed(self) -> None:
        assert parse_eip3009_transfer_error(Exception("nope")) == ERR_TRANSACTION_FAILED

    def test_empty_message_falls_back_to_transaction_failed(self) -> None:
        assert parse_eip3009_transfer_error(Exception("")) == ERR_TRANSACTION_FAILED

    def test_match_is_case_insensitive(self) -> None:
        # Mixed casing on a known substring still maps correctly.
        assert (
            parse_eip3009_transfer_error(Exception("AUTHORIZATION IS EXPIRED!"))
            == ERR_VALID_BEFORE_EXPIRED
        )

    def test_priority_expired_over_other_keywords(self) -> None:
        # A message containing both "expired" and "invalid signature" picks the
        # first matching branch (expired), which is the implemented behavior.
        msg = "authorization is expired and the invalid signature was rejected"
        assert parse_eip3009_transfer_error(Exception(msg)) == ERR_VALID_BEFORE_EXPIRED


# ---------------------------------------------------------------------------
# classify_eip3009_signature
# ---------------------------------------------------------------------------


class TestClassifyEip3009Signature:
    def _patch_typed_data(self):
        return patch(
            "x402.mechanisms.evm.exact.eip3009_utils.build_typed_data_for_signing",
            return_value=({"name": "USDC"}, {}, "TransferWithAuthorization", {}),
        )

    def test_valid_eoa_signature_classified_as_eoa(self) -> None:
        signer = _signer_mock()
        signer.verify_typed_data.return_value = True
        sig = b"\x01" * 65
        with self._patch_typed_data():
            result = classify_eip3009_signature(
                signer, _make_authorization(), sig, 1, TOKEN_ADDRESS, "USDC", "2"
            )
        assert isinstance(result, EIP3009SignatureClassification)
        assert result.valid is True
        assert result.is_smart_wallet is False
        assert result.is_undeployed is False

    def test_valid_signature_with_deployment_info_is_smart_wallet(self) -> None:
        signer = _signer_mock()
        signer.verify_typed_data.return_value = True
        # Pack ERC-6492: factory ++ calldata-len-prefix ++ magic suffix.
        # We rely on parse_erc6492_signature to detect the magic suffix; build
        # it the same way the prod code expects (ABI-encoded).
        from eth_abi import encode

        magic = bytes.fromhex("6492649264926492649264926492649264926492649264926492649264926492")
        encoded = encode(
            ["address", "bytes", "bytes"],
            [FACTORY, b"\xde\xad\xbe\xef", b"\x01" * 65],
        )
        sig = encoded + magic
        with self._patch_typed_data():
            result = classify_eip3009_signature(
                signer, _make_authorization(), sig, 1, TOKEN_ADDRESS, "USDC", "2"
            )
        assert result.valid is True
        assert result.is_smart_wallet is True

    def test_valid_signature_with_non_65_byte_inner_is_smart_wallet(self) -> None:
        signer = _signer_mock()
        signer.verify_typed_data.return_value = True
        sig = b"\x01" * 200  # not 65 → treated as smart-wallet payload
        with self._patch_typed_data():
            result = classify_eip3009_signature(
                signer, _make_authorization(), sig, 1, TOKEN_ADDRESS, "USDC", "2"
            )
        assert result.valid is True
        assert result.is_smart_wallet is True

    def test_invalid_sig_with_deployed_contract(self) -> None:
        signer = _signer_mock()
        signer.verify_typed_data.return_value = False
        signer.get_code.return_value = b"\x60" * 32  # deployed
        sig = b"\x01" * 65
        with self._patch_typed_data():
            result = classify_eip3009_signature(
                signer, _make_authorization(), sig, 1, TOKEN_ADDRESS, "USDC", "2"
            )
        assert result.valid is False
        assert result.is_smart_wallet is True
        assert result.is_undeployed is False

    def test_invalid_sig_with_deployment_info_no_code_is_undeployed(self) -> None:
        signer = _signer_mock()
        signer.verify_typed_data.return_value = False
        signer.get_code.return_value = b""  # not yet deployed

        from eth_abi import encode

        magic = bytes.fromhex("6492649264926492649264926492649264926492649264926492649264926492")
        encoded = encode(
            ["address", "bytes", "bytes"],
            [FACTORY, b"\xde\xad\xbe\xef", b"\x01" * 65],
        )
        sig = encoded + magic
        with self._patch_typed_data():
            result = classify_eip3009_signature(
                signer, _make_authorization(), sig, 1, TOKEN_ADDRESS, "USDC", "2"
            )
        assert result.valid is False
        assert result.is_smart_wallet is True
        assert result.is_undeployed is True

    def test_invalid_eoa_with_no_code_and_no_deployment(self) -> None:
        signer = _signer_mock()
        signer.verify_typed_data.return_value = False
        signer.get_code.return_value = b""
        sig = b"\x01" * 65  # 65 bytes, no ERC-6492 wrapper → looks like EOA
        with self._patch_typed_data():
            result = classify_eip3009_signature(
                signer, _make_authorization(), sig, 1, TOKEN_ADDRESS, "USDC", "2"
            )
        assert result.valid is False
        assert result.is_smart_wallet is False
        assert result.is_undeployed is False


# ---------------------------------------------------------------------------
# simulate_eip3009_transfer
# ---------------------------------------------------------------------------


class TestSimulateEip3009Transfer:
    def _parsed(self) -> ParsedEIP3009Authorization:
        return ParsedEIP3009Authorization(
            from_address=PAYER,
            to=RECIPIENT,
            value=1_000_000,
            valid_after=1_700_000_000,
            valid_before=1_700_001_000,
            nonce=b"\xab" * 32,
        )

    def test_undeployed_smart_wallet_multicall_success_returns_true(self) -> None:
        signer = _signer_mock()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            return_value=[
                MulticallResult(success=True),
                MulticallResult(success=True),
            ],
        ):
            assert (
                simulate_eip3009_transfer(
                    signer, TOKEN_ADDRESS, self._parsed(), _make_deployed_sig_data()
                )
                is True
            )

    def test_undeployed_smart_wallet_second_call_failure_returns_false(self) -> None:
        signer = _signer_mock()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            return_value=[
                MulticallResult(success=True),
                MulticallResult(success=False),
            ],
        ):
            assert (
                simulate_eip3009_transfer(
                    signer, TOKEN_ADDRESS, self._parsed(), _make_deployed_sig_data()
                )
                is False
            )

    def test_undeployed_smart_wallet_multicall_raises_returns_false(self) -> None:
        signer = _signer_mock()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            side_effect=RuntimeError("rpc down"),
        ):
            assert (
                simulate_eip3009_transfer(
                    signer, TOKEN_ADDRESS, self._parsed(), _make_deployed_sig_data()
                )
                is False
            )

    def test_undeployed_short_results_returns_false(self) -> None:
        signer = _signer_mock()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            return_value=[MulticallResult(success=True)],
        ):
            assert (
                simulate_eip3009_transfer(
                    signer, TOKEN_ADDRESS, self._parsed(), _make_deployed_sig_data()
                )
                is False
            )

    def test_eoa_signature_uses_vrs_abi_and_returns_true_on_success(self) -> None:
        signer = _signer_mock()
        signer.read_contract.return_value = None
        ok = simulate_eip3009_transfer(
            signer, TOKEN_ADDRESS, self._parsed(), _make_eoa_sig_data(sig_len=65)
        )
        assert ok is True
        signer.read_contract.assert_called_once()
        args = signer.read_contract.call_args.args
        assert args[0] == TOKEN_ADDRESS
        assert args[1] is TRANSFER_WITH_AUTHORIZATION_VRS_ABI
        assert args[2] == FUNCTION_TRANSFER_WITH_AUTHORIZATION

    def test_eoa_signature_returns_false_on_revert(self) -> None:
        signer = _signer_mock()
        signer.read_contract.side_effect = Exception("simulate revert")
        assert (
            simulate_eip3009_transfer(
                signer, TOKEN_ADDRESS, self._parsed(), _make_eoa_sig_data(sig_len=65)
            )
            is False
        )

    def test_non_65_byte_eoa_uses_bytes_abi(self) -> None:
        signer = _signer_mock()
        signer.read_contract.return_value = None
        # No ERC-6492 wrapper, but inner_signature length != 65 → falls into
        # the bytes-ABI branch.
        sig_data = ERC6492SignatureData(
            factory=b"\x00" * 20,
            factory_calldata=b"",
            inner_signature=b"\x05" * 200,
        )
        ok = simulate_eip3009_transfer(signer, TOKEN_ADDRESS, self._parsed(), sig_data)
        assert ok is True
        args = signer.read_contract.call_args.args
        assert args[1] is TRANSFER_WITH_AUTHORIZATION_BYTES_ABI

    def test_non_65_byte_eoa_returns_false_on_revert(self) -> None:
        signer = _signer_mock()
        signer.read_contract.side_effect = Exception("revert")
        sig_data = ERC6492SignatureData(
            factory=b"\x00" * 20,
            factory_calldata=b"",
            inner_signature=b"\x05" * 200,
        )
        assert simulate_eip3009_transfer(signer, TOKEN_ADDRESS, self._parsed(), sig_data) is False


# ---------------------------------------------------------------------------
# diagnose_eip3009_simulation_failure
# ---------------------------------------------------------------------------


class TestDiagnoseEip3009SimulationFailure:
    def _call(
        self,
        results,
        *,
        token_name: str = "USDC",
        token_version: str = "2",
        required_amount: int = 1_000_000,
    ):
        signer = _signer_mock()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            return_value=results,
        ):
            return diagnose_eip3009_simulation_failure(
                signer,
                TOKEN_ADDRESS,
                _make_authorization(value=str(required_amount)),
                required_amount,
                token_name,
                token_version,
            )

    def test_multicall_raises_returns_simulation_failed(self) -> None:
        signer = _signer_mock()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            side_effect=RuntimeError("rpc down"),
        ):
            assert (
                diagnose_eip3009_simulation_failure(
                    signer,
                    TOKEN_ADDRESS,
                    _make_authorization(),
                    1_000_000,
                    "USDC",
                    "2",
                )
                == ERR_TRANSACTION_SIMULATION_FAILED
            )

    def test_short_results_returns_simulation_failed(self) -> None:
        # Three results instead of four → control flow short-circuits.
        results = [MulticallResult(success=True, result=10)] * 3
        assert self._call(results) == ERR_TRANSACTION_SIMULATION_FAILED

    def test_authorization_state_failure_means_eip3009_unsupported(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),  # balanceOf
            MulticallResult(success=True, result="USDC"),  # name
            MulticallResult(success=True, result="2"),  # version
            MulticallResult(success=False),  # authorizationState
        ]
        assert self._call(results) == ERR_EIP3009_NOT_SUPPORTED

    def test_authorization_state_true_means_nonce_already_used(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=True),
        ]
        assert self._call(results) == ERR_NONCE_ALREADY_USED

    def test_token_name_mismatch(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),
            MulticallResult(success=True, result="OtherToken"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results, token_name="USDC") == ERR_TOKEN_NAME_MISMATCH

    def test_token_version_mismatch(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="9"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results, token_version="2") == ERR_TOKEN_VERSION_MISMATCH

    def test_insufficient_balance(self) -> None:
        results = [
            MulticallResult(success=True, result=10),  # tiny balance
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results, required_amount=1_000_000) == ERR_INSUFFICIENT_BALANCE

    def test_balance_failure_skipped_returns_simulation_failed(self) -> None:
        results = [
            MulticallResult(success=False),  # balanceOf failed → skip
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results) == ERR_TRANSACTION_SIMULATION_FAILED

    def test_balance_non_int_result_does_not_raise(self) -> None:
        # Non-numeric balance is caught and swallowed; falls through to
        # the simulation-failed default.
        results = [
            MulticallResult(success=True, result="not-a-number"),
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results) == ERR_TRANSACTION_SIMULATION_FAILED

    def test_skips_name_check_when_token_name_empty(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),
            MulticallResult(success=True, result="WHATEVER"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=False),
        ]
        # token_name="" disables name comparison even though the on-chain
        # name differs.
        assert self._call(results, token_name="") == ERR_TRANSACTION_SIMULATION_FAILED

    def test_skips_version_check_when_token_version_empty(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="9"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results, token_version="") == ERR_TRANSACTION_SIMULATION_FAILED

    def test_all_clean_returns_simulation_failed_default(self) -> None:
        results = [
            MulticallResult(success=True, result=2_000_000),
            MulticallResult(success=True, result="USDC"),
            MulticallResult(success=True, result="2"),
            MulticallResult(success=True, result=False),
        ]
        assert self._call(results) == ERR_TRANSACTION_SIMULATION_FAILED


# ---------------------------------------------------------------------------
# execute_transfer_with_authorization
# ---------------------------------------------------------------------------


class TestExecuteTransferWithAuthorization:
    def _parsed(self) -> ParsedEIP3009Authorization:
        return ParsedEIP3009Authorization(
            from_address=PAYER,
            to=RECIPIENT,
            value=1_000_000,
            valid_after=1_700_000_000,
            valid_before=1_700_001_000,
            nonce=b"\xab" * 32,
        )

    def test_eoa_65_byte_signature_uses_vrs_abi(self) -> None:
        signer = _signer_mock()
        signer.write_contract.return_value = "0xdeadbeef"
        tx_hash = execute_transfer_with_authorization(
            signer, TOKEN_ADDRESS, self._parsed(), _make_eoa_sig_data(sig_len=65)
        )
        assert tx_hash == "0xdeadbeef"
        signer.write_contract.assert_called_once()
        call = signer.write_contract.call_args
        assert call.args[0] == TOKEN_ADDRESS
        assert call.args[1] is TRANSFER_WITH_AUTHORIZATION_VRS_ABI
        assert call.args[2] == FUNCTION_TRANSFER_WITH_AUTHORIZATION
        # Trailing args must be (..., v, r, s) — three trailing ints/bytes.
        assert isinstance(call.args[-3], int)
        assert isinstance(call.args[-2], (bytes, bytearray))
        assert isinstance(call.args[-1], (bytes, bytearray))

    def test_smart_wallet_signature_uses_bytes_abi(self) -> None:
        signer = _signer_mock()
        signer.write_contract.return_value = "0xfeedbeef"
        sig_data = ERC6492SignatureData(
            factory=b"\x00" * 20,
            factory_calldata=b"",
            inner_signature=b"\x05" * 200,
        )
        tx_hash = execute_transfer_with_authorization(
            signer, TOKEN_ADDRESS, self._parsed(), sig_data
        )
        assert tx_hash == "0xfeedbeef"
        call = signer.write_contract.call_args
        assert call.args[1] is TRANSFER_WITH_AUTHORIZATION_BYTES_ABI
        # Last arg should be the raw bytes signature.
        assert call.args[-1] == b"\x05" * 200

    def test_authorization_arguments_are_forwarded(self) -> None:
        signer = _signer_mock()
        parsed = self._parsed()
        execute_transfer_with_authorization(
            signer, TOKEN_ADDRESS, parsed, _make_eoa_sig_data(sig_len=65)
        )
        call = signer.write_contract.call_args
        # After (address, abi, function_name): from, to, value, va, vb, nonce, v, r, s
        assert call.args[3] == PAYER
        assert call.args[4] == RECIPIENT
        assert call.args[5] == 1_000_000
        assert call.args[6] == 1_700_000_000
        assert call.args[7] == 1_700_001_000
        assert call.args[8] == b"\xab" * 32
