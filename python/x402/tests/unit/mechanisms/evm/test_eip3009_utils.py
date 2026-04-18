"""Tests for pure-logic helpers in eip3009_utils — no network calls."""

from __future__ import annotations

import pytest

try:
    from eth_abi import encode as abi_encode
except ImportError:
    pytest.skip("eth-abi not available", allow_module_level=True)

from unittest.mock import MagicMock, patch

from x402.mechanisms.evm.constants import (
    ERR_EIP3009_NOT_SUPPORTED,
    ERR_INSUFFICIENT_BALANCE,
    ERR_NONCE_ALREADY_USED,
    ERR_TOKEN_NAME_MISMATCH,
    ERR_TOKEN_VERSION_MISMATCH,
    ERR_TRANSACTION_SIMULATION_FAILED,
)
from x402.mechanisms.evm.exact.eip3009_utils import (
    EIP3009SignatureClassification,
    ParsedEIP3009Authorization,
    _split_signature_parts,
    classify_eip3009_signature,
    diagnose_eip3009_simulation_failure,
    execute_transfer_with_authorization,
    parse_eip3009_authorization,
    simulate_eip3009_transfer,
)
from x402.mechanisms.evm.types import ERC6492SignatureData, ExactEIP3009Authorization

# ── Fixtures / helpers ────────────────────────────────────────────────────────

PAYER = "0x1234567890123456789012345678901234567890"
RECIPIENT = "0x0987654321098765432109876543210987654321"
TOKEN = "0xfaketoken1111111111111111111111111111111"
ZERO_FACTORY = b"\x00" * 20
NONCE_HEX = "0x" + "ab" * 32


def _make_authorization(**kwargs: object) -> ExactEIP3009Authorization:
    defaults = dict(
        from_address=PAYER,
        to=RECIPIENT,
        value="1000000",
        valid_after="0",
        valid_before="9999999999",
        nonce=NONCE_HEX,
    )
    defaults.update(kwargs)
    return ExactEIP3009Authorization(**defaults)  # type: ignore[arg-type]


def _plain_sig_data(sig: bytes = b"\x01" * 65) -> ERC6492SignatureData:
    """ERC6492 wrapper with no factory info — plain EOA signature."""
    return ERC6492SignatureData(factory=ZERO_FACTORY, factory_calldata=b"", inner_signature=sig)


def _smart_wallet_sig_data() -> ERC6492SignatureData:
    """ERC6492 with non-zero factory — undeployed smart wallet."""
    return ERC6492SignatureData(
        factory=b"\x22" * 20,
        factory_calldata=b"\xde\xad\xbe\xef",
        inner_signature=b"\x99" * 65,
    )


# ── parse_eip3009_authorization ───────────────────────────────────────────────


class TestParseEip3009Authorization:
    """parse_eip3009_authorization converts string fields to typed values."""

    def test_parses_valid_authorization(self):
        auth = _make_authorization()
        parsed = parse_eip3009_authorization(auth)
        assert isinstance(parsed, ParsedEIP3009Authorization)
        assert parsed.from_address == PAYER
        assert parsed.to == RECIPIENT
        assert parsed.value == 1_000_000
        assert parsed.valid_after == 0
        assert parsed.valid_before == 9_999_999_999
        assert parsed.nonce == bytes.fromhex("ab" * 32)

    def test_nonce_without_0x_prefix(self):
        auth = _make_authorization(nonce="ab" * 32)
        parsed = parse_eip3009_authorization(auth)
        assert parsed.nonce == bytes.fromhex("ab" * 32)

    def test_nonce_must_be_exactly_32_bytes(self):
        auth = _make_authorization(nonce="0x" + "ab" * 31)
        with pytest.raises(ValueError, match="invalid nonce length"):
            parse_eip3009_authorization(auth)

    def test_nonce_33_bytes_rejected(self):
        auth = _make_authorization(nonce="0x" + "ab" * 33)
        with pytest.raises(ValueError, match="invalid nonce length"):
            parse_eip3009_authorization(auth)

    def test_value_zero(self):
        auth = _make_authorization(value="0")
        parsed = parse_eip3009_authorization(auth)
        assert parsed.value == 0

    def test_large_value(self):
        large = str(2**128 - 1)
        auth = _make_authorization(value=large)
        parsed = parse_eip3009_authorization(auth)
        assert parsed.value == 2**128 - 1

    def test_addresses_preserved_as_strings(self):
        auth = _make_authorization()
        parsed = parse_eip3009_authorization(auth)
        assert parsed.from_address == PAYER
        assert parsed.to == RECIPIENT


