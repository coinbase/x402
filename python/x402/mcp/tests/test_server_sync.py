"""Unit tests for MCP sync server payment wrapper."""

import json
from unittest.mock import MagicMock, Mock

import pytest

from x402.mcp.server_sync import (
    _create_payment_required_result_sync,
    _create_settlement_failed_result_sync,
    create_payment_wrapper_sync,
)
from x402.mcp.types import (
    MCP_PAYMENT_RESPONSE_META_KEY,
    MCPToolResult,
    ResourceInfo,
    SyncPaymentWrapperConfig,
    SyncPaymentWrapperHooks,
)
from x402.schemas import (
    PaymentPayload,
    PaymentRequired,
    PaymentRequirements,
    SettleResponse,
)

# ============================================================================
# Mock sync resource server (mirrors MockAsyncResourceServer from test_server_async)
# ============================================================================


class MockSyncResourceServer:
    """Mock sync resource server for testing."""

    def __init__(self):
        """Initialize mock sync server."""
        self.verify_payment = Mock(return_value=Mock(is_valid=True))
        self.settle_payment = Mock(
            return_value=SettleResponse(
                success=True,
                transaction="0xtx123",
                network="eip155:84532",
            )
        )
        self.create_payment_required_response = MagicMock(
            side_effect=self._create_payment_required_response_real
        )

    def find_matching_requirements(self, available, payload):
        """Find requirements matching the payload's accepted field."""
        accepted = getattr(payload, "accepted", None)
        if accepted is None:
            return None
        for req in available:
            if (
                req.scheme == accepted.scheme
                and req.network == accepted.network
                and req.amount == accepted.amount
                and req.asset == accepted.asset
                and req.pay_to == accepted.pay_to
            ):
                return req
        return None

    def _create_payment_required_response_real(self, accepts, resource_info, error_msg):
        """Real implementation of create payment required response."""
        return PaymentRequired(
            x402_version=2,
            accepts=accepts,
            error=error_msg,
            resource=resource_info,
        )


# ============================================================================
# Helpers
# ============================================================================

DEFAULT_ACCEPTS = [
    PaymentRequirements(
        scheme="exact",
        network="eip155:84532",
        amount="1000",
        asset="USDC",
        pay_to="0xrecipient",
        max_timeout_seconds=300,
    )
]


def make_payload(**overrides):
    """Build a sample PaymentPayload, optionally overriding accepted fields."""
    accepted = {
        "scheme": "exact",
        "network": "eip155:84532",
        "amount": "1000",
        "asset": "USDC",
        "pay_to": "0xrecipient",
        "max_timeout_seconds": 300,
    }
    accepted.update(overrides)
    return PaymentPayload(
        x402_version=2,
        accepted=accepted,
        payload={"signature": "0x123"},
    )


def make_extra(payload, tool_name="test"):
    """Build the extra dict expected by wrapped_handler."""
    return {
        "_meta": {
            "x402/payment": (payload.model_dump() if hasattr(payload, "model_dump") else payload)
        },
        "toolName": tool_name,
    }


# ============================================================================
# create_payment_wrapper_sync — basic flow
# ============================================================================


def test_basic_flow_success():
    """Test basic sync payment wrapper flow: verify -> execute -> settle."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        resource=ResourceInfo(
            url="mcp://tool/test",
            description="Test tool",
            mime_type="application/json",
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}], "isError": False}

    wrapped = paid(handler)
    payload = make_payload()
    result = wrapped({"test": "value"}, make_extra(payload))

    assert result.is_error is False
    assert MCP_PAYMENT_RESPONSE_META_KEY in result.meta
    assert server.verify_payment.called
    assert server.settle_payment.called


def test_payment_response_meta_contains_settle_data():
    """Verify settlement data is attached in the result meta."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "ok"}]}

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    settle_meta = result.meta[MCP_PAYMENT_RESPONSE_META_KEY]
    assert settle_meta["success"] is True
    assert settle_meta["transaction"] == "0xtx123"


# ============================================================================
# No payment provided
# ============================================================================


def test_no_payment_returns_402():
    """When no payment is in _meta, return payment-required error."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [], "isError": False}

    wrapped = paid(handler)
    result = wrapped({}, {"_meta": {}, "toolName": "test"})

    assert result.is_error is True
    assert server.create_payment_required_response.called


def test_no_meta_key_returns_402():
    """When _meta is missing entirely, return payment-required error."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    wrapped = create_payment_wrapper_sync(server, config)(lambda args, ctx: {"content": []})
    result = wrapped({}, {"toolName": "test"})

    assert result.is_error is True


