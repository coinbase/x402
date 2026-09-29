"""SVM facilitator implementation for the Exact payment scheme (V2)."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

try:
    from solders.pubkey import Pubkey
except ImportError as e:
    raise ImportError(
        "SVM mechanism requires solana packages. Install with: pip install x402[svm]"
    ) from e

from ....pending_settlement_store import InMemoryPendingSettlementStore, PendingSettlementStore
from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import (
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ERR_AMOUNT_INSUFFICIENT,
    ERR_DUPLICATE_SETTLEMENT,
    ERR_FEE_PAYER_MISSING,
    ERR_FEE_PAYER_NOT_MANAGED,
    ERR_FEE_PAYER_TRANSFERRING,
    ERR_INVALID_COMPUTE_LIMIT,
    ERR_INVALID_COMPUTE_PRICE,
    ERR_MEMO_COUNT,
    ERR_MEMO_MISMATCH,
    ERR_MINT_MISMATCH,
    ERR_NETWORK_MISMATCH,
    ERR_NO_TRANSFER_INSTRUCTION,
    ERR_PREFLIGHT_POSTFLIGHT_FEE_PAYER_NOT_ISOLATED,
    ERR_PROTOCOL_INSTRUCTION_ORDER,
    ERR_RECIPIENT_MISMATCH,
    ERR_SETTLEMENT_PENDING,
    ERR_SIMULATION_FAILED,
    ERR_TRANSACTION_DECODE_FAILED,
    ERR_TRANSACTION_FAILED,
    ERR_UNKNOWN_INSTRUCTION,
    ERR_UNSUPPORTED_SCHEME,
    LIGHTHOUSE_PROGRAM_ADDRESS,
    MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
    MEMO_PROGRAM_ADDRESS,
    SCHEME_EXACT,
    TOKEN_2022_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
)
from ..settlement_cache import SettlementCache
from ..signer import FacilitatorSvmSigner
from ..types import ExactSvmPayload
from ..utils import (
    decode_transaction_from_payload,
    derive_ata,
    get_token_payer_from_transaction,
    transaction_message_hash,
)

_COMPUTE_BUDGET_PUBKEY = Pubkey.from_string(COMPUTE_BUDGET_PROGRAM_ADDRESS)
_TOKEN_PUBKEY = Pubkey.from_string(TOKEN_PROGRAM_ADDRESS)
_TOKEN_2022_PUBKEY = Pubkey.from_string(TOKEN_2022_PROGRAM_ADDRESS)
_MEMO_PUBKEY = Pubkey.from_string(MEMO_PROGRAM_ADDRESS)
_LIGHTHOUSE_PUBKEY = Pubkey.from_string(LIGHTHOUSE_PROGRAM_ADDRESS)


class _PartitionedInstructions:
    """Result of classifying a transaction's instructions by identity (program ID +
    instruction discriminator), not position.
    """

    def __init__(self) -> None:
        self.compute_limit_ix: Any = None
        self.compute_price_ix: Any = None
        self.transfer_ix: Any = None
        self.memo_ix: Any = None


def _classify_protocol_instruction(static_accounts: list, ix: Any) -> str:
    """Classify an instruction by program ID + discriminator into one of:
    "compute_limit", "compute_price", "transfer", "memo", "guard" (Lighthouse,
    allowed anywhere), or "unknown" (rejected).
    """
    program_address = static_accounts[ix.program_id_index]
    data = bytes(ix.data)

    if program_address == _COMPUTE_BUDGET_PUBKEY:
        if len(data) >= 5 and data[0] == 2:  # SetComputeUnitLimit
            return "compute_limit"
        if len(data) >= 9 and data[0] == 3:  # SetComputeUnitPrice
            return "compute_price"
        return "unknown"

    if program_address == _TOKEN_PUBKEY or program_address == _TOKEN_2022_PUBKEY:
        if len(data) >= 10 and data[0] == 12:  # TransferChecked
            return "transfer"
        return "unknown"

    if program_address == _MEMO_PUBKEY:
        return "memo"

    if program_address == _LIGHTHOUSE_PUBKEY:
        return "guard"

    return "unknown"


@dataclass
class InstructionIdentity:
    """Identifies a single instruction by program address and instruction
    discriminator. discriminator is matched as a byte-for-byte prefix of the
    instruction's data, so it supports both short (e.g. single-byte) and long
    (e.g. 8-byte Anchor sighash) discriminators.
    """

    program_address: Pubkey
    discriminator: bytes


# An InstructionTuple is an ordered sequence of InstructionIdentity that may
# appear together as a contiguous (guard instructions aside) block
# immediately before or after the required protocol instructions.
InstructionTuple = list[InstructionIdentity]


def _matches_identity(static_accounts: list, ix: Any, identity: InstructionIdentity) -> bool:
    """Report whether ix was issued against identity.program_address with
    instruction data beginning with identity.discriminator.
    """
    program_address = static_accounts[ix.program_id_index]
    if program_address != identity.program_address:
        return False
    data = bytes(ix.data)
    return data[: len(identity.discriminator)] == identity.discriminator


def _match_leading_tuple(
    static_accounts: list, instructions: list, allowlist: list[InstructionTuple]
) -> tuple[list, list] | None:
    """Scan forward from the start of instructions, skipping any guard
    instructions encountered, and check whether the non-guard instructions
    match one of the allowlisted tuples exactly, in order. Returns
    (matched, rest) on the first full match (matched includes any
    interspersed guards), or None if no tuple fully matches.
    """
    for tuple_ in allowlist:
        matched: list = []
        identity_index = 0
        cursor = 0
        while identity_index < len(tuple_) and cursor < len(instructions):
            ix = instructions[cursor]
            if _classify_protocol_instruction(static_accounts, ix) == "guard":
                matched.append(ix)
                cursor += 1
                continue
            if not _matches_identity(static_accounts, ix, tuple_[identity_index]):
                break
            matched.append(ix)
            cursor += 1
            identity_index += 1
        if identity_index == len(tuple_):
            return matched, instructions[cursor:]
    return None


def _match_trailing_tuple(
    static_accounts: list, instructions: list, allowlist: list[InstructionTuple]
) -> tuple[list, list] | None:
    """Scan backward from the end of instructions. See _match_leading_tuple."""
    for tuple_ in allowlist:
        matched: list = []
        identity_index = len(tuple_) - 1
        cursor = len(instructions) - 1
        while identity_index >= 0 and cursor >= 0:
            ix = instructions[cursor]
            if _classify_protocol_instruction(static_accounts, ix) == "guard":
                matched.insert(0, ix)
                cursor -= 1
                continue
            if not _matches_identity(static_accounts, ix, tuple_[identity_index]):
                break
            matched.insert(0, ix)
            cursor -= 1
            identity_index -= 1
        if identity_index < 0:
            return matched, instructions[: cursor + 1]
    return None


def _assert_fee_payer_isolated_from_tuple(
    static_accounts: list, matched: list, fee_payer: Pubkey
) -> str | None:
    """Isolation-check a matched preflight/postflight instruction block.
    Unlike the fixed protocol/guard instruction set, an allowlisted tuple is
    operator-configured arbitrary code and is not otherwise known to be safe.

    Returns an error reason string on failure, or None on success.
    """
    for ix in matched:
        program_address = static_accounts[ix.program_id_index]
        if program_address == fee_payer:
            return ERR_PREFLIGHT_POSTFLIGHT_FEE_PAYER_NOT_ISOLATED
        for account_index in ix.accounts:
            if static_accounts[account_index] == fee_payer:
                return ERR_PREFLIGHT_POSTFLIGHT_FEE_PAYER_NOT_ISOLATED
    return None


def _partition_protocol_instructions(
    static_accounts: list, instructions: list
) -> tuple[_PartitionedInstructions | None, str | None]:
    """Partition a transaction's instructions into their protocol roles.

    Protocol instructions (compute limit -> compute price -> transfer -> optional
    memo) must appear in that fixed relative order, identified by program ID +
    discriminator rather than absolute index. Guard (Lighthouse) instructions may
    appear anywhere in the sequence — before, after, or interspersed among the
    protocol instructions — since they only assert/abort and never mutate
    payment-relevant state. Any other unrecognized program anywhere is rejected.

    Returns (partitioned, None) on success, or (None, error_reason) on failure.
    """
    result = _PartitionedInstructions()
    for ix in instructions:
        kind = _classify_protocol_instruction(static_accounts, ix)

        if kind == "guard":
            continue

        if kind == "compute_limit":
            if (
                result.compute_limit_ix is not None
                or result.compute_price_ix is not None
                or result.transfer_ix is not None
                or result.memo_ix is not None
            ):
                return None, ERR_PROTOCOL_INSTRUCTION_ORDER
            result.compute_limit_ix = ix
        elif kind == "compute_price":
            if (
                result.compute_limit_ix is None
                or result.compute_price_ix is not None
                or result.transfer_ix is not None
                or result.memo_ix is not None
            ):
                return None, ERR_PROTOCOL_INSTRUCTION_ORDER
            result.compute_price_ix = ix
        elif kind == "transfer":
            if (
                result.compute_limit_ix is None
                or result.compute_price_ix is None
                or result.memo_ix is not None
                or result.transfer_ix is not None
            ):
                return None, ERR_PROTOCOL_INSTRUCTION_ORDER
            result.transfer_ix = ix
        elif kind == "memo":
            if result.transfer_ix is None:
                return None, ERR_PROTOCOL_INSTRUCTION_ORDER
            if result.memo_ix is not None:
                return None, ERR_MEMO_COUNT
            result.memo_ix = ix
        else:
            return None, ERR_UNKNOWN_INSTRUCTION

    return result, None


class ExactSvmScheme:
    """SVM facilitator implementation for the Exact payment scheme (V2).

    Verifies and settles SPL token payments on Solana networks.

    Attributes:
        scheme: The scheme identifier ("exact").
        caip_family: The CAIP family pattern ("solana:*").
    """

    scheme = SCHEME_EXACT
    caip_family = "solana:*"

    def __init__(
        self,
        signer: FacilitatorSvmSigner,
        settlement_cache: SettlementCache | None = None,
        pending_store: PendingSettlementStore | None = None,
        preflight_instruction_allowlist: list[InstructionTuple] | None = None,
        postflight_instruction_allowlist: list[InstructionTuple] | None = None,
    ):
        """Create ExactSvmScheme facilitator.

        Args:
            signer: SVM signer for verification and settlement.
            settlement_cache: Optional shared settlement cache (one is created if omitted).
            pending_store: Optional store letting a retried settle for the same
                transaction reconcile against an already-broadcast signature instead of
                re-verifying and re-sending (see settlement_pending). Defaults to a fresh
                in-memory store when omitted.
            preflight_instruction_allowlist: Instruction tuples that may appear as a
                contiguous block (guard instructions aside) immediately BEFORE the
                required protocol instructions. Extension point for prefixing the
                payment with out-of-band setup. A matched block is fee-payer-isolation
                checked. Defaults to no allowlisted tuples (current behavior).
            postflight_instruction_allowlist: Instruction tuples that may appear as a
                contiguous block (guard instructions aside) immediately AFTER the
                required protocol instructions. See preflight_instruction_allowlist.
        """
        self._signer = signer
        self._settlement_cache = settlement_cache or SettlementCache()
        self._pending_store: PendingSettlementStore = (
            pending_store or InMemoryPendingSettlementStore()
        )
        self._preflight_instruction_allowlist: list[InstructionTuple] = (
            preflight_instruction_allowlist or []
        )
        self._postflight_instruction_allowlist: list[InstructionTuple] = (
            postflight_instruction_allowlist or []
        )

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        """Get mechanism-specific extra data for the supported kinds endpoint.

        For SVM, this includes a randomly selected fee payer address.
        Random selection distributes load across multiple signers.

        Args:
            network: Network identifier (unused for SVM).

        Returns:
            Extra data with feePayer address.
        """
        _ = network  # Unused
        # Randomly select from available signers to distribute load
        addresses = self._signer.get_addresses()
        fee_payer = random.choice(addresses)

        return {"feePayer": fee_payer}

    def get_signers(self, network: Network) -> list[str]:
        """Get facilitator wallet addresses.

        Args:
            network: Network identifier.

        Returns:
            List of facilitator fee payer addresses.
        """
        _ = network  # Unused
        return list(self._signer.get_addresses())

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context=None,
    ) -> VerifyResponse:
        """Verify SPL token payment payload.

        Validates:
        - Scheme and network match
        - Transaction instructions: ComputeLimit, ComputePrice, TransferChecked, and an
          optional Memo must appear in that fixed relative order, identified by program
          ID + instruction discriminator rather than absolute position. Guard
          instructions (currently only Lighthouse) may appear anywhere in the sequence.
        - Compute budget instructions are valid
        - TransferChecked instruction:
          - Token program is known (Token or Token-2022)
          - Mint matches requirements.asset
          - Destination ATA matches requirements.pay_to
        - Amount >= requirements.amount
          - Authority is not the facilitator (prevent self-transfer)
        - Simulates transaction to catch runtime errors

        Args:
            payload: Payment payload from client.
            requirements: Payment requirements.

        Returns:
            VerifyResponse with is_valid and payer.
        """
        svm_payload = ExactSvmPayload.from_dict(payload.payload)
        network = str(requirements.network)

        # Step 1: Validate Payment Requirements
        if payload.accepted.scheme != SCHEME_EXACT or requirements.scheme != SCHEME_EXACT:
            return VerifyResponse(is_valid=False, invalid_reason=ERR_UNSUPPORTED_SCHEME, payer="")

        if str(payload.accepted.network) != str(requirements.network):
            return VerifyResponse(is_valid=False, invalid_reason=ERR_NETWORK_MISMATCH, payer="")

        extra = requirements.extra or {}
        fee_payer_str = extra.get("feePayer")
        if not fee_payer_str or not isinstance(fee_payer_str, str):
            return VerifyResponse(is_valid=False, invalid_reason=ERR_FEE_PAYER_MISSING, payer="")

        # Verify that the requested feePayer is managed by this facilitator
        signer_addresses = self._signer.get_addresses()
        if fee_payer_str not in signer_addresses:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_FEE_PAYER_NOT_MANAGED, payer=""
            )

        # Step 2: Parse and Validate Transaction Structure
        try:
            tx = decode_transaction_from_payload(svm_payload)
        except Exception:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_TRANSACTION_DECODE_FAILED, payer=""
            )

        message = tx.message
        instructions = message.instructions
        static_accounts = list(message.account_keys)

        # Preflight/postflight allowlist: a configured instruction tuple may
        # appear as a contiguous block (guard instructions aside) immediately
        # before/after the required protocol instructions. Empty allowlists
        # (the default) never match, so this is a no-op unless explicitly
        # configured.
        if self._preflight_instruction_allowlist:
            leading_match = _match_leading_tuple(
                static_accounts, instructions, self._preflight_instruction_allowlist
            )
            if leading_match is not None:
                matched, instructions = leading_match
                fee_payer_pubkey = Pubkey.from_string(fee_payer_str)
                isolation_error = _assert_fee_payer_isolated_from_tuple(
                    static_accounts, matched, fee_payer_pubkey
                )
                if isolation_error is not None:
                    return VerifyResponse(is_valid=False, invalid_reason=isolation_error, payer="")
        if self._postflight_instruction_allowlist:
            trailing_match = _match_trailing_tuple(
                static_accounts, instructions, self._postflight_instruction_allowlist
            )
            if trailing_match is not None:
                matched, instructions = trailing_match
                fee_payer_pubkey = Pubkey.from_string(fee_payer_str)
                isolation_error = _assert_fee_payer_isolated_from_tuple(
                    static_accounts, matched, fee_payer_pubkey
                )
                if isolation_error is not None:
                    return VerifyResponse(is_valid=False, invalid_reason=isolation_error, payer="")

        # Protocol instructions (ComputeLimit, ComputePrice, TransferChecked, and an
        # optional Memo) are identified by program ID + instruction discriminator and
        # MUST appear in that fixed relative order. Guard instructions (currently only
        # Lighthouse -- Phantom/Solflare's wallet-protection assertions) may appear
        # anywhere in the instruction list, since they only assert/abort and never
        # mutate payment-relevant state.
        # See: https://github.com/x402-foundation/x402/issues/828
        #  and: https://github.com/x402-foundation/x402/issues/2097
        partitioned, error_reason = _partition_protocol_instructions(static_accounts, instructions)
        if error_reason is not None:
            return VerifyResponse(is_valid=False, invalid_reason=error_reason, payer="")
        assert partitioned is not None
        if (
            partitioned.compute_limit_ix is None
            or partitioned.compute_price_ix is None
            or partitioned.transfer_ix is None
        ):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NO_TRANSFER_INSTRUCTION, payer=""
            )

        # Step 3: Verify Compute Budget Instructions
        cu_limit_data = bytes(partitioned.compute_limit_ix.data)
        if len(cu_limit_data) < 1 or cu_limit_data[0] != 2:  # SetComputeUnitLimit discriminator
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INVALID_COMPUTE_LIMIT, payer=""
            )

        cu_price_data = bytes(partitioned.compute_price_ix.data)
        if len(cu_price_data) < 9 or cu_price_data[0] != 3:  # SetComputeUnitPrice discriminator
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INVALID_COMPUTE_PRICE, payer=""
            )

        # Parse microLamports (u64, little-endian) and check against max
        micro_lamports = int.from_bytes(cu_price_data[1:9], "little")
        if micro_lamports > MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS:
            return VerifyResponse(
                is_valid=False,
                invalid_reason="invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
                payer="",
            )

        # Get token payer
        payer = get_token_payer_from_transaction(tx)
        if not payer:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NO_TRANSFER_INSTRUCTION, payer=""
            )

        # Step 4: Verify Transfer Instruction
        transfer_ix = partitioned.transfer_ix
        transfer_program = static_accounts[transfer_ix.program_id_index]
        transfer_program_str = str(transfer_program)

        # Step 5: Verify memo content matches extra.memo when present. Guard
        # (Lighthouse) instructions and unknown programs were already rejected
        # by _partition_protocol_instructions above.
        expected_memo = extra.get("memo")
        if expected_memo and isinstance(expected_memo, str):
            if partitioned.memo_ix is None:
                return VerifyResponse(is_valid=False, invalid_reason=ERR_MEMO_COUNT, payer=payer)
            actual_memo = bytes(partitioned.memo_ix.data).decode("utf-8")
            if actual_memo != expected_memo:
                return VerifyResponse(is_valid=False, invalid_reason=ERR_MEMO_MISMATCH, payer=payer)

        # Parse transfer instruction
        transfer_accounts = list(transfer_ix.accounts)
        transfer_data = bytes(transfer_ix.data)

        # TransferChecked data: [12 (discriminator), u64 amount, u8 decimals]
        if len(transfer_data) < 10 or transfer_data[0] != 12:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NO_TRANSFER_INSTRUCTION, payer=payer
            )

        # TransferChecked accounts: [source, mint, destination, owner]
        if len(transfer_accounts) < 4:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NO_TRANSFER_INSTRUCTION, payer=payer
            )

        _source_ata = static_accounts[transfer_accounts[0]]  # noqa: F841
        mint = static_accounts[transfer_accounts[1]]
        dest_ata = static_accounts[transfer_accounts[2]]
        authority = static_accounts[transfer_accounts[3]]

        amount = int.from_bytes(transfer_data[1:9], "little")

        # Verify facilitator's signers are not transferring their own funds
        # SECURITY: Prevent facilitator from signing away their own tokens
        authority_str = str(authority)
        if authority_str in signer_addresses:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_FEE_PAYER_TRANSFERRING, payer=payer
            )

        # Verify mint address matches requirements
        mint_str = str(mint)
        if mint_str != requirements.asset:
            return VerifyResponse(is_valid=False, invalid_reason=ERR_MINT_MISMATCH, payer=payer)

        # Verify destination ATA matches expected ATA for payTo address
        expected_dest_ata = derive_ata(
            requirements.pay_to, requirements.asset, transfer_program_str
        )
        if str(dest_ata) != expected_dest_ata:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_RECIPIENT_MISMATCH, payer=payer
            )

        # Verify transfer amount meets requirements
        required_amount = int(requirements.amount)
        if amount < required_amount:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_AMOUNT_INSUFFICIENT, payer=payer
            )

        # Step 5: Sign and Simulate Transaction
        # CRITICAL: Simulation proves transaction will succeed
        try:
            # Sign transaction with the feePayer's signer
            fully_signed_tx = self._signer.sign_transaction(
                svm_payload.transaction, fee_payer_str, network
            )

            # Simulate to verify transaction would succeed
            self._signer.simulate_transaction(fully_signed_tx, network)
        except Exception as e:
            error_msg = str(e)
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_SIMULATION_FAILED,
                invalid_message=error_msg,
                payer=payer,
            )

        return VerifyResponse(is_valid=True, payer=payer)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context=None,
    ) -> SettleResponse:
        """Settle SPL token payment on-chain.

        - Re-verifies payment
        - Signs transaction with fee payer
        - Sends transaction to network
        - Waits for confirmation

        Args:
            payload: Verified payment payload.
            requirements: Payment requirements.

        Returns:
            SettleResponse with success, transaction, and payer.
        """
        svm_payload = ExactSvmPayload.from_dict(payload.payload)
        network = str(payload.accepted.network)

        # Parse and decode the transaction up front (no RPC calls) so we can key the
        # PendingSettlementStore on the message hash before doing any verify/sign/send work.
        try:
            tx = decode_transaction_from_payload(svm_payload)
            tx_key = transaction_message_hash(tx)
        except Exception as e:
            return SettleResponse(
                success=False,
                error_reason=ERR_TRANSACTION_DECODE_FAILED,
                error_message=str(e),
                network=network,
                payer="",
                transaction="",
            )

        # Pending-settlement fast path: a prior settle for this exact transaction
        # broadcast successfully but its confirm_transaction wait failed. Reconcile
        # against the already-broadcast signature instead of re-verifying and
        # re-sending: Solana transactions embed a recent blockhash that expires (so a
        # resend can fail even when the original is still perfectly valid), and if the
        # original actually did land, a second verify's balance-based simulation could
        # now spuriously fail (funds already moved).
        cached_signature = self._pending_store.get(tx_key)
        if cached_signature is not None:
            # Remove before reconciling (rather than after) so a concurrent
            # retry of the same payload misses here instead of also
            # reconciling: it falls through to the settlement_cache dedup
            # check below, which independently rejects it as a duplicate.
            self._pending_store.delete(tx_key)
            # Best-effort payer for the response; a lookup failure here doesn't block
            # reconciliation (the payload already broadcast successfully).
            try:
                payer = get_token_payer_from_transaction(tx) or ""
            except Exception:
                payer = ""
            return self._reconcile_pending_settlement(tx_key, cached_signature, payer, network)

        # First verify
        verify_result = self.verify(payload, requirements, context)
        if not verify_result.is_valid:
            return SettleResponse(
                success=False,
                error_reason=verify_result.invalid_reason,
                network=network,
                payer=verify_result.payer,
                transaction="",
            )

        # Duplicate settlement check keyed on message hash (immune to mutable fee-payer sig at slot 0).
        if self._settlement_cache.is_duplicate(tx_key):
            return SettleResponse(
                success=False,
                error_reason=ERR_DUPLICATE_SETTLEMENT,
                network=network,
                payer=verify_result.payer or "",
                transaction="",
            )

        try:
            # Extract feePayer from requirements (already validated in verify)
            extra = requirements.extra or {}
            fee_payer = extra["feePayer"]

            # Sign transaction with the feePayer's signer
            fully_signed_tx = self._signer.sign_transaction(
                svm_payload.transaction, fee_payer, network
            )
        except Exception as e:
            self._settlement_cache.delete(tx_key)
            return SettleResponse(
                success=False,
                error_reason=ERR_TRANSACTION_FAILED,
                error_message=str(e),
                transaction="",
                network=network,
                payer=verify_result.payer or "",
            )

        try:
            # Send transaction to network
            signature = self._signer.send_transaction(fully_signed_tx, network)
        except Exception as e:
            self._settlement_cache.delete(tx_key)
            return SettleResponse(
                success=False,
                error_reason=ERR_TRANSACTION_FAILED,
                error_message=str(e),
                transaction="",
                network=network,
                payer=verify_result.payer or "",
            )

        # Wait for confirmation, shared with the pending-settlement reconciliation
        # path in _reconcile_pending_settlement() below.
        return self._await_confirmation(tx_key, signature, verify_result.payer or "", network)

    def _reconcile_pending_settlement(
        self,
        tx_key: str,
        signature: str,
        payer: str,
        network: str,
    ) -> SettleResponse:
        """Handle a PendingSettlementStore cache hit.

        A prior settle call for this transaction (keyed by tx_key, the message hash)
        already broadcast `signature` but couldn't confirm it before returning
        settlement_pending. Re-awaits confirmation of that same signature rather than
        re-verifying/re-signing/re-sending — see the fast-path comment in settle() for
        why re-sending is unsafe here.
        """
        return self._await_confirmation(tx_key, signature, payer, network)

    def _await_confirmation(
        self,
        tx_key: str,
        signature: str,
        payer: str,
        network: str,
    ) -> SettleResponse:
        """Waits for confirmation of an already-broadcast signature and builds the
        settle response, shared by the fresh-broadcast path in settle() and the
        pending-settlement reconciliation path in _reconcile_pending_settlement().

        On confirm failure, records/refreshes the pending-settlement entry so a
        retry reconciles via the fast path instead of re-verifying/re-sending.
        """
        try:
            self._signer.confirm_transaction(signature, network)
        except Exception as e:
            try:
                self._pending_store.set(tx_key, signature)
            except Exception as store_error:
                # Can't guarantee a later retry will find this to reconcile
                # against — a blind retry could re-verify/re-broadcast and
                # double-send. Downgrade to terminal, preserving the signature
                # for manual reconciliation.
                return SettleResponse(
                    success=False,
                    error_reason=ERR_TRANSACTION_FAILED,
                    error_message=(
                        f"settlement_pending, but failed to persist for retry: {store_error}"
                    ),
                    transaction=signature,
                    network=network,
                    payer=payer,
                )
            return SettleResponse(
                success=False,
                error_reason=ERR_SETTLEMENT_PENDING,
                error_message=str(e),
                transaction=signature,
                network=network,
                payer=payer,
            )

        try:
            self._pending_store.delete(tx_key)
        except Exception:
            pass  # best-effort; a stale entry merely lingers until TTL expiry
        return SettleResponse(
            success=True,
            transaction=signature,
            network=network,
            payer=payer,
        )
