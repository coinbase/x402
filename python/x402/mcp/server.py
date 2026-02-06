"""MCP server payment wrapper for x402 integration."""

from __future__ import annotations

import json
from typing import Any, Callable, Optional

from ..schemas import PaymentPayload, PaymentRequirements, ResourceInfo, SettleResponse
from .types import MCPToolContext
from ..server import x402ResourceServerSync
from .types import (
    AfterExecutionContext,
    AfterExecutionHook,
    AfterSettlementHook,
    MCPToolContext,
    MCPToolResult,
    PaymentWrapperConfig,
    PaymentWrapperHooks,
    ServerHookContext,
    SettlementContext,
)
from .utils import (
    create_tool_resource_url,
    extract_payment_from_meta,
)


# Type alias for tool handler
ToolHandler = Callable[
    [dict[str, Any], MCPToolContext], MCPToolResult | dict[str, Any]
]


def create_payment_wrapper(
    resource_server: x402ResourceServerSync,
    config: PaymentWrapperConfig,
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
        raise ValueError("PaymentWrapperConfig.accepts must have at least one payment requirement")

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
            payment_payload = extract_payment_from_meta({"name": tool_name, "arguments": args, "_meta": meta})

            if payment_payload is None:
                return _create_payment_required_result(
                    resource_server, tool_name, config, "Payment required to access this tool"
                )

            # Use first payment requirement
            payment_requirements = config.accepts[0]

            # Verify payment
            verify_result = resource_server.verify_payment(payment_payload, payment_requirements)

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
            result.meta["x402/payment-response"] = (
                settle_result.model_dump()
                if hasattr(settle_result, "model_dump")
                else settle_result
            )

            return result

        return wrapped_handler

    return wrapper


def _create_payment_required_result(
    resource_server: x402ResourceServerSync,
    tool_name: str,
    config: PaymentWrapperConfig,
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
        url=create_tool_resource_url(tool_name, config.resource.url if config.resource else None),
        description=config.resource.description if config.resource else f"Tool: {tool_name}",
        mime_type=config.resource.mime_type if config.resource else "application/json",
    )

    payment_required = resource_server.create_payment_required_response(
        config.accepts,
        resource_info,
        error_message,
    )

    # Convert to dict for structuredContent
    payment_required_dict = (
        payment_required.model_dump()
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
    config: PaymentWrapperConfig,
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
        url=create_tool_resource_url(tool_name, config.resource.url if config.resource else None),
        description=config.resource.description if config.resource else f"Tool: {tool_name}",
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

    # Merge paymentRequired with settlement failure
    error_data = (
        payment_required.model_dump()
        if hasattr(payment_required, "model_dump")
        else payment_required
    )
    error_data["x402/payment-response"] = settlement_failure

    content_text = json.dumps(error_data)

    return MCPToolResult(
        structured_content=error_data,
        content=[{"type": "text", "text": content_text}],
        is_error=True,
    )