def test_non_dict_meta_returns_402():
    """When _meta is not a dict, return payment-required error."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    wrapped = create_payment_wrapper_sync(server, config)(lambda args, ctx: {"content": []})
    result = wrapped({}, {"_meta": "bad", "toolName": "test"})

    assert result.is_error is True


# ============================================================================
# Verification failure
# ============================================================================


def test_verification_failure():
    """When verification fails, return 402 with reason and skip settlement."""
    server = MockSyncResourceServer()
    server.verify_payment = Mock(
        return_value=Mock(is_valid=False, invalid_reason="Invalid signature")
    )
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [], "isError": False}

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is True
    assert server.verify_payment.called
    assert not server.settle_payment.called


def test_verification_failure_no_reason():
    """When verification fails without a reason, use default message."""
    server = MockSyncResourceServer()
    server.verify_payment = Mock(return_value=Mock(is_valid=False, invalid_reason=None))
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    wrapped = create_payment_wrapper_sync(server, config)(lambda args, ctx: {"content": []})
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is True


# ============================================================================
# No matching requirements
# ============================================================================


def test_no_matching_requirements():
    """When payment doesn't match any accepts entry, return 402."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": []}

    wrapped = paid(handler)

    # Payload with mismatched network
    payload = make_payload(network="eip155:1")
    result = wrapped({}, make_extra(payload))

    assert result.is_error is True
    assert not server.verify_payment.called


# ============================================================================
# find_matching_requirements — multiple accepts
# ============================================================================


def test_find_matching_requirement_selects_correct():
    """Payment matching selects the correct requirement from multiple accepts."""
    server = MockSyncResourceServer()

    accepts = [
        PaymentRequirements(
            scheme="exact",
            network="eip155:84532",
            amount="1000",
            asset="USDC",
            pay_to="0xA",
            max_timeout_seconds=300,
        ),
        PaymentRequirements(
            scheme="exact",
            network="eip155:1",
            amount="2000",
            asset="USDC",
            pay_to="0xB",
            max_timeout_seconds=300,
        ),
    ]

    config = SyncPaymentWrapperConfig(accepts=accepts)
    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)

    # Send payment matching eip155:1
    payload = make_payload(network="eip155:1", amount="2000", pay_to="0xB")
    result = wrapped({}, make_extra(payload))

    assert result.is_error is False
    call_args = server.verify_payment.call_args
    matched_req = call_args[0][1]
    assert matched_req.network == "eip155:1"


# ============================================================================
# Settlement failure
# ============================================================================


def test_settlement_exception():
    """When settlement raises an exception, return settlement-failed error."""
    server = MockSyncResourceServer()
    server.settle_payment = Mock(side_effect=Exception("Settlement failed"))
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    result = wrapped({"test": "value"}, make_extra(make_payload()))

    assert result.is_error is True
    assert result.structured_content is not None
    assert "settlement" in str(result.content).lower() or "Settlement" in str(
        result.structured_content
    )


# ============================================================================
# Handler error skips settlement
# ============================================================================


def test_handler_error_skips_settlement():
    """When handler returns isError=True, do NOT settle."""
    server = MockSyncResourceServer()
    server.settle_payment = Mock()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "tool error"}], "isError": True}

    wrapped = paid(handler)
    result = wrapped({"test": "value"}, make_extra(make_payload()))

    assert result.is_error is True
    server.settle_payment.assert_not_called()


# ============================================================================
# Handler result conversion
# ============================================================================


def test_handler_returns_mcp_tool_result():
    """Handler that returns MCPToolResult directly is used as-is."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return MCPToolResult(
            content=[{"type": "text", "text": "direct result"}],
            is_error=False,
        )

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is False
    assert result.content[0]["text"] == "direct result"


def test_handler_returns_mcp_tool_result_with_error():
    """MCPToolResult with is_error=True skips settlement."""
    server = MockSyncResourceServer()
    server.settle_payment = Mock()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return MCPToolResult(
            content=[{"type": "text", "text": "fail"}],
            is_error=True,
        )

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is True
    server.settle_payment.assert_not_called()


def test_handler_returns_other_type():
    """Handler returning a non-dict/non-MCPToolResult gets stringified."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return 42

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is False
    assert result.content[0]["text"] == "42"


