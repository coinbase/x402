"""MCP client wrapper with x402 payment handling."""

from __future__ import annotations

import json
from typing import Any, Callable, Optional

from ..schemas import PaymentPayload, PaymentRequired, SettleResponse
from .types import (
    AfterPaymentContext,
    AfterPaymentHook,
    BeforePaymentHook,
    MCPToolCallResult,
    MCPToolContext,
    MCPToolResult,
    PaymentRequiredContext,
    PaymentRequiredHook,
    PaymentRequiredHookResult,
    PaymentRequiredError,
)
from .utils import (
    attach_payment_to_meta,
    extract_payment_required_from_result,
    extract_payment_response_from_meta,
)


class x402MCPClient:
    """x402-enabled MCP client that handles payment for tool calls.

    Wraps an MCP client to automatically detect 402 (payment required) errors
    from tool calls, create payment payloads, and retry with payment attached.

    Example:
        ```python
        from x402 import x402ClientSync
        from x402.mcp import x402MCPClient
        from x402.mechanisms.evm.exact import ExactEvmClientScheme

        # Create x402 payment client
        payment_client = x402ClientSync()
        payment_client.register("eip155:84532", ExactEvmClientScheme(signer))

        # Wrap MCP client
        x402_mcp = x402MCPClient(mcp_client, payment_client, auto_payment=True)

        # Call tools - payment handled automatically
        result = x402_mcp.call_tool("get_weather", {"city": "NYC"})
        ```
    """

    def __init__(
        self,
        mcp_client: Any,  # MCP SDK client
        payment_client: Any,  # x402Client or x402ClientSync
        *,
        auto_payment: bool = True,
        on_payment_requested: Optional[
            Callable[[PaymentRequiredContext], bool]
        ] = None,
    ):
        """Initialize x402 MCP client.

        Args:
            mcp_client: Underlying MCP SDK client
            payment_client: x402 payment client (sync or async)
            auto_payment: Whether to automatically create and submit payment
            on_payment_requested: Optional callback for payment approval
        """
        self._mcp_client = mcp_client
        self._payment_client = payment_client
        self._auto_payment = auto_payment
        self._on_payment_requested = on_payment_requested
        self._payment_required_hooks: list[PaymentRequiredHook] = []
        self._before_payment_hooks: list[BeforePaymentHook] = []
        self._after_payment_hooks: list[AfterPaymentHook] = []

    @property
    def client(self) -> Any:
        """Get underlying MCP client."""
        return self._mcp_client

    @property
    def payment_client(self) -> Any:
        """Get underlying x402 payment client."""
        return self._payment_client

    def on_payment_required(
        self, hook: PaymentRequiredHook
    ) -> "x402MCPClient":
        """Register a hook for payment required events.

        Args:
            hook: Hook function

        Returns:
            Self for chaining
        """
        self._payment_required_hooks.append(hook)
        return self

    def on_before_payment(self, hook: BeforePaymentHook) -> "x402MCPClient":
        """Register a hook before payment creation.

        Args:
            hook: Hook function

        Returns:
            Self for chaining
        """
        self._before_payment_hooks.append(hook)
        return self

    def on_after_payment(self, hook: AfterPaymentHook) -> "x402MCPClient":
        """Register a hook after payment submission.

        Args:
            hook: Hook function

        Returns:
            Self for chaining
        """
        self._after_payment_hooks.append(hook)
        return self

    def call_tool(
        self,
        name: str,
        args: dict[str, Any],
        **kwargs: Any,
    ) -> MCPToolCallResult:
        """Call a tool with automatic payment handling.

        Args:
            name: Tool name
            args: Tool arguments
            **kwargs: Additional MCP client options

        Returns:
            Tool call result with payment metadata

        Raises:
            PaymentRequiredError: If payment required but auto_payment disabled
        """
        # First attempt without payment
        call_params = {"name": name, "arguments": args}
        result = self._call_mcp_tool(call_params, **kwargs)

        # Check if this is a payment required response
        payment_required = extract_payment_required_from_result(result)

        if payment_required is None:
            # Free tool - return as-is
            return MCPToolCallResult(
                content=result.content,
                is_error=result.is_error,
                payment_made=False,
            )

        # Payment required - run hooks first
        payment_required_context = PaymentRequiredContext(
            tool_name=name,
            arguments=args,
            payment_required=payment_required,
        )

        # Run payment required hooks
        for hook in self._payment_required_hooks:
            hook_result = hook(payment_required_context)
            if hook_result:
                if hook_result.abort:
                    raise PaymentRequiredError(
                        "Payment aborted by hook", payment_required
                    )
                if hook_result.payment:
                    return self.call_tool_with_payment(
                        name, args, hook_result.payment, **kwargs
                    )

        # No hook handled it, proceed with normal flow
        if not self._auto_payment:
            raise PaymentRequiredError(
                "Payment required", payment_required
            )

        # Check if payment is approved
        if self._on_payment_requested:
            approved = self._on_payment_requested(payment_required_context)
            if not approved:
                raise PaymentRequiredError(
                    "Payment request denied", payment_required
                )

        # Run before payment hooks
        for hook in self._before_payment_hooks:
            hook(payment_required_context)

        # Create payment payload
        payment_payload = self._payment_client.create_payment_payload(
            payment_required
        )

        # Retry with payment
        return self.call_tool_with_payment(name, args, payment_payload, **kwargs)

    def call_tool_with_payment(
        self,
        name: str,
        args: dict[str, Any],
        payload: PaymentPayload,
        **kwargs: Any,
    ) -> MCPToolCallResult:
        """Call a tool with explicit payment payload.

        Args:
            name: Tool name
            args: Tool arguments
            payload: Payment payload
            **kwargs: Additional MCP client options

        Returns:
            Tool call result with payment metadata
        """
        # Build call params with payment in _meta
        call_params = attach_payment_to_meta(
            {"name": name, "arguments": args}, payload
        )

        # Call with payment
        result = self._call_mcp_tool(call_params, **kwargs)

        # Extract payment response
        settle_response = extract_payment_response_from_meta(result)

        # Run after payment hooks
        after_context = AfterPaymentContext(
            tool_name=name,
            payment_payload=payload,
            result=result,
            settle_response=settle_response,
        )
        for hook in self._after_payment_hooks:
            hook(after_context)

        return MCPToolCallResult(
            content=result.content,
            is_error=result.is_error,
            payment_response=settle_response,
            payment_made=True,
        )

    def get_tool_payment_requirements(
        self,
        name: str,
        args: dict[str, Any],
        **kwargs: Any,
    ) -> Optional[PaymentRequired]:
        """Probe a tool to discover its payment requirements.

        WARNING: This actually calls the tool, so it may have side effects.

        Args:
            name: Tool name
            args: Tool arguments
            **kwargs: Additional MCP client options

        Returns:
            PaymentRequired if found, None otherwise
        """
        call_params = {"name": name, "arguments": args}
        result = self._call_mcp_tool(call_params, **kwargs)
        return extract_payment_required_from_result(result)

    def _call_mcp_tool(
        self, params: dict[str, Any], **kwargs: Any
    ) -> MCPToolResult:
        """Call underlying MCP client tool method.

        Args:
            params: Tool call parameters
            **kwargs: Additional options

        Returns:
            MCP tool result
        """
        # Call the underlying MCP client's call_tool method
        # This assumes the MCP SDK has a call_tool method
        mcp_result = self._mcp_client.call_tool(params, **kwargs)

        # Convert to our MCPToolResult format
        return self._convert_mcp_result(mcp_result)

    def _convert_mcp_result(self, mcp_result: Any) -> MCPToolResult:
        """Convert MCP SDK result to our format.

        Args:
            mcp_result: Raw MCP SDK result

        Returns:
            MCPToolResult
        """
        # Extract content
        content = getattr(mcp_result, "content", [])
        if not isinstance(content, list):
            content = []

        # Extract is_error
        is_error = getattr(mcp_result, "isError", False)

        # Extract meta
        meta = getattr(mcp_result, "_meta", {})
        if not isinstance(meta, dict):
            meta = {}

        # Extract structuredContent
        structured_content = getattr(mcp_result, "structuredContent", None)

        return MCPToolResult(
            content=content,
            is_error=is_error,
            meta=meta,
            structured_content=structured_content,
        )

    # Passthrough methods - forward to underlying MCP client

    def connect(self, transport: Any) -> None:
        """Connect to an MCP server transport."""
        if hasattr(self._mcp_client, "connect"):
            self._mcp_client.connect(transport)

    def close(self) -> None:
        """Close the MCP connection."""
        if hasattr(self._mcp_client, "close"):
            self._mcp_client.close()

    def list_tools(self) -> Any:
        """List available tools from the server."""
        if hasattr(self._mcp_client, "list_tools"):
            return self._mcp_client.list_tools()
        raise NotImplementedError("MCP client does not support list_tools")

    def list_resources(self) -> Any:
        """List available resources from the server."""
        if hasattr(self._mcp_client, "list_resources"):
            return self._mcp_client.list_resources()
        raise NotImplementedError("MCP client does not support list_resources")

    def read_resource(self, uri: str) -> Any:
        """Read a resource from the server."""
        if hasattr(self._mcp_client, "read_resource"):
            return self._mcp_client.read_resource(uri)
        raise NotImplementedError("MCP client does not support read_resource")

    def list_resource_templates(self) -> Any:
        """List resource templates from the server."""
        if hasattr(self._mcp_client, "list_resource_templates"):
            return self._mcp_client.list_resource_templates()
        raise NotImplementedError("MCP client does not support list_resource_templates")

    def subscribe_resource(self, uri: str) -> None:
        """Subscribe to resource updates."""
        if hasattr(self._mcp_client, "subscribe_resource"):
            self._mcp_client.subscribe_resource(uri)
        else:
            raise NotImplementedError("MCP client does not support subscribe_resource")

    def unsubscribe_resource(self, uri: str) -> None:
        """Unsubscribe from resource updates."""
        if hasattr(self._mcp_client, "unsubscribe_resource"):
            self._mcp_client.unsubscribe_resource(uri)
        else:
            raise NotImplementedError("MCP client does not support unsubscribe_resource")

    def list_prompts(self) -> Any:
        """List available prompts from the server."""
        if hasattr(self._mcp_client, "list_prompts"):
            return self._mcp_client.list_prompts()
        raise NotImplementedError("MCP client does not support list_prompts")

    def get_prompt(self, name: str) -> Any:
        """Get a specific prompt from the server."""
        if hasattr(self._mcp_client, "get_prompt"):
            return self._mcp_client.get_prompt(name)
        raise NotImplementedError("MCP client does not support get_prompt")

    def ping(self) -> None:
        """Ping the server."""
        if hasattr(self._mcp_client, "ping"):
            self._mcp_client.ping()
        else:
            raise NotImplementedError("MCP client does not support ping")

    def complete(self, prompt: str, cursor: int) -> Any:
        """Request completion suggestions."""
        if hasattr(self._mcp_client, "complete"):
            return self._mcp_client.complete(prompt, cursor)
        raise NotImplementedError("MCP client does not support complete")

    def set_logging_level(self, level: str) -> None:
        """Set the logging level on the server."""
        if hasattr(self._mcp_client, "set_logging_level"):
            self._mcp_client.set_logging_level(level)
        else:
            raise NotImplementedError("MCP client does not support set_logging_level")

    def get_server_capabilities(self) -> Any:
        """Get server capabilities after initialization."""
        if hasattr(self._mcp_client, "get_server_capabilities"):
            return self._mcp_client.get_server_capabilities()
        raise NotImplementedError("MCP client does not support get_server_capabilities")

    def get_server_version(self) -> Any:
        """Get server version information after initialization."""
        if hasattr(self._mcp_client, "get_server_version"):
            return self._mcp_client.get_server_version()
        raise NotImplementedError("MCP client does not support get_server_version")

    def get_instructions(self) -> str:
        """Get server instructions after initialization."""
        if hasattr(self._mcp_client, "get_instructions"):
            return self._mcp_client.get_instructions()
        raise NotImplementedError("MCP client does not support get_instructions")

    def send_roots_list_changed(self) -> None:
        """Send notification that roots list has changed."""
        if hasattr(self._mcp_client, "send_roots_list_changed"):
            self._mcp_client.send_roots_list_changed()
        else:
            raise NotImplementedError("MCP client does not support send_roots_list_changed")


