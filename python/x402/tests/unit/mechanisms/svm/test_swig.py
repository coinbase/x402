"""Tests for Swig smart wallet transaction detection, parsing, and normalization."""

import struct

import pytest
from solders.hash import Hash
from solders.instruction import CompiledInstruction
from solders.message import MessageV0, MessageAddressTableLookup
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

from x402.mechanisms.svm.constants import (
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    SECP256R1_PRECOMPILE_ADDRESS,
    SWIG_PROGRAM_ADDRESS,
    SWIG_SIGN_V2_DISCRIMINATOR,
    TOKEN_PROGRAM_ADDRESS,
    USDC_DEVNET_ADDRESS,
)
from x402.mechanisms.svm.normalizer import normalize_transaction
from x402.mechanisms.svm.swig import (
    decode_swig_compact_instructions,
    is_swig_transaction,
    parse_swig_transaction,
)

# Test constants
SWIG_PDA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
SWIG_PDA_PUBKEY = Pubkey.from_string(SWIG_PDA)
SWIG_PROGRAM_PUBKEY = Pubkey.from_string(SWIG_PROGRAM_ADDRESS)

# Derive the SwigWalletAddress PDA from the test SWIG_PDA
SWIG_WALLET_ADDRESS_PUBKEY, _ = Pubkey.find_program_address(
    [b"swig-wallet-address", bytes(SWIG_PDA_PUBKEY)],
    SWIG_PROGRAM_PUBKEY,
)
SWIG_WALLET_ADDRESS = str(SWIG_WALLET_ADDRESS_PUBKEY)

COMPUTE_BUDGET_PUBKEY = Pubkey.from_string(COMPUTE_BUDGET_PROGRAM_ADDRESS)
SECP256R1_PUBKEY = Pubkey.from_string(SECP256R1_PRECOMPILE_ADDRESS)
TOKEN_PROGRAM_PUBKEY = Pubkey.from_string(TOKEN_PROGRAM_ADDRESS)
USDC_PUBKEY = Pubkey.from_string(USDC_DEVNET_ADDRESS)

# Dummy accounts for testing
SOURCE_ACCOUNT = Pubkey.from_string("3Js7k6xkFRBwhiGfnFbSadMgmBHnFDAMLTwEBfvCedeR")
DEST_ATA = Pubkey.from_string("CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3")
FEE_PAYER = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")


def _build_swig_data(payload: bytes, num_instructions: int = 1) -> bytes:
    """Build a Swig SignV2 instruction data buffer with the given compact instruction payload."""
    with_count = bytes([num_instructions]) + payload
    buf = bytearray(8 + len(with_count))
    struct.pack_into("<H", buf, 0, SWIG_SIGN_V2_DISCRIMINATOR)
    struct.pack_into("<H", buf, 2, len(with_count))
    # bytes 4-7: roleId = 0
    buf[8:] = with_count
    return bytes(buf)


def _build_transfer_checked_compact(
    program_id_index: int,
    account_indices: list[int],
    amount: int,
    decimals: int = 6,
) -> bytes:
    """Build a TransferChecked compact instruction entry."""
    instr_data = bytearray(10)
    instr_data[0] = 12  # transferChecked discriminator
    struct.pack_into("<Q", instr_data, 1, amount)
    instr_data[9] = decimals

    accounts = bytes(account_indices)
    entry = bytearray(1 + 1 + len(accounts) + 2 + len(instr_data))
    off = 0
    entry[off] = program_id_index
    off += 1
    entry[off] = len(accounts)
    off += 1
    entry[off : off + len(accounts)] = accounts
    off += len(accounts)
    struct.pack_into("<H", entry, off, len(instr_data))
    off += 2
    entry[off : off + len(instr_data)] = instr_data
    return bytes(entry)


def _make_tx(
    account_keys: list[Pubkey], instructions: list[CompiledInstruction]
) -> VersionedTransaction:
    """Build a VersionedTransaction from account keys and compiled instructions."""
    msg = MessageV0(
        header=MessageV0.default().header,
        account_keys=account_keys,
        recent_blockhash=Hash.default(),
        instructions=instructions,
        address_table_lookups=[],
    )
    return VersionedTransaction.populate(msg, [])


# ─── isSwigTransaction ─────────────────────────────────────────────────────


