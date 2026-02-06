"""Unit tests for MCP server payment wrapper."""

from unittest.mock import Mock, MagicMock

import pytest

from x402.mcp import PaymentWrapperConfig, ResourceInfo, create_payment_wrapper
from x402.schemas import PaymentPayload, PaymentRequirements, SettleResponse


class MockResourceServer:
    """Mock resource server for testing."""

    def __init__(self):
        """Initialize mock server."""
        self.verify_payment = Mock()
        self.settle_payment = Mock()
        # Create a Mock that wraps the real method so we can track calls
        self._create_payment_required_response_impl = self._create_payment_required_response_real
        self.create_payment_required_response = MagicMock(side_effect=self._create_payment_required_response_real)

    def verify_payment(self, payload, requirements):
        """Mock verify payment."""
        return Mock(is_valid=True)

    def settle_payment(self, payload, requirements):
        """Mock settle payment."""
        return SettleResponse(
            success=True,
            transaction="0xtx123",
            network="eip155:84532",
        )

    def _create_payment_required_response_real(self, accepts, resource_info, error_msg):
        """Real implementation of create payment required response."""
        from x402.schemas import PaymentRequired

        return PaymentRequired(
            x402_version=2,
            accepts=accepts,
            error=error_msg,
            resource=resource_info,
        )


def test_create_payment_wrapper_basic_flow():
    """Test basic payment wrapper flow."""
    server = MockResourceServer()
    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
        resource=ResourceInfo(
            url="mcp://tool/test",
            description="Test tool",
            mime_type="application/json",
        ),
    )

    paid = create_payment_wrapper(server, config)

    # Create handler
    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}], "isError": False}

    wrapped = paid(handler)

    # Test with payment
    payload = PaymentPayload(
        x402_version=2,
        accepted={
            "scheme": "exact",
            "network": "eip155:84532",
            "amount": "1000",
            "asset": "USDC",
            "pay_to": "0xrecipient",
            "max_timeout_seconds": 300,
        },
        payload={"signature": "0x123"},
    )

    args = {"test": "value"}
    extra = {
        "_meta": {"x402/payment": payload.model_dump() if hasattr(payload, "model_dump") else payload},
        "toolName": "test",
    }

    result = wrapped(args, extra)

    assert result.is_error is False
    assert "x402/payment-response" in result.meta
    assert server.verify_payment.called
    assert server.settle_payment.called


def test_create_payment_wrapper_no_payment():
    """Test payment wrapper when no payment provided."""
    server = MockResourceServer()
    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
    )

    paid = create_payment_wrapper(server, config)

    def handler(args, context):
        return {"content": [], "isError": False}

    wrapped = paid(handler)

    args = {}
    extra = {"_meta": {}, "toolName": "test"}

    result = wrapped(args, extra)

    # Should return payment required error
    assert result.is_error is True
    assert server.create_payment_required_response.called


def test_create_payment_wrapper_verification_failure():
    """Test payment wrapper when verification fails."""
    server = MockResourceServer()
    server.verify_payment = Mock(return_value=Mock(is_valid=False, invalid_reason="Invalid signature"))

    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
    )

    paid = create_payment_wrapper(server, config)

    def handler(args, context):
        return {"content": [], "isError": False}

    wrapped = paid(handler)

    payload = PaymentPayload(
        x402_version=2,
        accepted={
            "scheme": "exact",
            "network": "eip155:84532",
            "amount": "1000",
            "asset": "USDC",
            "pay_to": "0xrecipient",
            "max_timeout_seconds": 300,
        },
        payload={"signature": "0xinvalid"},
    )

    args = {}
    extra = {
        "_meta": {"x402/payment": payload.model_dump() if hasattr(payload, "model_dump") else payload},
        "toolName": "test",
    }

    result = wrapped(args, extra)

    # Should return payment required error
    assert result.is_error is True
    assert server.verify_payment.called
    assert not server.settle_payment.called


def test_create_payment_wrapper_hooks():
    """Test payment wrapper hooks."""
    from x402.mcp.types import PaymentWrapperHooks

    server = MockResourceServer()
    before_called = []
    after_called = []
    settlement_called = []

    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
        hooks=PaymentWrapperHooks(
            on_before_execution=lambda ctx: before_called.append(ctx) or True,
            on_after_execution=lambda ctx: after_called.append(ctx),
            on_after_settlement=lambda ctx: settlement_called.append(ctx),
        ),
    )

    paid = create_payment_wrapper(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    payload = PaymentPayload(
        x402_version=2,
        accepted={
            "scheme": "exact",
            "network": "eip155:84532",
            "amount": "1000",
            "asset": "USDC",
            "pay_to": "0xrecipient",
            "max_timeout_seconds": 300,
        },
        payload={"signature": "0x123"},
    )
    wrapped(
        {"test": "value"},
        {"_meta": {"x402/payment": payload.model_dump() if hasattr(payload, "model_dump") else payload}},
    )

    assert len(before_called) > 0
    assert len(after_called) > 0
    assert len(settlement_called) > 0


def test_create_payment_wrapper_abort_on_before_execution():
    """Test that onBeforeExecution can abort execution."""
    from x402.mcp.types import PaymentWrapperHooks

    server = MockResourceServer()
    handler_called = []

    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
        hooks=PaymentWrapperHooks(
            on_before_execution=lambda ctx: False,  # Abort
        ),
    )

    paid = create_payment_wrapper(server, config)

    def handler(args, context):
        handler_called.append(True)
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    result = wrapped(
        {"test": "value"},
        {"_meta": {"x402/payment": {"x402Version": 2, "payload": {"signature": "0x123"}}}},
    )

    assert len(handler_called) == 0, "Handler should not be called when hook aborts"
    assert result.is_error is True


def test_create_payment_wrapper_settlement_failure():
    """Test handling of settlement failure."""
    server = MockResourceServer()
    server.settle_payment.side_effect = Exception("Settlement failed")

    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
    )

    paid = create_payment_wrapper(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    result = wrapped(
        {"test": "value"},
        {"_meta": {"x402/payment": {"x402Version": 2, "payload": {"signature": "0x123"}}}},
    )

    assert result.is_error is True
    assert "settlement" in str(result.content).lower() or result.structured_content is not None


def test_create_payment_wrapper_hooks_order():
    """Test that hooks are called in correct order."""
    from x402.mcp.types import PaymentWrapperHooks

    server = MockResourceServer()
    call_order = []

    config = PaymentWrapperConfig(
        accepts=[
            PaymentRequirements(
                scheme="exact",
                network="eip155:84532",
                amount="1000",
                asset="USDC",
                pay_to="0xrecipient",
                max_timeout_seconds=300,
            )
        ],
        hooks=PaymentWrapperHooks(
            on_before_execution=lambda ctx: call_order.append("before") or True,
            on_after_execution=lambda ctx: call_order.append("after"),
            on_after_settlement=lambda ctx: call_order.append("settlement"),
        ),
    )

    paid = create_payment_wrapper(server, config)

    def handler(args, context):
        call_order.append("handler")
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    payload = PaymentPayload(
        x402_version=2,
        accepted={
            "scheme": "exact",
            "network": "eip155:84532",
            "amount": "1000",
            "asset": "USDC",
            "pay_to": "0xrecipient",
            "max_timeout_seconds": 300,
        },
        payload={"signature": "0x123"},
    )
    wrapped(
        {"test": "value"},
        {"_meta": {"x402/payment": payload.model_dump() if hasattr(payload, "model_dump") else payload}},
    )

    assert call_order == ["before", "handler", "after", "settlement"]


