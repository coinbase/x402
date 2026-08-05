"""Shared settle receipt wait helpers for EVM facilitators."""

from __future__ import annotations

import logging
from typing import Protocol

from ...schemas import SettleResponse
from .constants import ERR_SETTLEMENT_PENDING, TX_STATUS_SUCCESS
from .types import TransactionReceipt
from .utils import is_valid_tx_hash, truncate_error_message

logger = logging.getLogger(__name__)

# Exceptions that signal a bug in the signer's own code (a bad argument, a missing
# attribute, an out-of-range index) rather than a real RPC/transport failure.
# settlement_pending asserts "the transaction may still confirm on chain," which is
# not a safe inference for these — a signer wrapper that raises AttributeError is
# broken, not unlucky with an RPC node.
_PROGRAMMER_ERRORS: tuple[type[BaseException], ...] = (
    TypeError,
    AttributeError,
    KeyError,
    IndexError,
    NameError,
    NotImplementedError,
)


def is_likely_transport_error(e: BaseException) -> bool:
    """True if `e` looks like a signer/RPC failure rather than a bug in the signer's
    implementation. Used to decide whether a `wait_for_transaction_receipt` failure is
    eligible for `settlement_pending` (unknown outcome, may still confirm) or must be
    treated as a terminal failure instead.
    """
    return not isinstance(e, _PROGRAMMER_ERRORS)


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
        # Only report settlement_pending for failures that plausibly mean "we don't
        # yet know the outcome" — a bug in the signer's own code is not one of those.
        if not is_likely_transport_error(e):
            logger.warning(
                "settle: wait_for_transaction_receipt raised a programmer error payer=%s tx=%s: %s",
                payer,
                tx_hash,
                e,
            )
            return SettleResponse(
                success=False,
                error_reason=failed_reason,
                error_message=truncate_error_message(str(e)),
                transaction="",
                network=network,
                payer=payer,
            )
        logger.warning(
            "settle: wait_for_transaction_receipt failed payer=%s tx=%s: %s", payer, tx_hash, e
        )
        return SettleResponse(
            success=False,
            error_reason=ERR_SETTLEMENT_PENDING,
            error_message=truncate_error_message(str(e)),
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