# ── _split_signature_parts ────────────────────────────────────────────────────


class TestSplitSignatureParts:
    """_split_signature_parts unpacks a 65-byte ECDSA sig into (v, r, s)."""

    def test_v_27_passthrough(self):
        sig = b"\x00" * 32 + b"\x00" * 32 + bytes([27])
        v, r, s = _split_signature_parts(sig)
        assert v == 27
        assert r == b"\x00" * 32
        assert s == b"\x00" * 32

    def test_v_28_passthrough(self):
        sig = b"\x11" * 32 + b"\x22" * 32 + bytes([28])
        v, r, s = _split_signature_parts(sig)
        assert v == 28
        assert r == b"\x11" * 32
        assert s == b"\x22" * 32

    def test_v_0_adjusted_to_27(self):
        sig = b"\xaa" * 32 + b"\xbb" * 32 + bytes([0])
        v, r, s = _split_signature_parts(sig)
        assert v == 27

    def test_v_1_adjusted_to_28(self):
        sig = b"\xcc" * 32 + b"\xdd" * 32 + bytes([1])
        v, r, s = _split_signature_parts(sig)
        assert v == 28

    def test_wrong_length_raises(self):
        with pytest.raises(ValueError, match="invalid ECDSA signature length"):
            _split_signature_parts(b"\x00" * 64)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="invalid ECDSA signature length"):
            _split_signature_parts(b"")

    def test_66_bytes_raises(self):
        with pytest.raises(ValueError, match="invalid ECDSA signature length"):
            _split_signature_parts(b"\x00" * 66)

    def test_r_and_s_slicing(self):
        r_bytes = bytes(range(32))
        s_bytes = bytes(range(32, 64))
        sig = r_bytes + s_bytes + bytes([28])
        v, r, s = _split_signature_parts(sig)
        assert r == r_bytes
        assert s == s_bytes


# ── classify_eip3009_signature ────────────────────────────────────────────────


class TestClassifyEip3009Signature:
    """classify_eip3009_signature resolves EOA / smart-wallet / undeployed cases."""

    def _make_signer(self, *, verify_returns=True, code=b""):
        signer = MagicMock()
        signer.verify_typed_data.return_value = verify_returns
        signer.get_code.return_value = code
        return signer

    def test_valid_eoa_signature(self):
        signer = self._make_signer(verify_returns=True)
        auth = _make_authorization()
        sig_data = _plain_sig_data()

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.parse_erc6492_signature",
            return_value=sig_data,
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.build_typed_data_for_signing",
            return_value=("domain", "types", "TransferWithAuthorization", "message"),
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=False,
        ):
            result = classify_eip3009_signature(
                signer, auth, b"\x01" * 65, 8453, TOKEN, "USD Coin", "2"
            )

        assert result.valid is True
        assert result.is_smart_wallet is False
        assert result.is_undeployed is False

    def test_invalid_eoa_no_code_no_factory(self):
        """EOA sig fails verification, no on-chain code, no factory → invalid non-smart."""
        signer = self._make_signer(verify_returns=False, code=b"")
        auth = _make_authorization()
        sig_data = _plain_sig_data()

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.parse_erc6492_signature",
            return_value=sig_data,
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.build_typed_data_for_signing",
            return_value=("domain", "types", "TransferWithAuthorization", "message"),
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=False,
        ):
            result = classify_eip3009_signature(
                signer, auth, b"\x01" * 65, 8453, TOKEN, "USD Coin", "2"
            )

        assert result.valid is False
        assert result.is_smart_wallet is False
        assert result.is_undeployed is False

    def test_deployed_smart_wallet_invalid_sig(self):
        """Verification fails but contract has on-chain code → deployed smart wallet."""
        signer = self._make_signer(verify_returns=False, code=b"\x60\x80")
        auth = _make_authorization()
        sig_data = _plain_sig_data()

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.parse_erc6492_signature",
            return_value=sig_data,
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.build_typed_data_for_signing",
            return_value=("domain", "types", "TransferWithAuthorization", "message"),
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=False,
        ):
            result = classify_eip3009_signature(
                signer, auth, b"\x01" * 65, 8453, TOKEN, "USD Coin", "2"
            )

        assert result.valid is False
        assert result.is_smart_wallet is True
        assert result.is_undeployed is False

    def test_undeployed_smart_wallet_with_factory(self):
        """Sig fails, no on-chain code, but has_deployment_info → undeployed smart wallet."""
        signer = self._make_signer(verify_returns=False, code=b"")
        auth = _make_authorization()
        sig_data = _smart_wallet_sig_data()

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.parse_erc6492_signature",
            return_value=sig_data,
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.build_typed_data_for_signing",
            return_value=("domain", "types", "TransferWithAuthorization", "message"),
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=True,
        ):
            result = classify_eip3009_signature(
                signer, auth, b"\x01" * 65, 8453, TOKEN, "USD Coin", "2"
            )

        assert result.valid is False
        assert result.is_smart_wallet is True
        assert result.is_undeployed is True


