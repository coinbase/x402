"""MCP (Model Context Protocol) transport integration for the x402 payment protocol.

This package enables paid tool calls in MCP servers and automatic payment handling in MCP clients.

Python is async-first -- the default classes are async:
    - ``x402MCPClient`` / ``create_payment_wrapper`` for asyncio usage (default)
    - ``x402MCPClientSync`` / ``create_payment_wrapper_sync`` for synchronous usage

Convenience Re-exports:
    This package re-exports commonly used types from the x402 core package for convenience.

    ```python
    from x402.mcp import (
        # Async client / server (default)
        x402MCPClient,
        create_payment_wrapper,
        # Sync client / server
        x402MCPClientSync,
        create_payment_wrapper_sync,
        # Core types (re-exported)
        PaymentPayload,
        PaymentRequired,
        PaymentRequirements,
        SettleResponse,
        Network,
    )
    ```
"""

# Async client (default)
# Sync client
from .client import (
    create_x402_mcp_client_from_config_sync,
    create_x402_mcp_client_sync,
    wrap_mcp_client_with_payment_from_config_sync,
    wrap_mcp_client_with_payment_sync,
    x402MCPClientSync,
)
from .client_async import (
    AfterPaymentHook,
    BeforePaymentHook,
    # Async hook types (accept both sync and async callables)
    PaymentRequiredHook,
    create_x402_mcp_client,
    create_x402_mcp_client_from_config,
    wrap_mcp_client_with_payment,
    wrap_mcp_client_with_payment_from_config,
    x402MCPClient,
)

# Sync server
from .server import create_payment_wrapper_sync, wrap_fastmcp_tool_sync

# Async server (default)
from .server_async import (
    AfterExecutionHook,
    AfterSettlementHook,
    # Async server hook types (accept both sync and async callables)
    BeforeExecutionHook,
    PaymentWrapperConfig,
    PaymentWrapperHooks,
    create_payment_wrapper,
    wrap_fastmcp_tool,
)

# Types
from .types import (
    MCP_PAYMENT_META_KEY,
    MCP_PAYMENT_REQUIRED_CODE,
    MCP_PAYMENT_RESPONSE_META_KEY,
    AfterExecutionContext,
    AfterPaymentContext,
    DynamicPayTo,
    DynamicPrice,
    MCPToolCallResult,
    MCPToolContext,
    MCPToolResult,
    PaymentRequiredContext,
    PaymentRequiredError,
    PaymentRequiredHookResult,
    ResourceInfo,
    ServerHookContext,
    SettlementContext,
    SyncAfterExecutionHook,
    SyncAfterPaymentHook,
    SyncAfterSettlementHook,
    SyncBeforeExecutionHook,
    SyncBeforePaymentHook,
    SyncPaymentRequiredHook,
    # Sync hook types
    SyncPaymentWrapperConfig,
    SyncPaymentWrapperHooks,
)

# Utilities
from .utils import (
    attach_payment_response_to_meta,
    attach_payment_to_meta,
    convert_mcp_result,
    create_payment_required_error,
    create_tool_resource_url,
    extract_payment_from_meta,
    extract_payment_required_from_error,
    extract_payment_required_from_result,
    extract_payment_response_from_meta,
    is_object,
    is_payment_required_error,
    register_schemes,
)

__all__ = [
    # Client (async, default)
    "x402MCPClient",
    "create_x402_mcp_client",
    "create_x402_mcp_client_from_config",
    "wrap_mcp_client_with_payment",
    "wrap_mcp_client_with_payment_from_config",
    "PaymentRequiredHook",
    "BeforePaymentHook",
    "AfterPaymentHook",
    # Client (sync)
    "x402MCPClientSync",
    "create_x402_mcp_client_sync",
    "create_x402_mcp_client_from_config_sync",
    "wrap_mcp_client_with_payment_sync",
    "wrap_mcp_client_with_payment_from_config_sync",
    "SyncPaymentRequiredHook",
    "SyncBeforePaymentHook",
    "SyncAfterPaymentHook",
    # Server (async, default)
    "create_payment_wrapper",
    "wrap_fastmcp_tool",
    "PaymentWrapperConfig",
    "PaymentWrapperHooks",
    "BeforeExecutionHook",
    "AfterExecutionHook",
    "AfterSettlementHook",
    # Server (sync)
    "create_payment_wrapper_sync",
    "wrap_fastmcp_tool_sync",
    "SyncPaymentWrapperConfig",
    "SyncPaymentWrapperHooks",
    "SyncBeforeExecutionHook",
    "SyncAfterExecutionHook",
    "SyncAfterSettlementHook",
    # Constants
    "MCP_PAYMENT_META_KEY",
    "MCP_PAYMENT_REQUIRED_CODE",
    "MCP_PAYMENT_RESPONSE_META_KEY",
    # Types
    "ResourceInfo",
    "MCPToolContext",
    "MCPToolResult",
    "MCPToolCallResult",
    "PaymentRequiredContext",
    "PaymentRequiredHookResult",
    "PaymentRequiredError",
    "ServerHookContext",
    "AfterExecutionContext",
    "SettlementContext",
    "AfterPaymentContext",
    # Dynamic pricing types
    "DynamicPayTo",
    "DynamicPrice",
    # Utilities
    "is_payment_required_error",
    "create_payment_required_error",
    "extract_payment_required_from_error",
    "extract_payment_from_meta",
    "attach_payment_to_meta",
    "extract_payment_response_from_meta",
    "attach_payment_response_to_meta",
    "extract_payment_required_from_result",
    "create_tool_resource_url",
    "convert_mcp_result",
    "register_schemes",
    "is_object",
]

# ============================================================================
# Convenience Re-exports from x402 core
# ============================================================================

# Re-export client classes
try:
    from .. import x402Client as x402ClientAsync  # noqa: F401 (re-export)
    from .. import x402ClientSync  # noqa: F401 (re-export)

    __all__.extend(["x402ClientSync", "x402ClientAsync"])
except ImportError:
    pass

# Re-export server classes
try:
    from ..server import (  # noqa: F401 (re-export)
        x402ResourceServer as x402ResourceServerAsync,
    )
    from ..server import x402ResourceServerSync  # noqa: F401 (re-export)

    __all__.extend(["x402ResourceServerSync", "x402ResourceServerAsync"])
except ImportError:
    pass

# Re-export core types from schemas
from ..schemas import (  # noqa: F401 (re-export)
    Network,
    PaymentPayload,
    PaymentRequired,
    PaymentRequirements,
    SettleResponse,
)

__all__.extend(
    [
        "Network",
        "PaymentPayload",
        "PaymentRequired",
        "PaymentRequirements",
        "SettleResponse",
    ]
)

# Re-export interfaces (Protocol types for type hints)
try:
    from ..interfaces import (  # noqa: F401 (re-export)
        SchemeNetworkClient,
        SchemeNetworkClientV1,
        SchemeNetworkServer,
        SchemeNetworkServerV1,
    )

    __all__.extend(
        [
            "SchemeNetworkClient",
            "SchemeNetworkClientV1",
            "SchemeNetworkServer",
            "SchemeNetworkServerV1",
        ]
    )
except ImportError:
    pass

__all__.extend(
    [
        "PaymentPayload",
        "PaymentRequired",
        "PaymentRequirements",
        "SettleResponse",
        "Network",
    ]
)
