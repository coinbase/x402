"""Shared settle receipt wait helpers for EVM facilitators."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from ...pending_settlement_store import PendingSettlementStore
from ...schemas import SettleResponse
from .constants import ERR_SETTLEMENT_PENDING, TX_STATUS_SUCCESS
from .types import TransactionReceipt
from .utils import is_valid_tx_hash, truncate_error_message


class ReceiptWaiter(Protocol):
    """Signer capability required to confirm a broadcast settlement transaction."""

    def wait_for_transaction_receipt(self, tx_hash: str) -> TransactionReceipt:
        """Block until the transaction is mined and return its receipt."""
        ...


def invalid_broadcast_hash_response(
    tx: str,
    error_reason: str,
    network: str,
    payer: str | None = None,
) -> SettleResponse:
    """Terminal failure when a signer reports success without a usable hash."""
    return SettleResponse(
        success=False,
        error_reason=error_reason,
        error_message=f"signer returned an invalid transaction hash: {tx!r}",
        transaction="",
        network=network,
        payer=payer,
    )


def wait_for_receipt_and_build_response(
    signer: ReceiptWaiter,
    tx_hash: str,
    network: str,
    payer: str | None,
    *,
    failed_reason: str,
    amount: str | None = None,
    validate_receipt: Callable[[TransactionReceipt], SettleResponse | None] | None = None,
    on_success: Callable[[TransactionReceipt], SettleResponse] | None = None,
    pending_store: PendingSettlementStore | None = None,
    pending_key: str | None = None,
) -> SettleResponse:
    """Wait for a broadcast receipt and build the settlement response.

    validate_receipt runs after a successful receipt (e.g. a Transfer event check): return a
    SettleResponse to fail settlement, or None to accept success. on_success, when set,
    builds the success response from the receipt.

    When pending_store and pending_key are both provided, they key a store that a subsequent
    settle attempt for the same payload (typically the resource server's single automatic
    retry) uses to reconcile against tx_hash instead of re-broadcasting. An outcome that
    leaves the broadcast's effect unresolved or permanently on-chain — wait failure/timeout,
    a reverted receipt, or an exception while processing a confirmed receipt — records
    tx_hash (a reverted receipt is terminal but still recorded, so an identical-payload
    retry reconciles against the same already-mined receipt instead of re-broadcasting,
    mirroring the Go and TypeScript SDKs). A resolved outcome with nothing left to
    reconcile — success, an invalid hash, or an explicit validate_receipt rejection —
    clears it instead.
    """

    def _mark_pending() -> None:
        if pending_store is not None and pending_key:
            pending_store.set(pending_key, tx_hash)

    def _clear_pending() -> None:
        if pending_store is not None and pending_key:
            pending_store.delete(pending_key)

    if not is_valid_tx_hash(tx_hash):
        _clear_pending()
        return invalid_broadcast_hash_response(tx_hash, failed_reason, network, payer)

    try:
        receipt = signer.wait_for_transaction_receipt(tx_hash)
    except Exception as e:
        _mark_pending()
        return _settlement_pending_response(tx_hash, network, payer, e)

    try:
        if receipt.status != TX_STATUS_SUCCESS:
            _mark_pending()
            return SettleResponse(
                success=False,
                error_reason=failed_reason,
                transaction=tx_hash,
                network=network,
                payer=payer,
            )

        if validate_receipt is not None:
            validation_failure = validate_receipt(receipt)
            if validation_failure is not None:
                _clear_pending()
                return validation_failure

        _clear_pending()

        if on_success is not None:
            return on_success(receipt)

        return SettleResponse(
            success=True,
            transaction=tx_hash,
            network=network,
            payer=payer,
            amount=amount,
        )
    except Exception as e:
        _mark_pending()
        return _settlement_pending_response(tx_hash, network, payer, e)


def _settlement_pending_response(
    tx_hash: str,
    network: str,
    payer: str | None,
    error: Exception,
) -> SettleResponse:
    """Build the non-terminal failure for a broadcast whose effect is unconfirmed."""
    return SettleResponse(
        success=False,
        error_reason=ERR_SETTLEMENT_PENDING,
        error_message=truncate_error_message(str(error)),
        transaction=tx_hash,
        network=network,
        payer=payer,
    )