# ── simulate_eip3009_transfer ─────────────────────────────────────────────────


class TestSimulateEip3009Transfer:
    """simulate_eip3009_transfer returns bool based on contract simulation outcome."""

    def _make_parsed(self) -> ParsedEIP3009Authorization:
        return ParsedEIP3009Authorization(
            from_address=PAYER,
            to=RECIPIENT,
            value=1_000_000,
            valid_after=0,
            valid_before=9_999_999_999,
            nonce=bytes.fromhex("ab" * 32),
        )

    def test_plain_65_byte_sig_success(self):
        signer = MagicMock()
        signer.read_contract.return_value = None  # no exception → success
        parsed = self._make_parsed()
        sig_data = _plain_sig_data(b"\x01" * 65)

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=False,
        ):
            result = simulate_eip3009_transfer(signer, TOKEN, parsed, sig_data)

        assert result is True

    def test_plain_65_byte_sig_failure(self):
        signer = MagicMock()
        signer.read_contract.side_effect = Exception("revert: nonce already used")
        parsed = self._make_parsed()
        sig_data = _plain_sig_data(b"\x01" * 65)

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=False,
        ):
            result = simulate_eip3009_transfer(signer, TOKEN, parsed, sig_data)

        assert result is False

    def test_non_65_byte_sig_success(self):
        signer = MagicMock()
        signer.read_contract.return_value = None
        parsed = self._make_parsed()
        # 96-byte EIP-1271 style sig
        sig_data = _plain_sig_data(b"\x02" * 96)

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=False,
        ):
            result = simulate_eip3009_transfer(signer, TOKEN, parsed, sig_data)

        assert result is True

    def test_smart_wallet_with_factory_multicall_success(self):
        from x402.mechanisms.evm.multicall import MulticallResult

        signer = MagicMock()
        ok_result = MulticallResult(success=True, result=None)
        parsed = self._make_parsed()
        sig_data = _smart_wallet_sig_data()

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=True,
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.encode_contract_call",
            return_value=b"\xaa\xbb",
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            return_value=[ok_result, ok_result],
        ):
            result = simulate_eip3009_transfer(signer, TOKEN, parsed, sig_data)

        assert result is True

    def test_smart_wallet_multicall_exception_returns_false(self):
        parsed = self._make_parsed()
        sig_data = _smart_wallet_sig_data()

        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.has_deployment_info",
            return_value=True,
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.encode_contract_call",
            return_value=b"\xaa\xbb",
        ), patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            side_effect=Exception("RPC error"),
        ):
            result = simulate_eip3009_transfer(MagicMock(), TOKEN, parsed, sig_data)

        assert result is False


# ── diagnose_eip3009_simulation_failure ───────────────────────────────────────