class TestIsSwigTransaction:
    def test_valid_swig_returns_true(self):
        """Valid Swig transaction (2 compute budgets + SignV2) returns true."""
        account_keys = [COMPUTE_BUDGET_PUBKEY, SWIG_PROGRAM_PUBKEY]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(0, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(
                1, bytes([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]), bytes([])
            ),
        ]
        tx = _make_tx(account_keys, instructions)
        assert is_swig_transaction(tx) is True

    def test_valid_with_secp256r1_returns_true(self):
        """Valid with secp256r1 precompile returns true."""
        account_keys = [
            COMPUTE_BUDGET_PUBKEY,
            SECP256R1_PUBKEY,
            SWIG_PROGRAM_PUBKEY,
        ]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(0, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(1, bytes([]), bytes([])),
            CompiledInstruction(
                2, bytes([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]), bytes([])
            ),
        ]
        tx = _make_tx(account_keys, instructions)
        assert is_swig_transaction(tx) is True

    def test_non_swig_instruction_returns_false(self):
        """Returns false when non-Swig instruction present."""
        account_keys = [COMPUTE_BUDGET_PUBKEY, TOKEN_PROGRAM_PUBKEY]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(0, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(1, bytes([12, 0, 0, 0]), bytes([])),
        ]
        tx = _make_tx(account_keys, instructions)
        assert is_swig_transaction(tx) is False

    def test_unknown_discriminator_returns_false(self):
        """Returns false for unknown discriminator."""
        account_keys = [COMPUTE_BUDGET_PUBKEY, SWIG_PROGRAM_PUBKEY]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(0, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(1, bytes([4, 0, 0, 0]), bytes([])),  # V1 discriminator
        ]
        tx = _make_tx(account_keys, instructions)
        assert is_swig_transaction(tx) is False

    def test_empty_instructions_returns_false(self):
        """Returns false for empty instructions."""
        account_keys = [COMPUTE_BUDGET_PUBKEY]
        tx = _make_tx(account_keys, [])
        assert is_swig_transaction(tx) is False

    def test_data_too_short_returns_false(self):
        """Returns false when data too short."""
        account_keys = [COMPUTE_BUDGET_PUBKEY, SWIG_PROGRAM_PUBKEY]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(1, bytes([11]), bytes([])),  # only 1 byte
        ]
        tx = _make_tx(account_keys, instructions)
        assert is_swig_transaction(tx) is False

    def test_two_sign_v2_returns_true(self):
        """Returns true for 2 SignV2 instructions."""
        account_keys = [COMPUTE_BUDGET_PUBKEY, SWIG_PROGRAM_PUBKEY]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(
                1, bytes([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]), bytes([])
            ),
            CompiledInstruction(
                1, bytes([SWIG_SIGN_V2_DISCRIMINATOR, 0, 0, 0]), bytes([])
            ),
        ]
        tx = _make_tx(account_keys, instructions)
        assert is_swig_transaction(tx) is True


# ─── decodeSwigCompactInstructions ─────────────────────────────────────────


class TestDecodeSwigCompactInstructions:
    def test_throws_when_data_less_than_4_bytes(self):
        """Throws when data < 4 bytes."""
        with pytest.raises(ValueError, match="swig instruction data too short"):
            decode_swig_compact_instructions(bytes([1, 2, 3]))

    def test_throws_when_payload_truncated(self):
        """Throws when instructionPayloadLen exceeds available data."""
        # instructionPayloadLen = 100 but only 8 bytes total
        data = bytes([4, 0, 100, 0, 0, 0, 0, 0])
        with pytest.raises(ValueError, match="swig instruction data truncated"):
            decode_swig_compact_instructions(data)

    def test_decodes_single_compact_instruction(self):
        """Correctly decodes single TransferChecked compact instruction."""
        compact = _build_transfer_checked_compact(5, [1, 2, 3, 0], 100000)
        data = _build_swig_data(compact)

        result = decode_swig_compact_instructions(data)
        assert len(result) == 1
        assert result[0].program_id_index == 5
        assert result[0].accounts == [1, 2, 3, 0]
        assert result[0].data[0] == 12  # transferChecked discriminator
        # Check amount (U64 LE at bytes 1-8)
        amount = int.from_bytes(result[0].data[1:9], "little")
        assert amount == 100000

    def test_throws_on_truncated_compact_data(self):
        """Throws on truncated compact instruction data."""
        # payload length = 5 in header but no payload bytes
        data = bytes([4, 0, 5, 0, 0, 0, 0, 0])
        with pytest.raises(ValueError, match="swig instruction data truncated"):
            decode_swig_compact_instructions(data)


# ─── parseSwigTransaction ──────────────────────────────────────────────────


