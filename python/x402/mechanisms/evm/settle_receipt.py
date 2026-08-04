"""Shared settle receipt wait helpers for EVM facilitators."""

from __future__ import annotations

from typing import Any

from ...schemas import SettleResponse
from .constants import ERR_SETTLEMENT_PENDING, TX_STATUS_SUCCESS


def wait_for_receipt_and_build_response(
    signer: Any,
    tx_hash: str,
    network: str,
    payer: str,
    *,
    failed_reason: str,
    amount: str | None = None,
) -> SettleResponse:
    """Wait for receipt; on wait failure return settlement_pending with the broadcast hash."""
    try:
        receipt = signer.wait_for_transaction_receipt(tx_hash)
    except Exception as e:
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
