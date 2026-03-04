"""Swig smart wallet transaction detection, parsing, and flattening."""

from dataclasses import dataclass

try:
    from solders.pubkey import Pubkey
    from solders.transaction import VersionedTransaction
except ImportError as e:
    raise ImportError(
        "SVM mechanism requires solana packages. Install with: pip install x402[svm]"
    ) from e

from .constants import (
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    SECP256R1_PRECOMPILE_ADDRESS,
    SWIG_PROGRAM_ADDRESS,
    SWIG_SIGN_V2_DISCRIMINATOR,
)


@dataclass
class SwigCompactInstruction:
    """A decoded compact instruction embedded in a Swig SignV2 payload.

    Indices reference the SignV2 instruction's own account list,
    not the outer transaction's global account keys.
    """

    program_id_index: int
    accounts: list[int]
    data: bytes


@dataclass
class NormalizedInstruction:
    """An instruction with global indices into tx.message.account_keys.

    Mimics the solders CompiledInstruction interface so the facilitator
    can use it interchangeably.
    """

    program_id_index: int
    accounts: list[int]
    data: bytes


@dataclass
class ParseSwigResult:
    """Result of parsing/flattening a Swig transaction."""

    instructions: list[NormalizedInstruction]
    swig_pda: str


def is_swig_transaction(tx: VersionedTransaction) -> bool:
    """Check if a transaction has a Swig smart wallet layout.

    A Swig transaction contains only compute budget, secp256r1 precompile,
    and Swig SignV2 instructions, with at least one SignV2 present.
    """
    instructions = tx.message.instructions
    if len(instructions) == 0:
        return False

    account_keys = list(tx.message.account_keys)
    compute_budget = Pubkey.from_string(COMPUTE_BUDGET_PROGRAM_ADDRESS)
    secp256r1 = Pubkey.from_string(SECP256R1_PRECOMPILE_ADDRESS)
    swig = Pubkey.from_string(SWIG_PROGRAM_ADDRESS)

    has_sign_v2 = False
    for ix in instructions:
        if ix.program_id_index >= len(account_keys):
            return False
        prog_id = account_keys[ix.program_id_index]
        if prog_id == compute_budget or prog_id == secp256r1:
            continue
        if prog_id == swig:
            ix_data = bytes(ix.data)
            if len(ix_data) < 2:
                return False
            discriminator = int.from_bytes(ix_data[0:2], "little")
            if discriminator != SWIG_SIGN_V2_DISCRIMINATOR:
                return False
            has_sign_v2 = True
            continue
        return False  # unrecognized instruction

    return has_sign_v2


def decode_swig_compact_instructions(data: bytes) -> list[SwigCompactInstruction]:
    """Decode compact instructions from a Swig SignV2 instruction payload.

    Data layout:
        [0..1]  discriminator         U16 LE
        [2..3]  instructionPayloadLen U16 LE
        [4..7]  roleId                U32 LE
        [8..]   compact instructions  (instructionPayloadLen bytes)

    Compact instructions payload:
        [0]         numInstructions U8
        [1..]       compact instruction entries...

    Each compact instruction:
        [0]         programIDIndex U8
        [1]         numAccounts    U8
        [2..N+1]    accounts       []U8
        [N+2..N+3]  dataLen        U16 LE
        [N+4..]     data           raw bytes
    """
    if len(data) < 4:
        raise ValueError(
            f"swig instruction data too short: need \u22654 bytes, got {len(data)}"
        )

    instruction_payload_len = int.from_bytes(data[2:4], "little")
    start_offset = 8
    if len(data) < start_offset + instruction_payload_len:
        raise ValueError(
            f"swig instruction data truncated: payload needs {instruction_payload_len} bytes "
            f"but only {len(data) - start_offset} available after offset {start_offset}"
        )

    results: list[SwigCompactInstruction] = []
    offset = start_offset + 1  # skip numInstructions count byte
    end_offset = start_offset + instruction_payload_len

    while offset < end_offset:
        if offset >= len(data):
            break

        # programIDIndex: U8
        program_id_index = data[offset]
        offset += 1

        # numAccounts: U8
        if offset >= end_offset:
            break
        num_accounts = data[offset]
        offset += 1

        # accounts: []U8
        if offset + num_accounts > end_offset:
            break
        accounts = list(data[offset : offset + num_accounts])
        offset += num_accounts

        # dataLen: U16 LE
        if offset + 2 > end_offset:
            break
        data_len = int.from_bytes(data[offset : offset + 2], "little")
        offset += 2

        # instruction data
        if offset + data_len > end_offset:
            break
        instr_data = bytes(data[offset : offset + data_len])
        offset += data_len

        results.append(
            SwigCompactInstruction(
                program_id_index=program_id_index,
                accounts=accounts,
                data=instr_data,
            )
        )

    return results