def create_x402_mcp_client(
    mcp_client: Any,
    payment_client: Any,
    *,
    auto_payment: bool = True,
    on_payment_requested: Optional[
        Callable[[PaymentRequiredContext], bool]
    ] = None,
) -> x402MCPClient:
    """Create a new x402MCPClient instance.

    Args:
        mcp_client: Underlying MCP SDK client
        payment_client: x402 payment client
        auto_payment: Whether to automatically create and submit payment
        on_payment_requested: Optional callback for payment approval

    Returns:
        x402MCPClient instance
    """
    return x402MCPClient(
        mcp_client,
        payment_client,
        auto_payment=auto_payment,
        on_payment_requested=on_payment_requested,
    )


def create_x402_mcp_client_from_config(
    mcp_client: Any,
    config: dict[str, Any],
) -> x402MCPClient:
    """Create a fully configured x402 MCP client from a config object.

    This factory function provides the simplest way to create an x402-enabled MCP client.
    It handles creation of the x402Client from scheme registrations, making it
    easy to get started with paid tool calls.

    Args:
        mcp_client: Underlying MCP SDK client (must be created separately)
        config: Configuration dictionary with:
            - schemes: List of scheme registrations (required)
            - auto_payment: Whether to automatically create and submit payment (default: True)
            - on_payment_requested: Optional callback for payment approval

    Returns:
        x402MCPClient instance

    Example:
        ```python
        from x402.mcp import create_x402_mcp_client_from_config
        from x402.mechanisms.evm.exact import ExactEvmClientScheme

        mcp_client = # ... create MCP client from SDK

        x402_mcp = create_x402_mcp_client_from_config(
            mcp_client,
            {
                "schemes": [
                    {"network": "eip155:84532", "client": ExactEvmClientScheme(signer)},
                ],
                "auto_payment": True,
                "on_payment_requested": lambda ctx: True,  # Auto-approve
            },
        )
        ```
    """
    from .. import x402ClientSync

    schemes = config.get("schemes", [])
    auto_payment = config.get("auto_payment", True)
    on_payment_requested = config.get("on_payment_requested")

    # Create payment client
    payment_client = x402ClientSync()

    # Register schemes
    for scheme in schemes:
        network = scheme["network"]
        client_scheme = scheme["client"]
        x402_version = scheme.get("x402_version", 2)

        if x402_version == 1:
            payment_client.register_v1(network, client_scheme)
        else:
            payment_client.register(network, client_scheme)

    return x402MCPClient(
        mcp_client,
        payment_client,
        auto_payment=auto_payment,
        on_payment_requested=on_payment_requested,
    )