class TestDiagnoseEip3009SimulationFailure:
    """diagnose_eip3009_simulation_failure maps failures to specific error codes."""

    from x402.mechanisms.evm.multicall import MulticallResult

    def _run(self, multicall_results, **auth_kwargs) -> str:
        auth = _make_authorization(**auth_kwargs)
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            return_value=multicall_results,
        ):
            return diagnose_eip3009_simulation_failure(
                MagicMock(), TOKEN, auth, 1_000_000, "USD Coin", "2"
            )

    def _result(self, success: bool, value=None):
        from x402.mechanisms.evm.multicall import MulticallResult

        return MulticallResult(success=success, result=value)

    def test_nonce_already_used(self):
        results = [
            self._result(True, 5_000_000),  # balance
            self._result(True, "USD Coin"),  # name
            self._result(True, "2"),          # version
            self._result(True, True),         # authorizationState = already used
        ]
        assert self._run(results) == ERR_NONCE_ALREADY_USED

    def test_eip3009_not_supported(self):
        """authorizationState call fails → token doesn't support EIP-3009."""
        results = [
            self._result(True, 5_000_000),
            self._result(True, "USD Coin"),
            self._result(True, "2"),
            self._result(False, None),  # authorizationState failed
        ]
        assert self._run(results) == ERR_EIP3009_NOT_SUPPORTED

    def test_token_name_mismatch(self):
        results = [
            self._result(True, 5_000_000),
            self._result(True, "WrongCoin"),   # name mismatch
            self._result(True, "2"),
            self._result(True, False),          # nonce unused
        ]
        assert self._run(results) == ERR_TOKEN_NAME_MISMATCH

    def test_token_version_mismatch(self):
        results = [
            self._result(True, 5_000_000),
            self._result(True, "USD Coin"),
            self._result(True, "99"),           # version mismatch
            self._result(True, False),
        ]
        assert self._run(results) == ERR_TOKEN_VERSION_MISMATCH

    def test_insufficient_balance(self):
        results = [
            self._result(True, 500),            # balance < required (1_000_000)
            self._result(True, "USD Coin"),
            self._result(True, "2"),
            self._result(True, False),
        ]
        assert self._run(results) == ERR_INSUFFICIENT_BALANCE

    def test_multicall_raises_returns_simulation_failed(self):
        auth = _make_authorization()
        with patch(
            "x402.mechanisms.evm.exact.eip3009_utils.multicall",
            side_effect=Exception("RPC timeout"),
        ):
            result = diagnose_eip3009_simulation_failure(
                MagicMock(), TOKEN, auth, 1_000_000, "USD Coin", "2"
            )
        assert result == ERR_TRANSACTION_SIMULATION_FAILED

    def test_insufficient_results_returns_simulation_failed(self):
        """Fewer than 4 multicall results → simulation failed."""
        results = [self._result(True, None)]  # only 1 result
        assert self._run(results) == ERR_TRANSACTION_SIMULATION_FAILED

    def test_sufficient_balance_same_name_version_unknown_reason(self):
        """All checks pass but transfer still fails → generic simulation failed."""
        results = [
            self._result(True, 5_000_000),     # balance OK
            self._result(True, "USD Coin"),     # name matches
            self._result(True, "2"),            # version matches
            self._result(True, False),          # nonce unused
        ]
        assert self._run(results) == ERR_TRANSACTION_SIMULATION_FAILED


# ── execute_transfer_with_authorization ───────────────────────────────────────


class TestExecuteTransferWithAuthorization:
    """execute_transfer_with_authorization picks the right ABI overload."""

    def _make_parsed(self) -> ParsedEIP3009Authorization:
        return ParsedEIP3009Authorization(
            from_address=PAYER,
            to=RECIPIENT,
            value=1_000_000,
            valid_after=0,
            valid_before=9_999_999_999,
            nonce=bytes.fromhex("ab" * 32),
        )

    def test_65_byte_sig_uses_vrs_overload(self):
        signer = MagicMock()
        signer.write_contract.return_value = "0xtxhash_vrs"
        parsed = self._make_parsed()
        sig_data = _plain_sig_data(b"\x01" * 65)

        result = execute_transfer_with_authorization(signer, TOKEN, parsed, sig_data)

        assert result == "0xtxhash_vrs"
        call_args = signer.write_contract.call_args
        # The first positional args should include the token address
        assert call_args[0][0] == TOKEN

    def test_non_65_byte_sig_uses_bytes_overload(self):
        signer = MagicMock()
        signer.write_contract.return_value = "0xtxhash_bytes"
        parsed = self._make_parsed()
        sig_data = _plain_sig_data(b"\x02" * 96)

        result = execute_transfer_with_authorization(signer, TOKEN, parsed, sig_data)

        assert result == "0xtxhash_bytes"
        call_args = signer.write_contract.call_args
        # Bytes overload passes inner_signature directly as last arg
        assert b"\x02" * 96 in call_args[0]

    def test_write_contract_called_once(self):
        signer = MagicMock()
        signer.write_contract.return_value = "0xtxhash"
        parsed = self._make_parsed()
        sig_data = _plain_sig_data(b"\x01" * 65)

        execute_transfer_with_authorization(signer, TOKEN, parsed, sig_data)

        signer.write_contract.assert_called_once()
