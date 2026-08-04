"""Shared settle receipt wait helpers for EVM facilitators."""

from __future__ import annotations

import logging
from typing import Protocol

from ...schemas import SettleResponse
from .constants import ERR_SETTLEMENT_PENDING, TX_STATUS_SUCCESS
from .types import TransactionReceipt
from .utils import is_valid_tx_hash

logger = logging.getLogger(__name__)


class ReceiptWaiter(Protocol):
    """Signer capability required to confirm a broadcast settlement transaction."""

    def wait_for_transaction_receipt(self, tx_hash: str) -> TransactionReceipt:
        """Block until the transaction is mined and return its receipt."""
        ...


def wait_for_receipt_and_build_response(
    signer: ReceiptWaiter,
    tx_hash: str,
    network: str,
    payer: str,
    *,
    failed_reason: str,
    amount: str | None = None,
) -> SettleResponse:
    """Wait for receipt; on wait failure return settlement_pending with the broadcast hash."""
    # settlement_pending is only meaningful with the broadcast hash to reconcile against, so a
    # signer that reports success without a usable hash is a terminal failure.
    if not is_valid_tx_hash(tx_hash):
        logger.warning(
            "settle: signer returned an invalid transaction hash payer=%s tx=%r", payer, tx_hash
        )
        return SettleResponse(
            success=False,
            error_reason=failed_reason,
            error_message=f"signer returned an invalid transaction hash: {tx_hash!r}",
            transaction="",
            network=network,
            payer=payer,
        )

    try:
        receipt = signer.wait_for_transaction_receipt(tx_hash)
    except Exception as e:
        logger.warning(
            "settle: wait_for_transaction_receipt failed payer=%s tx=%s: %s", payer, tx_hash, e
        )
        return SettleResponse(
            success=False,
            error_reason=ERR_SETTLEMENT_PENDING,
            error_message=str(e),
            transaction=tx_hash,
            network=network,
            payer=payer,
        )

    if receipt.status != TX_STATUS_SUCCESS:
        return SettleResponse(
            success=False,
            error_reason=failed_reason,
            transaction=tx_hash,
            network=network,
            payer=payer,
        )

    return SettleResponse(
        success=True,
        transaction=tx_hash,
        network=network,
        payer=payer,
        amount=amount,
    )