def wrap_mcp_client_with_payment(
    mcp_client: Any,
    payment_client: Any,
    *,
    auto_payment: bool = True,
    on_payment_requested: Optional[
        Callable[[PaymentRequiredContext], bool]
    ] = None,
) -> x402MCPClient:
    """Wrap an existing MCP client with x402 payment handling.

    This is a convenience function that creates an x402MCPClient from an existing
    MCP client and payment client.

    Args:
        mcp_client: Existing MCP SDK client
        payment_client: x402 payment client (sync or async)
        auto_payment: Whether to automatically create and submit payment
        on_payment_requested: Optional callback for payment approval

    Returns:
        x402MCPClient instance

    Example:
        ```python
        from x402 import x402ClientSync
        from x402.mcp import wrap_mcp_client_with_payment

        mcp_client = # ... existing MCP client
        payment_client = x402ClientSync()
        payment_client.register("eip155:84532", evm_scheme)

        x402_mcp = wrap_mcp_client_with_payment(
            mcp_client,
            payment_client,
            auto_payment=True,
        )
        ```
    """
    return x402MCPClient(
        mcp_client,
        payment_client,
        auto_payment=auto_payment,
        on_payment_requested=on_payment_requested,
    )


def wrap_mcp_client_with_payment_from_config(
    mcp_client: Any,
    schemes: list[dict[str, Any]],
    *,
    auto_payment: bool = True,
    on_payment_requested: Optional[
        Callable[[PaymentRequiredContext], bool]
    ] = None,
) -> x402MCPClient:
    """Wrap an existing MCP client with x402 payment handling using scheme registrations.

    Similar to wrap_mcp_client_with_payment but uses scheme registrations directly.

    Args:
        mcp_client: Existing MCP SDK client
        schemes: List of scheme registrations, each with 'network' and 'client' keys
        auto_payment: Whether to automatically create and submit payment
        on_payment_requested: Optional callback for payment approval

    Returns:
        x402MCPClient instance

    Example:
        ```python
        from x402 import x402ClientSync
        from x402.mcp import wrap_mcp_client_with_payment_from_config
        from x402.mechanisms.evm.exact import ExactEvmClientScheme

        mcp_client = # ... existing MCP client

        x402_mcp = wrap_mcp_client_with_payment_from_config(
            mcp_client,
            schemes=[
                {"network": "eip155:84532", "client": ExactEvmClientScheme(signer)},
            ],
            auto_payment=True,
        )
        ```
    """
    from .. import x402ClientSync

    payment_client = x402ClientSync()
    for scheme in schemes:
        network = scheme["network"]
        client_scheme = scheme["client"]
        x402_version = scheme.get("x402_version", 2)

        if x402_version == 1:
            payment_client.register_v1(network, client_scheme)
        else:
            payment_client.register(network, client_scheme)

    return x402MCPClient(
        mcp_client,
        payment_client,
        auto_payment=auto_payment,
        on_payment_requested=on_payment_requested,
    )
