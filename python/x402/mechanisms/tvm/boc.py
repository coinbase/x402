"""BoC (Bag of Cells) parser for W5 wallet messages.

Extracts payment details from signed W5R1 external messages:
- Wallet parameters (seqno, valid_until)
- Internal messages (jetton transfers, relay commissions)
- Jetton transfer fields (destination, amount, response_destination)
"""

from __future__ import annotations

import base64
import hashlib
from typing import Any

try:
    from pytoniq_core import Address, Cell
except ImportError as e:
    raise ImportError(
        "TVM mechanism requires pytoniq-core. Install with: pip install x402[tvm]"
    ) from e

from .constants import JETTON_TRANSFER_OP, MAX_BOC_SIZE
from .types import JettonTransferInfo, W5ParsedMessage


def parse_external_message(boc_b64: str) -> Cell:
    """Parse a base64 BoC containing an external message and return the body cell.

    Args:
        boc_b64: Base64-encoded BoC string.

    Returns:
        The body cell of the external message.

    Raises:
        ValueError: If BoC is too large or malformed.
    """
    raw = base64.b64decode(boc_b64)
    if len(raw) > MAX_BOC_SIZE:
        raise ValueError(f"BoC too large: {len(raw)} bytes (max {MAX_BOC_SIZE})")

    cell = Cell.one_from_boc(raw)
    cs = cell.begin_parse()

    # External message TL-B: ext_in_msg_info$10 ...
    tag = cs.load_uint(2)
    if tag != 2:  # 0b10 = ext_in_msg_info
        raise ValueError(f"Not an external message: tag={tag}")

    # src: MsgAddressExt (addr_none$00)
    src_tag = cs.load_uint(2)
    if src_tag != 0:
        cs.skip_bits(src_tag)  # skip src address bits

    # dest: MsgAddressInt
    cs.load_address()

    # import_fee: Grams
    cs.load_coins()

    # StateInit (Maybe ^StateInit)
    has_state_init = cs.load_bit()
    if has_state_init:
        is_ref = cs.load_bit()
        if is_ref:
            cs.load_ref()  # skip state_init ref
        else:
            raise ValueError("Inline state_init not supported, use ref format")

    # Body: Either ^Cell or inline
    body_is_ref = cs.load_bit()
    if body_is_ref:
        return cs.load_ref()
    else:
        return cs.to_cell()


def parse_w5_body(body_cell: Cell) -> W5ParsedMessage:
    """Parse a W5R1 wallet body cell into structured data.

    Args:
        body_cell: The body cell from a W5 external message.

    Returns:
        W5ParsedMessage with seqno, valid_until, and internal messages.
    """
    cs = body_cell.begin_parse()

    # Skip signature (512 bits = 64 bytes)
    cs.skip_bits(512)

    # Parse W5 fields
    _wallet_id = cs.load_int(32)
    valid_until = cs.load_uint(32)
    seqno = cs.load_uint(32)

    # Parse W5 actions (extensions or messages)
    internal_messages: list[dict[str, Any]] = []

    is_extension = cs.load_bit()
    if not is_extension:
        if cs.remaining_bits >= 8:
            _flags = cs.load_uint(8)

        # W5R1 uses a chain of action cells in refs
        while cs.remaining_refs > 0:
            action_cell = cs.load_ref()
            msgs = _parse_w5_actions(action_cell)
            internal_messages.extend(msgs)

    body_hash = hashlib.sha256(body_cell.to_boc()).hexdigest()

    return W5ParsedMessage(
        seqno=seqno,
        valid_until=valid_until,
        internal_messages=internal_messages,
        raw_body_hash=body_hash,
    )


def _parse_w5_actions(action_cell: Cell) -> list[dict[str, Any]]:
    """Parse W5 action chain from a cell."""
    messages: list[dict[str, Any]] = []
    current = action_cell

    while True:
        cs = current.begin_parse()

        next_action = None
        if cs.remaining_refs > 0 and cs.remaining_bits >= 32:
            op = cs.preload_uint(32)

            SEND_MSG_OP = 0x0EC3C86D
            SET_DATA_OP = 0x1FF8EA0B

            if op == SEND_MSG_OP:
                cs.load_uint(32)  # consume op
                mode = cs.load_uint(8)
                msg_cell = cs.load_ref()

                parsed = _parse_internal_message(msg_cell)
                parsed["send_mode"] = mode
                messages.append(parsed)

                if cs.remaining_refs > 0:
                    next_action = cs.load_ref()
            elif op == SET_DATA_OP:
                cs.load_uint(32)
                if cs.remaining_refs > 0:
                    cs.load_ref()
                if cs.remaining_refs > 0:
                    next_action = cs.load_ref()
            else:
                if cs.remaining_refs > 0:
                    ref = cs.load_ref()
                    try:
                        parsed = _parse_internal_message(ref)
                        messages.append(parsed)
                    except Exception:
                        next_action = ref
        elif cs.remaining_refs > 0:
            next_action = cs.load_ref()

        if next_action is None:
            break
        current = next_action

    return messages


