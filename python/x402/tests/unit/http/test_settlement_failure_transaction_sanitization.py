"""Tests that terminal settle failures never surface a transaction hash over the
wire, while settlement_pending failures (broadcast succeeded, receipt unconfirmed)
keep it for reconciliation. Mirrors the equivalent Go (`sanitizedFailureTransaction`)
and TypeScript (`sanitizedFailureTransaction`) behavior.
"""

from __future__ import annotations

from x402.http.types import PaymentOption, RouteConfig
from x402.http.x402_http_server_base import (
    _sanitized_failure_transaction,
    x402HTTPServerBase,
)
from x402.http.utils import decode_payment_response_header
from x402.schemas import PaymentRequirements, SettleResponse
from x402.schemas.errors import SettleError


class _FakeResourceServer:
    def __init__(self, settle_result: SettleResponse | Exception) -> None:
        self._settle_result = settle_result

    def settle_payment(self, *args, **kwargs) -> SettleResponse:
        if isinstance(self._settle_result, Exception):
            raise self._settle_result
        return self._settle_result


def _requirements() -> PaymentRequirements:
    return PaymentRequirements(
        scheme="exact",
        network="eip155:8453",
        asset="0x0000000000000000000000000000000000000001",
        amount="1000",
        pay_to="0x0000000000000000000000000000000000000002",
        max_timeout_seconds=60,
        extra={},
    )


def _route_config() -> RouteConfig:
    return RouteConfig(
        accepts=PaymentOption(
            scheme="exact",
            pay_to="0xpay",
            price="$0.01",
            network="eip155:8453",
        )
    )


def test_sanitized_failure_transaction_strips_non_pending_reasons():
    assert _sanitized_failure_transaction("invalid_exact_evm_transaction_failed", "0xabc") == ""


def test_sanitized_failure_transaction_keeps_settlement_pending():
    assert _sanitized_failure_transaction("settlement_pending", "0xabc") == "0xabc"


def test_terminal_failure_strips_transaction_from_direct_response():
    server = _FakeResourceServer(
        SettleResponse(
            success=False,
            error_reason="invalid_exact_evm_transaction_failed",
            transaction="0xshouldnotbeexposed",
            network="eip155:8453",
        )
    )
    http_server = x402HTTPServerBase(server, {"*": _route_config()})  # type: ignore[arg-type]

    result = http_server.process_settlement(
        payment_payload=None,  # type: ignore[arg-type]
        requirements=_requirements(),
    )

    assert result.success is False
    assert result.transaction == ""
    decoded = decode_payment_response_header(result.headers["PAYMENT-RESPONSE"])
    assert decoded.transaction == ""


def test_settlement_pending_keeps_transaction_from_direct_response():
    server = _FakeResourceServer(
        SettleResponse(
            success=False,
            error_reason="settlement_pending",
            transaction="0xpendingtx",
            network="eip155:8453",
        )
    )
    http_server = x402HTTPServerBase(server, {"*": _route_config()})  # type: ignore[arg-type]

    result = http_server.process_settlement(
        payment_payload=None,  # type: ignore[arg-type]
        requirements=_requirements(),
    )

    assert result.success is False
    assert result.transaction == "0xpendingtx"
    decoded = decode_payment_response_header(result.headers["PAYMENT-RESPONSE"])
    assert decoded.transaction == "0xpendingtx"


def test_terminal_failure_strips_transaction_from_thrown_settle_error():
    server = _FakeResourceServer(
        SettleError(
            reason="invalid_exact_evm_transaction_failed",
            transaction="0xshouldnotbeexposed",
        )
    )
    http_server = x402HTTPServerBase(server, {"*": _route_config()})  # type: ignore[arg-type]

    result = http_server.process_settlement(
        payment_payload=None,  # type: ignore[arg-type]
        requirements=_requirements(),
    )

    assert result.success is False
    assert result.transaction == ""
    decoded = decode_payment_response_header(result.headers["PAYMENT-RESPONSE"])
    assert decoded.transaction == ""