def test_handler_returns_dict_with_structured_content():
    """Dict result with structuredContent key is preserved."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {
            "content": [{"type": "text", "text": "ok"}],
            "isError": False,
            "structuredContent": {"key": "value"},
        }

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.structured_content == {"key": "value"}


# ============================================================================
# Hooks — all three
# ============================================================================


def test_hooks_all_called():
    """All three hooks fire during a successful flow."""
    server = MockSyncResourceServer()
    before_called = []
    after_called = []
    settlement_called = []

    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(
            on_before_execution=lambda ctx: before_called.append(ctx) or True,
            on_after_execution=lambda ctx: after_called.append(ctx),
            on_after_settlement=lambda ctx: settlement_called.append(ctx),
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    wrapped({"test": "value"}, make_extra(make_payload()))

    assert len(before_called) == 1
    assert len(after_called) == 1
    assert len(settlement_called) == 1


def test_hooks_execution_order():
    """Hooks fire in order: before -> handler -> after -> settlement."""
    server = MockSyncResourceServer()
    call_order = []

    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(
            on_before_execution=lambda ctx: call_order.append("before") or True,
            on_after_execution=lambda ctx: call_order.append("after"),
            on_after_settlement=lambda ctx: call_order.append("settlement"),
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        call_order.append("handler")
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    wrapped({"test": "value"}, make_extra(make_payload()))

    assert call_order == ["before", "handler", "after", "settlement"]


# ============================================================================
# Hook: on_before_execution — abort
# ============================================================================


def test_before_hook_aborts_execution():
    """When on_before_execution returns False, handler is not called."""
    server = MockSyncResourceServer()
    handler_called = []

    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(
            on_before_execution=lambda ctx: False,
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        handler_called.append(True)
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    result = wrapped({"test": "value"}, make_extra(make_payload()))

    assert len(handler_called) == 0
    assert result.is_error is True


# ============================================================================
# Hook: on_after_execution — error swallowed
# ============================================================================


def test_after_execution_hook_error_swallowed():
    """Errors in on_after_execution don't propagate; settlement still happens."""
    server = MockSyncResourceServer()

    def error_hook(ctx):
        raise RuntimeError("Hook error")

    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(
            on_after_execution=error_hook,
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    result = wrapped({"test": "value"}, make_extra(make_payload()))

    assert result.is_error is False
    assert server.settle_payment.called


# ============================================================================
# Hook: on_after_settlement — error swallowed
# ============================================================================


def test_after_settlement_hook_error_swallowed():
    """Errors in on_after_settlement don't propagate; result is still returned."""
    server = MockSyncResourceServer()

    def error_hook(ctx):
        raise RuntimeError("Settlement hook error")

    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(
            on_after_settlement=error_hook,
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "success"}]}

    wrapped = paid(handler)
    result = wrapped({"test": "value"}, make_extra(make_payload()))

    assert result.is_error is False
    assert MCP_PAYMENT_RESPONSE_META_KEY in result.meta


# ============================================================================
# Hook: context objects have correct data
# ============================================================================


def test_hook_context_data():
    """Verify hook context objects carry the expected fields."""
    server = MockSyncResourceServer()
    captured_before = []
    captured_after = []
    captured_settlement = []

    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(
            on_before_execution=lambda ctx: captured_before.append(ctx) or True,
            on_after_execution=lambda ctx: captured_after.append(ctx),
            on_after_settlement=lambda ctx: captured_settlement.append(ctx),
        ),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "data"}]}

    wrapped = paid(handler)
    payload = make_payload()
    wrapped({"city": "NYC"}, make_extra(payload))

    # ServerHookContext
    before_ctx = captured_before[0]
    assert before_ctx.tool_name == "test"
    assert before_ctx.arguments == {"city": "NYC"}
    assert before_ctx.payment_requirements is not None
    assert before_ctx.payment_payload is not None

    # AfterExecutionContext
    after_ctx = captured_after[0]
    assert after_ctx.result is not None
    assert after_ctx.result.content[0]["text"] == "data"

    # SettlementContext
    settle_ctx = captured_settlement[0]
    assert settle_ctx.settlement is not None
    assert settle_ctx.settlement.success is True


# ============================================================================
# Config validation
# ============================================================================


def test_empty_accepts_raises():
    """SyncPaymentWrapperConfig with empty accepts raises ValueError."""
    with pytest.raises(ValueError, match="at least one"):
        SyncPaymentWrapperConfig(accepts=[])


def test_create_payment_wrapper_sync_empty_accepts_raises():
    """create_payment_wrapper_sync with empty config.accepts raises ValueError."""
    server = MockSyncResourceServer()
    # SyncPaymentWrapperConfig validates, so we bypass by patching
    config = Mock()
    config.accepts = []
    with pytest.raises(ValueError, match="at least one"):
        create_payment_wrapper_sync(server, config)


# ============================================================================
# Resource URL extraction from config
# ============================================================================


def test_tool_name_from_resource_url():
    """When config.resource.url starts with 'mcp://tool/', extract tool name."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        resource=ResourceInfo(
            url="mcp://tool/weather_lookup",
            description="Weather",
        ),
    )

    paid = create_payment_wrapper_sync(server, config)
    handler_contexts = []

    def handler(args, context):
        handler_contexts.append(context)
        return {"content": [{"type": "text", "text": "ok"}]}

    wrapped = paid(handler)
    wrapped({}, make_extra(make_payload()))

    # Tool context should have the extracted name
    assert handler_contexts[0].tool_name == "weather_lookup"


def test_tool_name_fallback_to_extra():
    """Without mcp:// resource URL, tool_name falls back to extra['toolName']."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)
    handler_contexts = []

    def handler(args, context):
        handler_contexts.append(context)
        return {"content": [{"type": "text", "text": "ok"}]}

    wrapped = paid(handler)
    extra = make_extra(make_payload(), tool_name="my_custom_tool")
    wrapped({}, extra)

    assert handler_contexts[0].tool_name == "my_custom_tool"


