"""Sync MCP server payment wrapper for x402 integration."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from ..schemas import ResourceInfo
from ..server import x402ResourceServerSync
from .types import (
    MCP_PAYMENT_RESPONSE_META_KEY,
    AfterExecutionContext,
    MCPToolContext,
    MCPToolResult,
    ServerHookContext,
    SettlementContext,
    SyncPaymentWrapperConfig,
)
from .utils import (
    create_tool_resource_url,
    extract_payment_from_meta,
)

if TYPE_CHECKING:
    try:
        from mcp.server.fastmcp import Context as FastMCPContext
    except ImportError:  # pragma: no cover
        FastMCPContext = Any  # type: ignore[assignment,misc]

# Type alias for tool handler
ToolHandler = Callable[[dict[str, Any], MCPToolContext], MCPToolResult | dict[str, Any]]


# ============================================================================
# FastMCP Integration Helper
# ============================================================================


def _extract_meta_from_fastmcp_context(ctx: FastMCPContext | Any) -> dict[str, Any]:
    """Extract _meta dict from an MCP SDK Context object.

    The MCP SDK (both FastMCP and low-level Server) stores request metadata
    on ``ctx.request_context.meta`` (a ``RequestParams.Meta`` Pydantic model).
    This helper extracts it as a plain dict.

    Args:
        ctx: FastMCP Context object (or any object with a
            ``request_context.meta`` attribute chain).

    Returns:
        The extracted metadata as a plain dict, or an empty dict if
        extraction fails for any reason.
    """
    try:
        req_ctx = getattr(ctx, "request_context", None)
        if req_ctx is None:
            return {}
        raw_meta = getattr(req_ctx, "meta", None)
        if raw_meta is None:
            return {}
        if hasattr(raw_meta, "model_dump"):
            return raw_meta.model_dump()
        if isinstance(raw_meta, dict):
            return raw_meta
        return dict(raw_meta)
    except Exception:
        return {}


def _mcp_tool_result_to_call_tool_result(result: MCPToolResult) -> Any:
    """Convert an MCPToolResult to an MCP SDK CallToolResult.

    Imports MCP SDK types lazily to avoid hard dependency.
    """
    from mcp.types import CallToolResult, TextContent

    content = []
    for item in result.content:
        if isinstance(item, dict):
            content.append(TextContent(type="text", text=item.get("text", "")))
        else:
            content.append(TextContent(type="text", text=str(item)))

    call_result = CallToolResult(content=content, isError=result.is_error)
    if result.meta:
        call_result.meta = result.meta
    return call_result


def wrap_fastmcp_tool_sync(
    payment_wrapper: Callable[[ToolHandler], Any],
    handler: ToolHandler,
    *,
    tool_name: str | None = None,
) -> Callable[[dict[str, Any], Any], Any]:
    """Bridge a payment-wrapped tool handler to work with FastMCP.

    This helper handles the mismatch between FastMCP (which provides a Context
    object) and the x402 payment wrapper (which expects ``(args, extra)``).
    It extracts ``_meta`` from the FastMCP Context, calls the payment wrapper,
    and converts the MCPToolResult back to an MCP SDK CallToolResult.

    Usage with FastMCP::

        paid_weather = create_payment_wrapper_sync(resource_server, config)

        @mcp_server.tool()
        def get_weather(city: str, ctx: Context) -> CallToolResult:
            return paid_weather_tool({"city": city}, ctx)

        paid_weather_tool = wrap_fastmcp_tool_sync(
            paid_weather, my_handler, tool_name="get_weather",
        )

    Or more concisely::

        paid_weather = create_payment_wrapper_sync(resource_server, config)
        paid_weather_tool = wrap_fastmcp_tool_sync(
            paid_weather,
            lambda args, _: MCPToolResult(
                content=[{"type": "text", "text": json.dumps(get_data(args["city"]))}],
            ),
            tool_name="get_weather",
        )

        @mcp_server.tool()
        def get_weather(city: str, ctx: Context) -> CallToolResult:
            return paid_weather_tool({"city": city}, ctx)

    Args:
        payment_wrapper: The result of ``create_payment_wrapper_sync(resource_server, config)``
        handler: Your tool handler ``(args, MCPToolContext) -> MCPToolResult``
        tool_name: Optional explicit tool name. Falls back to the handler
            function name, then ``"paid_tool"`` as a last resort.

    Returns:
        A function ``(args, fastmcp_context) -> CallToolResult`` suitable for
        calling inside a FastMCP ``@tool()`` handler.
    """
    wrapped = payment_wrapper(handler)
    resolved_name = tool_name or getattr(handler, "__name__", "paid_tool")

    def fastmcp_bridge(args: dict[str, Any], ctx: Any) -> Any:
        meta = _extract_meta_from_fastmcp_context(ctx)
        extra = {"_meta": meta, "toolName": resolved_name}
        result = wrapped(args, extra)
        return _mcp_tool_result_to_call_tool_result(result)

    return fastmcp_bridge


def create_payment_wrapper_sync(
    resource_server: x402ResourceServerSync,
    config: SyncPaymentWrapperConfig,
) -> Callable[[ToolHandler], ToolHandler]:
    """Create a payment wrapper for MCP tool handlers.

    Returns a function that wraps tool handlers with payment logic.

    Args:
        resource_server: The x402 resource server for payment verification/settlement
        config: Payment configuration with accepts array

    Returns:
        A function that wraps tool handlers with payment logic

    Example:
        ```python
        from x402 import x402ResourceServerSync
        from x402.mcp import create_payment_wrapper, PaymentWrapperConfig

        # Create resource server
        resource_server = x402ResourceServerSync(facilitator_client)
        resource_server.register("eip155:84532", evm_server_scheme)

        # Build payment requirements
        accepts = resource_server.build_payment_requirements_from_config(config)

        # Create payment wrapper
        paid = create_payment_wrapper(
            resource_server,
            PaymentWrapperConfig(accepts=accepts),
        )

        # Use with MCP server
        @mcp_server.tool("get_weather", "Get weather", schema)
        @paid
        def handler(args, context):
            return {"content": [{"type": "text", "text": "Sunny"}]}
        ```
    """
    if not config.accepts:
        raise ValueError(
            "PaymentWrapperConfig.accepts must have at least one payment requirement"
        )

    # Return wrapper function that takes a handler and returns a wrapped handler
    def wrapper(handler: ToolHandler) -> ToolHandler:
        def wrapped_handler(
            args: dict[str, Any], extra: dict[str, Any]
        ) -> MCPToolResult:
            # Extract _meta from extra
            meta = extra.get("_meta", {})
            if not isinstance(meta, dict):
                meta = {}

            # Derive toolName from context or resource URL
            tool_name = extra.get("toolName", "paid_tool")
            if config.resource and config.resource.url:
                # Try to extract from URL
                if config.resource.url.startswith("mcp://tool/"):
                    tool_name = config.resource.url[len("mcp://tool/") :]

            # Build tool context
            tool_context = MCPToolContext(
                tool_name=tool_name,
                arguments=args,
                meta=meta,
            )

            # Extract payment from _meta
            payment_payload = extract_payment_from_meta(
                {"name": tool_name, "arguments": args, "_meta": meta}
            )

            if payment_payload is None:
                return _create_payment_required_result(
                    resource_server,
                    tool_name,
                    config,
                    "Payment required to access this tool",
                )

            # Match the client's chosen payment method against config.accepts
            payment_requirements = resource_server.find_matching_requirements(
                config.accepts, payment_payload
            )

            if payment_requirements is None:
                return _create_payment_required_result(
                    resource_server,
                    tool_name,
                    config,
                    "No matching payment requirements found",
                )

            # Verify payment
            verify_result = resource_server.verify_payment(
                payment_payload, payment_requirements
            )

            if not verify_result.is_valid:
                reason = verify_result.invalid_reason or "Payment verification failed"
                return _create_payment_required_result(
                    resource_server, tool_name, config, reason
                )

            # Build hook context
            hook_context = ServerHookContext(
                tool_name=tool_name,
                arguments=args,
                payment_requirements=payment_requirements,
                payment_payload=payment_payload,
            )

            # Run onBeforeExecution hook if present
            if config.hooks and config.hooks.on_before_execution:
                proceed = config.hooks.on_before_execution(hook_context)
                if not proceed:
                    return _create_payment_required_result(
                        resource_server, tool_name, config, "Execution blocked by hook"
                    )

            # Execute the tool handler
            handler_result = handler(args, tool_context)

            # Convert handler result to MCPToolResult if needed
            if isinstance(handler_result, dict):
                result = MCPToolResult(
                    content=handler_result.get("content", []),
                    is_error=handler_result.get("isError", False),
                    meta=handler_result.get("_meta", {}),
                    structured_content=handler_result.get("structuredContent"),
                )
            elif isinstance(handler_result, MCPToolResult):
                result = handler_result
            else:
                # Try to convert
                result = MCPToolResult(
                    content=[{"type": "text", "text": str(handler_result)}],
                    is_error=False,
                )

            # Build after execution context
            after_exec_context = AfterExecutionContext(
                tool_name=tool_name,
                arguments=args,
                payment_requirements=payment_requirements,
                payment_payload=payment_payload,
                result=result,
            )

            # Run onAfterExecution hook if present
            if config.hooks and config.hooks.on_after_execution:
                try:
                    config.hooks.on_after_execution(after_exec_context)
                except Exception:
                    # Log but continue
                    pass

            # If tool returned error, don't settle
            if result.is_error:
                return result

            # Settle payment
            try:
                settle_result = resource_server.settle_payment(
                    payment_payload, payment_requirements
                )
            except Exception as e:
                return _create_settlement_failed_result(
                    resource_server, tool_name, config, str(e)
                )

            # Run onAfterSettlement hook if present
            if config.hooks and config.hooks.on_after_settlement:
                settlement_context = SettlementContext(
                    tool_name=tool_name,
                    arguments=args,
                    payment_requirements=payment_requirements,
                    payment_payload=payment_payload,
                    settlement=settle_result,
                )
                try:
                    config.hooks.on_after_settlement(settlement_context)
                except Exception:
                    # Log but continue
                    pass

            # Return result with settlement in _meta
            if result.meta is None:
                result.meta = {}
            result.meta[MCP_PAYMENT_RESPONSE_META_KEY] = (
                settle_result.model_dump(by_alias=True)
                if hasattr(settle_result, "model_dump")
                else settle_result
            )

            return result

        return wrapped_handler

    return wrapper


def _create_payment_required_result(
    resource_server: x402ResourceServerSync,
    tool_name: str,
    config: SyncPaymentWrapperConfig,
    error_message: str,
) -> MCPToolResult:
    """Create a 402 payment required result.

    Args:
        resource_server: Resource server for creating payment required response
        tool_name: Name of the tool for resource URL
        config: Payment wrapper configuration
        error_message: Error message describing why payment is required

    Returns:
        Structured 402 error result with payment requirements
    """
    resource_info = ResourceInfo(
        url=create_tool_resource_url(
            tool_name, config.resource.url if config.resource else None
        ),
        description=(
            config.resource.description if config.resource else f"Tool: {tool_name}"
        ),
        mime_type=config.resource.mime_type if config.resource else "application/json",
    )

    payment_required = resource_server.create_payment_required_response(
        config.accepts,
        resource_info,
        error_message,
    )

    # Convert to dict for structuredContent (camelCase for wire format)
    payment_required_dict = (
        payment_required.model_dump(by_alias=True)
        if hasattr(payment_required, "model_dump")
        else payment_required
    )

    # Create content text
    content_text = json.dumps(payment_required_dict)

    return MCPToolResult(
        structured_content=payment_required_dict,
        content=[{"type": "text", "text": content_text}],
        is_error=True,
    )


def _create_settlement_failed_result(
    resource_server: x402ResourceServerSync,
    tool_name: str,
    config: SyncPaymentWrapperConfig,
    error_message: str,
) -> MCPToolResult:
    """Create a 402 settlement failed result.

    Args:
        resource_server: Resource server for creating payment required response
        tool_name: Name of the tool for resource URL
        config: Payment wrapper configuration
        error_message: Error message describing settlement failure

    Returns:
        Structured 402 error result with settlement failure details
    """
    resource_info = ResourceInfo(
        url=create_tool_resource_url(
            tool_name, config.resource.url if config.resource else None
        ),
        description=(
            config.resource.description if config.resource else f"Tool: {tool_name}"
        ),
        mime_type=config.resource.mime_type if config.resource else "application/json",
    )

    payment_required = resource_server.create_payment_required_response(
        config.accepts,
        resource_info,
        f"Payment settlement failed: {error_message}",
    )

    settlement_failure = {
        "success": False,
        "errorReason": error_message,
        "transaction": "",
        "network": config.accepts[0].network,
    }

    # Merge paymentRequired with settlement failure (camelCase for wire format)
    error_data = (
        payment_required.model_dump(by_alias=True)
        if hasattr(payment_required, "model_dump")
        else payment_required
    )
    error_data[MCP_PAYMENT_RESPONSE_META_KEY] = settlement_failure

    content_text = json.dumps(error_data)

    return MCPToolResult(
        structured_content=error_data,
        content=[{"type": "text", "text": content_text}],
        is_error=True,
    )