def _parse_internal_message(msg_cell: Cell) -> dict[str, Any]:
    """Parse an internal message cell."""
    cs = msg_cell.begin_parse()

    tag = cs.load_bit()
    if tag:
        raise ValueError("Expected internal message (tag=0), got external")

    cs.load_bit()  # ihr_disabled
    cs.load_bit()  # bounce
    cs.load_bit()  # bounced
    src = _load_msg_address(cs)
    dest = _load_msg_address(cs)
    amount = cs.load_coins()

    has_extra = cs.load_bit()
    if has_extra:
        cs.load_ref()

    cs.load_coins()  # ihr_fee
    cs.load_coins()  # fwd_fee
    cs.load_uint(64)  # created_lt
    cs.load_uint(32)  # created_at

    has_state_init = cs.load_bit()
    if has_state_init:
        is_ref = cs.load_bit()
        if is_ref:
            cs.load_ref()

    body_is_ref = cs.load_bit()
    if body_is_ref and cs.remaining_refs > 0:
        body_cell = cs.load_ref()
    else:
        body_cell = cs.to_cell()

    result: dict[str, Any] = {
        "destination": dest,
        "amount": amount,
        "body": body_cell,
    }
    if src:
        result["source"] = src

    return result


def _load_msg_address(cs) -> str | None:
    """Load a MsgAddress from a cell slice."""
    tag = cs.load_uint(2)
    if tag == 0:  # addr_none
        return None
    elif tag == 2:  # addr_std
        maybe_anycast = cs.load_bit()
        if maybe_anycast:
            depth = cs.load_uint(5)
            cs.skip_bits(depth)
        workchain = cs.load_int(8)
        hash_part = cs.load_bytes(32)
        return f"{workchain}:{hash_part.hex()}"
    elif tag == 3:  # addr_var
        maybe_anycast = cs.load_bit()
        if maybe_anycast:
            depth = cs.load_uint(5)
            cs.skip_bits(depth)
        addr_len = cs.load_uint(9)
        workchain = cs.load_int(32)
        addr_bytes = cs.load_bits(addr_len)
        return f"{workchain}:{addr_bytes.hex()}"
    else:
        # addr_extern (tag=1)
        addr_len = cs.load_uint(9)
        cs.skip_bits(addr_len)
        return None


def extract_jetton_transfer(body_cell: Cell) -> JettonTransferInfo | None:
    """Extract jetton transfer details from an internal message body.

    Args:
        body_cell: The body cell of an internal message.

    Returns:
        JettonTransferInfo or None if not a jetton transfer.
    """
    cs = body_cell.begin_parse()

    if cs.remaining_bits < 32:
        return None

    op = cs.load_uint(32)
    if op != JETTON_TRANSFER_OP:
        return None

    _query_id = cs.load_uint(64)
    amount = cs.load_coins()
    destination = _load_msg_address(cs)
    response_dest = _load_msg_address(cs)

    has_custom = cs.load_bit()
    if has_custom:
        cs.load_ref()

    forward_ton = cs.load_coins()

    return JettonTransferInfo(
        destination=destination or "",
        amount=int(amount),
        response_destination=response_dest,
        forward_ton_amount=int(forward_ton),
    )


def parse_boc_and_extract(boc_b64: str) -> tuple[W5ParsedMessage, list[JettonTransferInfo]]:
    """Full pipeline: parse BoC -> extract W5 message -> find jetton transfers.

    Args:
        boc_b64: Base64-encoded external message BoC.

    Returns:
        Tuple of (W5ParsedMessage, list of JettonTransferInfo).
    """
    body = parse_external_message(boc_b64)
    w5_msg = parse_w5_body(body)

    jetton_transfers: list[JettonTransferInfo] = []
    for msg in w5_msg.internal_messages:
        body_cell = msg.get("body")
        if body_cell is None:
            continue
        info = extract_jetton_transfer(body_cell)
        if info:
            info.jetton_wallet = msg.get("destination", "")
            jetton_transfers.append(info)

    return w5_msg, jetton_transfers


def compute_boc_hash(boc_b64: str) -> str:
    """Compute a stable hash of a BoC for deduplication.

    Args:
        boc_b64: Base64-encoded BoC.

    Returns:
        Hex-encoded SHA256 hash.
    """
    raw = base64.b64decode(boc_b64)
    return hashlib.sha256(raw).hexdigest()