def test_tool_name_default():
    """Without toolName in extra, defaults to 'paid_tool'."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)
    handler_contexts = []

    def handler(args, context):
        handler_contexts.append(context)
        return {"content": [{"type": "text", "text": "ok"}]}

    wrapped = paid(handler)
    payload = make_payload()
    extra = {
        "_meta": {
            "x402/payment": (payload.model_dump() if hasattr(payload, "model_dump") else payload)
        },
    }
    wrapped({}, extra)

    assert handler_contexts[0].tool_name == "paid_tool"


# ============================================================================
# _create_payment_required_result_sync
# ============================================================================


def test_payment_required_result_structure():
    """_create_payment_required_result_sync returns well-formed MCPToolResult."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        resource=ResourceInfo(
            url="mcp://tool/test",
            description="Test",
            mime_type="application/json",
        ),
    )

    result = _create_payment_required_result_sync(server, "test", config, "Need payment")

    assert result.is_error is True
    assert result.structured_content is not None
    assert len(result.content) == 1
    parsed = json.loads(result.content[0]["text"])
    assert "accepts" in parsed
    assert parsed["error"] == "Need payment"


def test_payment_required_result_no_resource():
    """_create_payment_required_result_sync without resource uses defaults."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    result = _create_payment_required_result_sync(server, "my_tool", config, "Pay up")

    assert result.is_error is True
    # Verify create_payment_required_response was called with default description
    call_args = server.create_payment_required_response.call_args
    resource_info = call_args[0][1]
    assert resource_info.description == "Tool: my_tool"
    assert resource_info.mime_type == "application/json"


# ============================================================================
# _create_settlement_failed_result_sync
# ============================================================================


def test_settlement_failed_result_structure():
    """_create_settlement_failed_result_sync returns well-formed error result."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    result = _create_settlement_failed_result_sync(server, "test", config, "timeout")

    assert result.is_error is True
    assert result.structured_content is not None
    parsed = json.loads(result.content[0]["text"])
    assert parsed["x402Version"] == 2
    assert "settlement" in parsed["error"].lower()
    assert parsed[MCP_PAYMENT_RESPONSE_META_KEY]["success"] is False
    assert parsed[MCP_PAYMENT_RESPONSE_META_KEY]["errorReason"] == "timeout"


def test_settlement_failed_result_no_resource():
    """_create_settlement_failed_result_sync without resource uses defaults."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    result = _create_settlement_failed_result_sync(server, "my_tool", config, "network error")

    assert result.is_error is True
    call_args = server.create_payment_required_response.call_args
    resource_info = call_args[0][1]
    assert "mcp://tool/my_tool" in resource_info.url


# ============================================================================
# Meta result: model_dump vs raw dict
# ============================================================================


def test_settle_result_without_model_dump():
    """When settle_result lacks model_dump, it's used directly."""
    server = MockSyncResourceServer()
    raw_dict = {"success": True, "transaction": "0xraw", "network": "eip155:84532"}
    server.settle_payment = Mock(return_value=raw_dict)
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "ok"}]}

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.meta[MCP_PAYMENT_RESPONSE_META_KEY] is raw_dict


# ============================================================================
# result.meta is None before assignment
# ============================================================================


def test_result_meta_none_gets_initialized():
    """When handler returns MCPToolResult with meta=None, it gets initialized."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        r = MCPToolResult(content=[{"type": "text", "text": "ok"}])
        r.meta = None
        return r

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.meta is not None
    assert MCP_PAYMENT_RESPONSE_META_KEY in result.meta


# ============================================================================
# Hooks with no hooks configured
# ============================================================================


def test_no_hooks_configured():
    """Flow completes without hooks (config.hooks is None)."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(accepts=DEFAULT_ACCEPTS)

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "no hooks"}]}

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is False


def test_hooks_object_with_none_callbacks():
    """Flow completes when hooks object exists but all callbacks are None."""
    server = MockSyncResourceServer()
    config = SyncPaymentWrapperConfig(
        accepts=DEFAULT_ACCEPTS,
        hooks=SyncPaymentWrapperHooks(),
    )

    paid = create_payment_wrapper_sync(server, config)

    def handler(args, context):
        return {"content": [{"type": "text", "text": "empty hooks"}]}

    wrapped = paid(handler)
    result = wrapped({}, make_extra(make_payload()))

    assert result.is_error is False
    assert MCP_PAYMENT_RESPONSE_META_KEY in result.meta