def parse_swig_transaction(tx: VersionedTransaction) -> ParseSwigResult:
    """Flatten a Swig transaction into a regular instruction layout.

    Collects non-precompile, non-SignV2 outer instructions (compute budgets)
    and resolves the compact instructions embedded in each SignV2 instruction.

    All SignV2 instructions must reference the same Swig PDA (accounts[0]).
    """
    instructions = tx.message.instructions
    if len(instructions) == 0:
        raise ValueError("no instructions")

    account_keys = list(tx.message.account_keys)
    secp256r1 = Pubkey.from_string(SECP256R1_PRECOMPILE_ADDRESS)
    swig_pubkey = Pubkey.from_string(SWIG_PROGRAM_ADDRESS)

    # 1. Single pass: separate SignV2 from the rest
    result: list[NormalizedInstruction] = []
    sign_v2_instructions = []
    for ix in instructions:
        prog_id = account_keys[ix.program_id_index]
        if prog_id == secp256r1:
            continue  # skip precompile
        if prog_id == swig_pubkey:
            sign_v2_instructions.append(ix)
        else:
            # compute budget and other non-precompile instructions (pass through)
            result.append(
                NormalizedInstruction(
                    program_id_index=ix.program_id_index,
                    accounts=list(ix.accounts),
                    data=bytes(ix.data),
                )
            )

    if len(sign_v2_instructions) == 0:
        raise ValueError("invalid_exact_svm_payload_no_transfer_instruction")

    # Sort compute budget instructions so SetComputeUnitLimit (disc=2) precedes
    # SetComputeUnitPrice (disc=3), matching the order the facilitator expects.
    compute_budget = Pubkey.from_string(COMPUTE_BUDGET_PROGRAM_ADDRESS)
    result.sort(
        key=lambda ix: ix.data[0]
        if account_keys[ix.program_id_index] == compute_budget and len(ix.data) > 0
        else 0
    )

    # 2. Process each SignV2 instruction
    swig_pda = ""
    for sign_v2 in sign_v2_instructions:
        sign_v2_accounts = list(sign_v2.accounts)

        # Extract Swig PDA from SignV2's first account
        if len(sign_v2_accounts) < 2:
            raise ValueError("invalid_exact_svm_payload_no_transfer_instruction")
        if sign_v2_accounts[0] >= len(account_keys):
            raise ValueError("invalid_exact_svm_payload_no_transfer_instruction")

        swig_config_key = account_keys[sign_v2_accounts[0]]
        pda = str(swig_config_key)

        # Enforce all SignV2 instructions share the same PDA
        if swig_pda == "":
            swig_pda = pda
        elif pda != swig_pda:
            raise ValueError(
                "swig_pda_mismatch: all SignV2 instructions must reference the same Swig PDA"
            )

        # Validate Swig wallet address derivation (cross-check accounts[0] and accounts[1])
        if sign_v2_accounts[1] >= len(account_keys):
            raise ValueError("invalid_swig_wallet_address_derivation")
        actual_wallet_address = account_keys[sign_v2_accounts[1]]
        expected_wallet_address, _ = Pubkey.find_program_address(
            [b"swig-wallet-address", bytes(swig_config_key)],
            swig_pubkey,
        )
        if actual_wallet_address != expected_wallet_address:
            raise ValueError("invalid_swig_wallet_address_derivation")

        # Decode compact instructions from SignV2 data
        compact_instructions = decode_swig_compact_instructions(bytes(sign_v2.data))

        # Resolve compact instructions: remap local indices through sign_v2.accounts
        for ci in compact_instructions:
            if ci.program_id_index >= len(sign_v2_accounts):
                raise ValueError(
                    f"compact instruction programIDIndex {ci.program_id_index} "
                    f"out of range (signV2 has {len(sign_v2_accounts)} accounts)"
                )
            remapped_accounts = []
            for a in ci.accounts:
                if a >= len(sign_v2_accounts):
                    raise ValueError(
                        f"compact instruction account index {a} "
                        f"out of range (signV2 has {len(sign_v2_accounts)} accounts)"
                    )
                remapped_accounts.append(sign_v2_accounts[a])
            result.append(
                NormalizedInstruction(
                    program_id_index=sign_v2_accounts[ci.program_id_index],
                    accounts=remapped_accounts,
                    data=ci.data,
                )
            )

    return ParseSwigResult(instructions=result, swig_pda=swig_pda)