class TestParseSwigTransaction:
    # Account keys for test transactions:
    # [0] SWIG_PDA_PUBKEY
    # [1] TOKEN_PROGRAM_PUBKEY
    # [2] SOURCE_ACCOUNT
    # [3] USDC_PUBKEY
    # [4] DEST_ATA
    # [5] SWIG_PROGRAM_PUBKEY
    # [6] COMPUTE_BUDGET_PUBKEY
    # [7] SWIG_WALLET_ADDRESS_PUBKEY

    @property
    def _account_keys(self) -> list[Pubkey]:
        return [
            SWIG_PDA_PUBKEY,
            TOKEN_PROGRAM_PUBKEY,
            SOURCE_ACCOUNT,
            USDC_PUBKEY,
            DEST_ATA,
            SWIG_PROGRAM_PUBKEY,
            COMPUTE_BUDGET_PUBKEY,
            SWIG_WALLET_ADDRESS_PUBKEY,
        ]

    def _sign_v2_account_indices(self) -> bytes:
        """SignV2 account list as global indices into _account_keys.

        pos 0 -> _account_keys[0] = SWIG_PDA
        pos 1 -> _account_keys[7] = SWIG_WALLET_ADDRESS
        pos 2 -> _account_keys[4] = DEST_ATA
        pos 3 -> _account_keys[1] = TOKEN_PROGRAM
        pos 4 -> _account_keys[3] = USDC
        pos 5 -> _account_keys[2] = SOURCE
        """
        return bytes([0, 7, 4, 1, 3, 2])

    def test_flattens_swig_with_transfer_checked(self):
        """Flattens Swig transaction with embedded TransferChecked."""
        # compact indices reference signV2's local account list:
        # programIdIndex=3 -> signV2[3]=TOKEN_PROGRAM (global idx 1)
        # accounts=[5,4,2,0] -> signV2[5,4,2,0] = source, usdc, dest, swigPda
        compact = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        sign_v2_data = _build_swig_data(compact)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(6, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(self._account_keys, instructions)

        result = parse_swig_transaction(tx)

        # Should have 3 instructions: 2 compute budgets + 1 TransferChecked
        assert len(result.instructions) == 3
        assert result.swig_pda == SWIG_PDA

        # First two are compute budget (unchanged)
        assert result.instructions[0].program_id_index == 6
        assert result.instructions[1].program_id_index == 6

        # Third is the resolved TransferChecked
        assert result.instructions[2].program_id_index == 1  # TOKEN_PROGRAM global idx
        assert result.instructions[2].data[0] == 12

    def test_filters_secp256r1_precompile(self):
        """Filters out secp256r1 precompile instructions."""
        account_keys = self._account_keys + [SECP256R1_PUBKEY]  # index 8
        compact = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        sign_v2_data = _build_swig_data(compact)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(6, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(8, bytes([]), bytes([])),  # secp256r1
            CompiledInstruction(5, sign_v2_data, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(account_keys, instructions)

        result = parse_swig_transaction(tx)

        # Should have 3 instructions: 2 compute budgets + 1 TransferChecked (precompile filtered)
        assert len(result.instructions) == 3
        assert result.swig_pda == SWIG_PDA

    def test_extracts_swig_pda(self):
        """Extracts swigPda from first account of SignV2."""
        compact = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        sign_v2_data = _build_swig_data(compact)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(6, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(self._account_keys, instructions)

        result = parse_swig_transaction(tx)
        assert result.swig_pda == SWIG_PDA

    def test_throws_on_index_out_of_range(self):
        """Throws when compact instruction programIDIndex exceeds signV2 accounts."""
        # programIdIndex=6 out of range for signV2 accounts (len 6, valid 0-5)
        compact = _build_transfer_checked_compact(6, [0, 1, 2, 3], 100000)
        sign_v2_data = _build_swig_data(compact)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(6, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(self._account_keys, instructions)

        with pytest.raises(ValueError, match="out of range"):
            parse_swig_transaction(tx)

    def test_flattens_two_sign_v2_instructions(self):
        """Flattens 2 SignV2 instructions."""
        compact1 = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        compact2 = _build_transfer_checked_compact(3, [5, 4, 2, 0], 200000)
        sign_v2_data1 = _build_swig_data(compact1)
        sign_v2_data2 = _build_swig_data(compact2)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data1, self._sign_v2_account_indices()),
            CompiledInstruction(5, sign_v2_data2, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(self._account_keys, instructions)

        result = parse_swig_transaction(tx)

        # Should have 3: 1 compute budget + 2 TransferChecked
        assert len(result.instructions) == 3
        assert result.swig_pda == SWIG_PDA

        # First is compute budget
        assert result.instructions[0].program_id_index == 6

        # Second and third are TransferChecked
        assert result.instructions[1].data[0] == 12
        assert result.instructions[2].data[0] == 12

        # Verify different amounts
        amount1 = int.from_bytes(result.instructions[1].data[1:9], "little")
        amount2 = int.from_bytes(result.instructions[2].data[1:9], "little")
        assert amount1 == 100000
        assert amount2 == 200000

    def test_throws_on_pda_mismatch(self):
        """Throws on PDA mismatch between two SignV2 instructions."""
        different_pda = Pubkey.from_string("11111111111111111111111111111111")
        # Add the different PDA to the account keys
        account_keys = self._account_keys + [different_pda]  # index 8

        compact = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        sign_v2_data1 = _build_swig_data(compact)
        sign_v2_data2 = _build_swig_data(compact)

        # Second SignV2 references different PDA at global index 8
        sign_v2_accounts_2 = bytes([8, 7, 4, 1, 3, 2])

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data1, self._sign_v2_account_indices()),
            CompiledInstruction(5, sign_v2_data2, sign_v2_accounts_2),
        ]
        tx = _make_tx(account_keys, instructions)

        with pytest.raises(ValueError, match="swig_pda_mismatch"):
            parse_swig_transaction(tx)

    def test_throws_on_invalid_wallet_address_derivation(self):
        """Throws on invalid wallet address derivation."""
        wrong_wallet = Pubkey.from_string("3Js7k6xkFRBwhiGfnFbSadMgmBHnFDAMLTwEBfvCedeR")
        # Replace SWIG_WALLET_ADDRESS at index 7 with wrong address
        account_keys = list(self._account_keys)
        account_keys[7] = wrong_wallet

        compact = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        sign_v2_data = _build_swig_data(compact)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(6, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(account_keys, instructions)

        with pytest.raises(ValueError, match="invalid_swig_wallet_address_derivation"):
            parse_swig_transaction(tx)


# ─── normalizeTransaction ──────────────────────────────────────────────────


class TestNormalizeTransaction:
    @property
    def _account_keys(self) -> list[Pubkey]:
        return [
            SWIG_PDA_PUBKEY,
            TOKEN_PROGRAM_PUBKEY,
            SOURCE_ACCOUNT,
            USDC_PUBKEY,
            DEST_ATA,
            SWIG_PROGRAM_PUBKEY,
            COMPUTE_BUDGET_PUBKEY,
            SWIG_WALLET_ADDRESS_PUBKEY,
        ]

    def _sign_v2_account_indices(self) -> bytes:
        return bytes([0, 7, 4, 1, 3, 2])

    def test_swig_normalizer_for_swig_tx(self):
        """SwigNormalizer dispatches for Swig transactions."""
        compact = _build_transfer_checked_compact(3, [5, 4, 2, 0], 100000)
        sign_v2_data = _build_swig_data(compact)

        instructions = [
            CompiledInstruction(6, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(6, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, sign_v2_data, self._sign_v2_account_indices()),
        ]
        tx = _make_tx(self._account_keys, instructions)

        result = normalize_transaction(tx)
        assert result.payer == SWIG_PDA
        assert len(result.instructions) == 3

    def test_regular_normalizer_for_regular_tx(self):
        """RegularNormalizer dispatches for non-Swig transactions."""
        # A regular transaction: compute budgets + TransferChecked
        # account keys: [fee_payer, source, token_program, usdc, dest, compute_budget]
        account_keys = [
            FEE_PAYER,
            SOURCE_ACCOUNT,
            TOKEN_PROGRAM_PUBKEY,
            USDC_PUBKEY,
            DEST_ATA,
            COMPUTE_BUDGET_PUBKEY,
        ]

        # TransferChecked data: discriminator 12 + amount 100000 + decimals 6
        transfer_data = bytearray(10)
        transfer_data[0] = 12
        struct.pack_into("<Q", transfer_data, 1, 100000)
        transfer_data[9] = 6

        instructions = [
            CompiledInstruction(5, bytes([2, 0, 0, 0, 0]), bytes([])),
            CompiledInstruction(5, bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]), bytes([])),
            # TransferChecked: accounts=[source(1), mint(3), dest(4), owner(0)]
            CompiledInstruction(2, bytes(transfer_data), bytes([1, 3, 4, 0])),
        ]
        tx = _make_tx(account_keys, instructions)

        result = normalize_transaction(tx)
        assert result.payer == str(FEE_PAYER)
        assert len(result.instructions) == 3

    def test_throws_when_no_normalizer_finds_payer(self):
        """Throws when no normalizer can find a payer (no token instruction)."""
        account_keys = [COMPUTE_BUDGET_PUBKEY]
        instructions = [
            CompiledInstruction(0, bytes([2, 0, 0, 0, 0]), bytes([])),
        ]
        tx = _make_tx(account_keys, instructions)

        with pytest.raises(
            ValueError,
            match="invalid_exact_svm_payload_no_transfer_instruction",
        ):
            normalize_transaction(tx)
